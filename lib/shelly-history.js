// Per-Shelly-device historie. Eén bestand per device in
// {dataDir}/shelly/{device-id-safe}.json. Houdt bij:
//   - hourly:      uurgemiddeld vermogen (W) → uurprofiel per dag
//   - daily:       meterstand-snapshots per dag → daggebruik via delta
//   - meterHourly: meterstand bij begin van het uur → uurverbruik via delta
//
// API analoog aan lib/energy-history.js, maar dan multi-device. Lazy-load: een
// device wordt pas in-memory gehouden zodra er een sample binnenkomt of er
// data wordt opgevraagd.

import fsp from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const MAX_HOURLY_DAYS = 14;
const MAX_DAILY_DAYS = 365;

function dateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function hourKey(d) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.toISOString();
}

function safeFilename(id) {
  return String(id).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function emptyState() {
  return { version: SCHEMA_VERSION, hourly: [], daily: [], meterHourly: [] };
}

export function createShellyHistory(baseDir) {
  // device-id → { filePath, state, dirty }
  const stores = new Map();

  function pathFor(id) {
    return path.join(baseDir, `${safeFilename(id)}.json`);
  }

  async function ensureLoaded(deviceId) {
    if (stores.has(deviceId)) return stores.get(deviceId);
    const filePath = pathFor(deviceId);
    let state = emptyState();
    try {
      await fsp.mkdir(baseDir, { recursive: true });
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      state = {
        version: SCHEMA_VERSION,
        hourly: Array.isArray(parsed?.hourly) ? parsed.hourly : [],
        daily: Array.isArray(parsed?.daily) ? parsed.daily : [],
        meterHourly: Array.isArray(parsed?.meterHourly) ? parsed.meterHourly : [],
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        const backup = `${filePath}.corrupt-${Date.now()}`;
        try {
          await fsp.rename(filePath, backup);
          console.warn(`[shelly-history] ${deviceId} corrupt → ${backup}: ${err.message}`);
        } catch {}
      }
    }
    const entry = { filePath, state, dirty: false };
    stores.set(deviceId, entry);
    return entry;
  }

  async function ingest(deviceId, { power_w = null, total_kwh = null, now = new Date() } = {}) {
    const store = await ensureLoaded(deviceId);
    const { state } = store;

    if (Number.isFinite(power_w)) {
      const ts = hourKey(now);
      const idx = state.hourly.findIndex((h) => h.ts === ts);
      if (idx === -1) {
        state.hourly.push({ ts, power_w_avg: power_w, samples: 1 });
      } else {
        const e = state.hourly[idx];
        const samples = (e.samples || 1) + 1;
        e.power_w_avg = (e.power_w_avg * (samples - 1) + power_w) / samples;
        e.samples = samples;
      }
      store.dirty = true;
    }

    if (Number.isFinite(total_kwh)) {
      const date = dateKey(now);
      let entry = state.daily.find((d) => d.date === date);
      if (!entry) {
        entry = { date, start_kwh: total_kwh, end_kwh: total_kwh, kwh: 0 };
        state.daily.push(entry);
        state.daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      }
      if (entry.start_kwh == null) entry.start_kwh = total_kwh;
      entry.end_kwh = total_kwh;
      entry.kwh = Math.max(0, Math.round((entry.end_kwh - entry.start_kwh) * 1000) / 1000);

      const ts = hourKey(now);
      if (!state.meterHourly.some((h) => h.ts === ts)) {
        state.meterHourly.push({ ts, kwh: total_kwh });
        state.meterHourly.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
      }
      store.dirty = true;
    }

    // Pruning houdt bestanden klein.
    const cutoff = Date.now() - MAX_HOURLY_DAYS * 24 * 60 * 60 * 1000;
    state.hourly = state.hourly.filter((h) => new Date(h.ts).getTime() >= cutoff);
    state.meterHourly = state.meterHourly.filter(
      (h) => new Date(h.ts).getTime() >= cutoff
    );
    if (state.daily.length > MAX_DAILY_DAYS) {
      state.daily = state.daily.slice(-MAX_DAILY_DAYS);
    }
  }

  async function persist(deviceId) {
    const store = stores.get(deviceId);
    if (!store || !store.dirty) return;
    await fsp.mkdir(baseDir, { recursive: true });
    const tmp = `${store.filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(store.state, null, 2), 'utf8');
    await fsp.rename(tmp, store.filePath);
    store.dirty = false;
  }

  async function persistAll() {
    for (const id of stores.keys()) {
      try {
        await persist(id);
      } catch (err) {
        console.warn(`[shelly-history] persist ${id} fout: ${err.message}`);
      }
    }
  }

  // Per uur kWh voor een dag. Idem trick als energy-history: delta tussen
  // opeenvolgende meter-uur-snapshots, en voor het huidige uur (alleen vandaag)
  // delta met de live meterstand.
  async function getHourlyMeter(deviceId, date = null, currentTotalKwh = null, now = new Date()) {
    const store = await ensureLoaded(deviceId);
    const { state } = store;
    const target = date || dateKey(now);
    const isToday = target === dateKey(now);
    const currentHour = now.getHours();
    const byKey = new Map();
    for (const e of state.meterHourly) byKey.set(e.ts, e);
    const [y, m, d] = target.split('-').map(Number);
    const result = [];
    for (let h = 0; h < 24; h++) {
      const tsThis = hourKey(new Date(y, m - 1, d, h, 0, 0, 0));
      const tsNext = hourKey(new Date(y, m - 1, d, h + 1, 0, 0, 0));
      const entry = byKey.get(tsThis);
      const next = byKey.get(tsNext);
      let kwh = null;
      if (entry) {
        if (next && entry.kwh != null && next.kwh != null) {
          kwh = Math.max(0, Math.round((next.kwh - entry.kwh) * 1000) / 1000);
        } else if (
          isToday && h === currentHour && Number.isFinite(currentTotalKwh) && entry.kwh != null
        ) {
          kwh = Math.max(0, Math.round((currentTotalKwh - entry.kwh) * 1000) / 1000);
        }
      }
      result.push({ hour: h, kwh });
    }
    return result;
  }

  async function getDaily(deviceId, days = 30) {
    const store = await ensureLoaded(deviceId);
    return store.state.daily.slice(-days).map((d) => ({ date: d.date, kwh: d.kwh }));
  }

  async function getToday(deviceId, now = new Date()) {
    const store = await ensureLoaded(deviceId);
    const today = dateKey(now);
    const entry = store.state.daily.find((d) => d.date === today);
    return entry ? { date: today, kwh: entry.kwh } : { date: today, kwh: 0 };
  }

  // Verwijdert een devicebestand én de in-memory cache. Voor wanneer een
  // apparaat van de plattegrond gehaald wordt en de gebruiker ook de historie
  // wil opruimen — niet automatisch aangeroepen.
  async function dropDevice(deviceId) {
    stores.delete(deviceId);
    try {
      await fsp.unlink(pathFor(deviceId));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[shelly-history] dropDevice ${deviceId} fout: ${err.message}`);
      }
    }
  }

  return {
    ingest,
    persist,
    persistAll,
    getHourlyMeter,
    getDaily,
    getToday,
    dropDevice,
  };
}
