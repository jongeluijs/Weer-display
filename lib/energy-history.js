// Persistente energie-historie. Houdt twee dingen bij:
// 1. Per uur: gemiddeld vermogen (W) → uurprofiel per dag
// 2. Per dag: meterstand-snapshots (kWh totaal en m³ gas) → daggebruik via delta
//
// De energiemeter levert cumulatieve meterstanden. Daggebruik = stand_eind - stand_begin.

import fsp from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const MAX_HOURLY_DAYS = 14;
const MAX_DAILY_DAYS = 365;

function dateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hourKey(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export function createEnergyHistory(filePath) {
  // state.hourly:      [{ ts: ISO uur, power_w_avg, samples }]
  // state.daily:       [{ date: 'YYYY-MM-DD', start_kwh, end_kwh, kwh, start_m3, end_m3, m3 }]
  // state.meterHourly: [{ ts: ISO uur, kwh, m3 }] — meterstand bij begin van het uur
  let state = { version: SCHEMA_VERSION, hourly: [], daily: [], meterHourly: [] };

  async function load() {
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      state = {
        version: SCHEMA_VERSION,
        hourly: Array.isArray(parsed.hourly) ? parsed.hourly : [],
        daily: Array.isArray(parsed.daily) ? parsed.daily : [],
        meterHourly: Array.isArray(parsed.meterHourly) ? parsed.meterHourly : [],
      };
      console.log(
        `[energy-history] geladen: ${state.hourly.length} uur, ${state.daily.length} dag, ${state.meterHourly.length} meter-uur entries`
      );
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[energy-history] geen bestand, start leeg');
        return api;
      }
      const backup = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fsp.rename(filePath, backup);
        console.warn(`[energy-history] corrupt, verplaatst naar ${backup}: ${err.message}`);
      } catch (renameErr) {
        console.warn('[energy-history] rename corrupt faalde:', renameErr.message);
      }
      state = { version: SCHEMA_VERSION, hourly: [], daily: [], meterHourly: [] };
    }
    return api;
  }

  // Voeg een vermogensmeting toe aan het uurgemiddelde van het huidige uur.
  function ingestPower(power_w, now = new Date()) {
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
  }

  // Snapshot meterstand voor de huidige dag. Bij dagovergang sluiten we de
  // vorige dag af door end_kwh / end_m3 te zetten.
  function snapshotMeter(total_kwh, total_m3, now = new Date()) {
    const date = dateKey(now);
    let entry = state.daily.find((d) => d.date === date);
    if (!entry) {
      entry = {
        date,
        start_kwh: total_kwh ?? null,
        end_kwh: total_kwh ?? null,
        kwh: 0,
        start_m3: total_m3 ?? null,
        end_m3: total_m3 ?? null,
        m3: 0,
      };
      state.daily.push(entry);
      state.daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    if (total_kwh != null) {
      if (entry.start_kwh == null) entry.start_kwh = total_kwh;
      entry.end_kwh = total_kwh;
      entry.kwh = Math.max(0, Math.round((entry.end_kwh - entry.start_kwh) * 1000) / 1000);
    }
    if (total_m3 != null) {
      if (entry.start_m3 == null) entry.start_m3 = total_m3;
      entry.end_m3 = total_m3;
      entry.m3 = Math.max(0, Math.round((entry.end_m3 - entry.start_m3) * 1000) / 1000);
    }
  }

  // Snapshot meterstand bij het begin van het huidige uur. Eerste call binnen
  // het uur legt de waarde vast; latere calls binnen hetzelfde uur doen niets.
  // De usage-per-uur is dan delta tussen opeenvolgende uur-snapshots.
  function snapshotHourMeter(total_kwh, total_m3, now = new Date()) {
    const ts = hourKey(now);
    if (state.meterHourly.some((h) => h.ts === ts)) return;
    state.meterHourly.push({
      ts,
      kwh: total_kwh ?? null,
      m3: total_m3 ?? null,
    });
    state.meterHourly.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }

  function prune() {
    const cutoffHour = Date.now() - MAX_HOURLY_DAYS * 24 * 60 * 60 * 1000;
    state.hourly = state.hourly.filter((h) => new Date(h.ts).getTime() >= cutoffHour);
    state.meterHourly = state.meterHourly.filter(
      (h) => new Date(h.ts).getTime() >= cutoffHour
    );
    if (state.daily.length > MAX_DAILY_DAYS) {
      state.daily = state.daily.slice(-MAX_DAILY_DAYS);
    }
  }

  async function persist() {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    const body = JSON.stringify(state, null, 2);
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, filePath);
  }

  function getDaily(days = 30) {
    return state.daily.slice(-days).map((d) => ({
      date: d.date,
      kwh: d.kwh,
      m3: d.m3,
    }));
  }

  function getHourly(date = null) {
    // Geef uurprofiel terug. Als date is gegeven (YYYY-MM-DD), filter op die dag.
    let entries = state.hourly;
    if (date) {
      entries = entries.filter((h) => dateKey(new Date(h.ts)) === date);
    }
    return entries.map((h) => ({
      ts: h.ts,
      power_w: Math.round(h.power_w_avg),
    }));
  }

  function getToday(now = new Date()) {
    const today = dateKey(now);
    const entry = state.daily.find((d) => d.date === today);
    if (!entry) return { date: today, kwh: 0, m3: 0 };
    return { date: today, kwh: entry.kwh, m3: entry.m3 };
  }

  function getYesterday(now = new Date()) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const key = dateKey(y);
    const entry = state.daily.find((d) => d.date === key);
    if (!entry) return null;
    return { date: key, kwh: entry.kwh, m3: entry.m3 };
  }

  // Per uur kWh + m³ verbruik voor een willekeurige dag. Voor elk afgesloten
  // uur: delta tussen de meter-snapshots aan het begin van dit uur en het
  // volgende (kruist desnoods middernacht naar de volgende dag). Voor het
  // huidige uur (alleen vandaag): live snapshot - hour-start snapshot.
  function getHourlyMeter(date, currentSnapshot = null, now = new Date()) {
    const target = date || dateKey(now);
    const today = dateKey(now);
    const isToday = target === today;
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
      let m3 = null;
      if (entry) {
        if (next) {
          if (entry.kwh != null && next.kwh != null) {
            kwh = Math.max(0, Math.round((next.kwh - entry.kwh) * 1000) / 1000);
          }
          if (entry.m3 != null && next.m3 != null) {
            m3 = Math.max(0, Math.round((next.m3 - entry.m3) * 1000) / 1000);
          }
        } else if (isToday && h === currentHour && currentSnapshot) {
          if (entry.kwh != null && Number.isFinite(currentSnapshot.total_kwh)) {
            kwh = Math.max(
              0,
              Math.round((currentSnapshot.total_kwh - entry.kwh) * 1000) / 1000
            );
          }
          if (entry.m3 != null && Number.isFinite(currentSnapshot.gas_m3)) {
            m3 = Math.max(
              0,
              Math.round((currentSnapshot.gas_m3 - entry.m3) * 1000) / 1000
            );
          }
        }
      }
      result.push({ hour: h, kwh, m3 });
    }
    return result;
  }

  function getTodayHourlyMeter(currentSnapshot = null, now = new Date()) {
    return getHourlyMeter(dateKey(now), currentSnapshot, now);
  }

  const api = {
    load,
    ingestPower,
    snapshotMeter,
    snapshotHourMeter,
    prune,
    persist,
    getDaily,
    getHourly,
    getToday,
    getYesterday,
    getHourlyMeter,
    getTodayHourlyMeter,
    _state: () => state,
  };
  return api;
}
