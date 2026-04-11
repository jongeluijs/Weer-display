import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const MAX_HOURLY = 14 * 24; // 14 dagen uurlijks = 336
const MAX_DAILY = 90;       // 90 dagen dagelijks

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hourKey(date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function dateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mode(values) {
  const counts = new Map();
  let best = null;
  let bestCount = 0;
  for (const v of values) {
    if (v == null) continue;
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

export function createHistory(filePath) {
  let state = { version: SCHEMA_VERSION, hourly: [], daily: [] };

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
      };
      console.log(
        `[history] geladen: ${state.hourly.length} uur, ${state.daily.length} dag entries`
      );
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[history] geen bestand, start leeg');
        state = { version: SCHEMA_VERSION, hourly: [], daily: [] };
        return api;
      }
      // corrupt bestand: hernoemen en opnieuw beginnen
      const backup = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fsp.rename(filePath, backup);
        console.warn(`[history] corrupt, verplaatst naar ${backup}: ${err.message}`);
      } catch (renameErr) {
        console.warn('[history] rename corrupt faalde:', renameErr.message);
      }
      state = { version: SCHEMA_VERSION, hourly: [], daily: [] };
    }
    return api;
  }

  function ingest(data) {
    if (!data || !data.liveweer) return;
    const l = data.liveweer;
    const now = new Date();
    const key = hourKey(now);

    // neerslag voor dit uur: eerste uurverwachting als die overeenkomt
    let neersl = 0;
    if (Array.isArray(data.uurverwachting) && data.uurverwachting.length > 0) {
      const first = data.uurverwachting[0];
      // uurverwachting heeft 'uur' als "DD-MM-YYYY HH:00" of iets vergelijkbaars
      const n = parseNum(first.neersl);
      if (n != null) neersl = n;
    }

    const temp = parseNum(l.temp);
    const gr = parseNum(l.gr);
    const entry = {
      ts: key,
      temp,
      neersl,
      wind_kmh: parseNum(l.windkmh),
      luchtd: parseNum(l.luchtd),
      lv: parseNum(l.lv),
      gr,
      samenv: typeof l.samenv === 'string' ? l.samenv : '',
      image: typeof l.image === 'string' ? l.image : '',
      _samples: 1,
    };

    // zoek bestaande entry voor dit uur
    const idx = state.hourly.findIndex((h) => h.ts === key);
    if (idx === -1) {
      state.hourly.push(entry);
    } else {
      // update: lopend gemiddelde van temp, max van neerslag, laatst bekende overige velden
      const existing = state.hourly[idx];
      const samples = (existing._samples || 1) + 1;
      if (temp != null && existing.temp != null) {
        existing.temp = (existing.temp * (samples - 1) + temp) / samples;
      } else if (temp != null) {
        existing.temp = temp;
      }
      if (neersl > (existing.neersl || 0)) existing.neersl = neersl;
      if (entry.wind_kmh != null) existing.wind_kmh = entry.wind_kmh;
      if (entry.luchtd != null) existing.luchtd = entry.luchtd;
      if (entry.lv != null) existing.lv = entry.lv;
      // gr: maximum binnen het uur (piek zonnekracht is informatiever dan gemiddelde)
      if (entry.gr != null && (existing.gr == null || entry.gr > existing.gr)) {
        existing.gr = entry.gr;
      }
      if (entry.samenv) existing.samenv = entry.samenv;
      if (entry.image) existing.image = entry.image;
      existing._samples = samples;
    }

    // houd hourly gesorteerd op ts
    state.hourly.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }

  function rollupIfNewDay(now = new Date()) {
    // groepeer per lokale datum en maak een daily entry voor elke afgesloten dag
    const today = dateKey(now);
    const byDate = new Map();

    for (const h of state.hourly) {
      const d = dateKey(new Date(h.ts));
      if (d === today) continue; // huidige dag nog niet afsluiten
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(h);
    }

    for (const [date, entries] of byDate) {
      if (state.daily.some((x) => x.date === date)) continue;
      const temps = entries.map((e) => e.temp).filter((v) => v != null);
      if (temps.length === 0) continue;
      const tmin = Math.min(...temps);
      const tmax = Math.max(...temps);
      const tavg = temps.reduce((a, b) => a + b, 0) / temps.length;
      const neersl_total = entries.reduce((a, b) => a + (b.neersl || 0), 0);
      const samenv_dominant = mode(entries.map((e) => e.samenv).filter(Boolean));
      const image_dominant = mode(entries.map((e) => e.image).filter(Boolean));

      state.daily.push({
        date,
        tmin: Math.round(tmin * 10) / 10,
        tmax: Math.round(tmax * 10) / 10,
        tavg: Math.round(tavg * 10) / 10,
        neersl_total: Math.round(neersl_total * 10) / 10,
        samenv_dominant: samenv_dominant || '',
        image_dominant: image_dominant || '',
        samples: entries.length,
      });
    }

    state.daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function prune() {
    if (state.hourly.length > MAX_HOURLY) {
      state.hourly = state.hourly.slice(-MAX_HOURLY);
    }
    // ook op datum filteren voor zekerheid
    const cutoffHour = Date.now() - 14 * 24 * 60 * 60 * 1000;
    state.hourly = state.hourly.filter((h) => new Date(h.ts).getTime() >= cutoffHour);

    if (state.daily.length > MAX_DAILY) {
      state.daily = state.daily.slice(-MAX_DAILY);
    }
  }

  async function persist() {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    const body = JSON.stringify(state, null, 2);
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, filePath);
  }

  function getHourly(days = 14) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return state.hourly
      .filter((h) => new Date(h.ts).getTime() >= cutoff)
      .map(({ _samples, ...rest }) => rest);
  }

  function getDaily(days = 90) {
    return state.daily.slice(-days);
  }

  const api = {
    load,
    ingest,
    rollupIfNewDay,
    prune,
    persist,
    getHourly,
    getDaily,
    _state: () => state,
  };
  return api;
}
