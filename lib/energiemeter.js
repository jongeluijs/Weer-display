// Persistente SSE-client voor de ESPHome DSMR-meter.
// Verbindt met http://<host>/events en verzamelt sensor-states.
// Houdt in-memory: laatste snapshot + ringbuffer met samples voor live grafiek.

import http from 'node:http';

const RECONNECT_MS = 5_000;
const SAMPLE_INTERVAL_MS = 10_000; // 1 punt per 10s voor live grafiek
const RING_MINUTES = 60;
const RING_SIZE = (RING_MINUTES * 60_000) / SAMPLE_INTERVAL_MS; // 360

// Voor de gas-rate berekenen we Δm³ over een glijdend venster van 6 minuten.
// DSMR zendt gasstanden elke 5 min, dus 6 min garandeert minstens één tik.
const GAS_SAMPLE_INTERVAL_MS = 10_000;
const GAS_WINDOW_MS = 6 * 60_000;
const GAS_RING_SIZE = GAS_WINDOW_MS / GAS_SAMPLE_INTERVAL_MS; // 36

// Mapping van ESPHome sensor-id → snapshot-veld.
// Single-phase aansluiting → alleen phase 1.
// Diagnose-velden (uptime/ip/version/failures) komen mee via dezelfde SSE-stream;
// extra meter-belasting is dus 0.
const SENSOR_MAP = {
  'sensor-power_consumed': 'power_kw',
  'sensor-energy_consumed_tariff_1': 'energy_t1_kwh',
  'sensor-energy_consumed_tariff_2': 'energy_t2_kwh',
  'sensor-voltage_phase_1': 'voltage_v',
  'sensor-current_phase_1': 'current_a',
  'sensor-gas_consumed': 'gas_m3',
  'sensor-energiemeter_wi-fi_signal': 'wifi_dbm',
  'sensor-energiemeter_uptime': 'uptime_s',
  'sensor-electricity_failures': 'power_failures',
  'sensor-long_electricity_failures': 'power_long_failures',
  'text_sensor-dsmr_identification': 'meter_id',
  'text_sensor-dsmr_version': 'dsmr_version',
  'text_sensor-energiemeter_ip_address': 'ip_address',
  'text_sensor-esphome_version': 'esphome_version',
};

export function createEnergiemeter({ host = 'energiemeter.local', port = 80 } = {}) {
  const snapshot = {
    fetchedAt: null,
    connected: false,
    online_since_at: null, // ISO-tijdstip waarop SSE-verbinding voor het laatst online ging
    power_kw: null,
    energy_t1_kwh: null,
    energy_t2_kwh: null,
    voltage_v: null,
    current_a: null,
    gas_m3: null,
    wifi_dbm: null,
    uptime_s: null,
    power_failures: null,
    power_long_failures: null,
    meter_id: null,
    dsmr_version: null,
    ip_address: null,
    esphome_version: null,
  };

  // Onbekende sensor-IDs die we tijdens runtime tegenkomen — één keer loggen
  // zodat we eventuele afwijkingen in device-naam kunnen detecteren zonder de
  // logs te overspoelen.
  const unknownSeen = new Set();

  // Stroomstoringstellers staan in het non-volatile geheugen van de meter en
  // tellen lifetime. Wij houden hier een baseline bij (eerste waarde die we
  // zien na server-start) zodat de UI een delta + tijdstip van de laatste
  // toename kan tonen — pas dán is de teller actionable.
  const failureTracker = {
    short: { baseline: null, delta: 0, lastAt: null },
    long: { baseline: null, delta: 0, lastAt: null },
  };

  function trackFailure(kind, prev, value) {
    const t = failureTracker[kind];
    if (!Number.isFinite(value)) return;
    // Eerste meting → baseline. Bij meter-reset (waarde lager dan baseline)
    // resetten we ook → voorkomt negatieve delta's.
    if (t.baseline == null || value < t.baseline) {
      t.baseline = value;
      t.delta = 0;
      return;
    }
    if (Number.isFinite(prev) && value > prev) {
      t.lastAt = new Date().toISOString();
    }
    t.delta = value - t.baseline;
  }

  // Markeer connect/disconnect en houd "sinds wanneer online" bij. Reset bij
  // disconnect zodat de UI direct ziet dat we offline zijn gegaan.
  function setConnected(value) {
    if (value === snapshot.connected) return;
    snapshot.connected = value;
    snapshot.online_since_at = value ? new Date().toISOString() : null;
  }

  // Subscribers voor live SSE-doorvoer naar browsers
  const subscribers = new Set();

  // Ringbuffer met { ts, power_kw }
  const ring = [];
  let lastSampleAt = 0;

  // Aparte gas-ringbuffer: cumulatieve meterstand elke 10s. Δ over het hele
  // venster (eerste vs laatste sample) → gemiddeld m³/uur.
  const gasRing = [];
  let gasSampler = null;

  // Laatste energie-totaal (T1+T2) — gebruikt door history-laag voor delta's
  function totalEnergyKwh() {
    const t1 = Number.isFinite(snapshot.energy_t1_kwh) ? snapshot.energy_t1_kwh : null;
    const t2 = Number.isFinite(snapshot.energy_t2_kwh) ? snapshot.energy_t2_kwh : null;
    if (t1 != null && t2 != null) return t1 + t2;
    if (t1 != null) return t1;
    if (t2 != null) return t2;
    return null;
  }

  function sampleIfDue() {
    const now = Date.now();
    if (now - lastSampleAt < SAMPLE_INTERVAL_MS) return;
    lastSampleAt = now;
    const p = Number(snapshot.power_kw);
    if (!Number.isFinite(p)) return;
    ring.push({ ts: now, power_w: Math.round(p * 1000) });
    while (ring.length > RING_SIZE) ring.shift();
  }

  function sampleGas() {
    const m3 = Number(snapshot.gas_m3);
    if (!Number.isFinite(m3)) return;
    gasRing.push({ ts: Date.now(), gas_m3: m3 });
    while (gasRing.length > GAS_RING_SIZE) gasRing.shift();
  }

  // Gemiddeld gasverbruik (m³/h) over het venster. Negatieve delta (meter-reset)
  // → 0. Onvoldoende samples → null zodat de UI "—" kan tonen.
  function currentGasRateM3h() {
    if (gasRing.length < 2) return null;
    const oldest = gasRing[0];
    const newest = gasRing[gasRing.length - 1];
    const dtSec = (newest.ts - oldest.ts) / 1000;
    if (dtSec <= 0) return 0;
    const dM3 = newest.gas_m3 - oldest.gas_m3;
    if (dM3 < 0) return 0;
    return (dM3 / dtSec) * 3600;
  }

  function broadcast(event, payload) {
    if (subscribers.size === 0) return;
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of subscribers) {
      try {
        res.write(data);
      } catch {
        subscribers.delete(res);
      }
    }
  }

  function applyState(id, value) {
    const field = SENSOR_MAP[id];
    if (!field) {
      if (!unknownSeen.has(id)) {
        unknownSeen.add(id);
        console.log(`[energiemeter] onbekende sensor (genegeerd): ${id}`);
      }
      return;
    }
    const prev = snapshot[field];
    snapshot[field] = value;
    snapshot.fetchedAt = new Date().toISOString();
    if (field === 'power_kw') {
      sampleIfDue();
      if (prev !== value) {
        broadcast('power', { ts: Date.now(), power_w: Math.round(Number(value) * 1000) });
      }
    }
    if (field === 'power_failures') trackFailure('short', prev, value);
    if (field === 'power_long_failures') trackFailure('long', prev, value);
  }

  // SSE parser: buffer chunk, splits op blank line.
  // ESPHome gebruikt CRLF line endings, dus we normaliseren naar \n eerst.
  function makeSseParser() {
    let buf = '';
    return function feed(chunk) {
      buf += chunk.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const event = parseEventBlock(block);
        if (event) handleEvent(event);
      }
    };
  }

  function parseEventBlock(block) {
    let event = 'message';
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }
    return { event, data: dataLines.join('\n') };
  }

  function handleEvent({ event, data }) {
    if (event !== 'state' || !data) return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed.id !== 'string') return;
    // value kan null zijn (NA-fasen): negeren
    if (parsed.value == null) return;
    const v = Number(parsed.value);
    if (!Number.isFinite(v) && typeof parsed.value !== 'string') return;
    applyState(parsed.id, Number.isFinite(v) ? v : parsed.value);
  }

  let request = null;
  let reconnectTimer = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    const parser = makeSseParser();
    const opts = {
      host,
      port,
      path: '/events',
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    };
    request = http.request(opts, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`[energiemeter] SSE HTTP ${res.statusCode}, reconnect over ${RECONNECT_MS}ms`);
        res.resume();
        scheduleReconnect();
        return;
      }
      setConnected(true);
      console.log(`[energiemeter] SSE verbonden met ${host}:${port}/events`);
      res.setEncoding('utf8');
      res.on('data', parser);
      res.on('end', () => {
        setConnected(false);
        console.warn('[energiemeter] SSE end, reconnect…');
        scheduleReconnect();
      });
      res.on('error', (err) => {
        setConnected(false);
        console.warn(`[energiemeter] SSE response error: ${err.message}`);
        scheduleReconnect();
      });
    });
    request.on('error', (err) => {
      setConnected(false);
      console.warn(`[energiemeter] SSE request error: ${err.message}`);
      scheduleReconnect();
    });
    // Geen timeout: SSE is een persistente stream
    request.end();
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  }

  function start() {
    stopped = false;
    connect();
    if (!gasSampler) {
      gasSampler = setInterval(sampleGas, GAS_SAMPLE_INTERVAL_MS);
    }
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (gasSampler) {
      clearInterval(gasSampler);
      gasSampler = null;
    }
    if (request) {
      try {
        request.destroy();
      } catch {}
    }
  }

  function getSnapshot() {
    return {
      ...snapshot,
      total_kwh: totalEnergyKwh(),
      gas_rate_m3_h: currentGasRateM3h(),
      failures_since_start: failureTracker.short.delta,
      failures_long_since_start: failureTracker.long.delta,
      last_failure_at: failureTracker.short.lastAt,
      last_long_failure_at: failureTracker.long.lastAt,
    };
  }

  function getRecent() {
    return ring.slice();
  }

  function subscribe(res) {
    subscribers.add(res);
    res.on('close', () => subscribers.delete(res));
  }

  return { start, stop, getSnapshot, getRecent, subscribe, totalEnergyKwh };
}
