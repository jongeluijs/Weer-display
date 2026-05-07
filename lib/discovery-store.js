// Persistente opslag voor het resultaat van de diepe netwerkscan. Slaat per
// scan op: timestamp, duur, gebruikt subnet, en alle gevonden devices met
// hun open poorten + service-banners. Het bestand staat in `data/` (niet in
// git) en wordt slechts ~1x per maand bijgewerkt.

import fsp from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;

export function createDiscoveryStore(filePath) {
  let state = {
    version: SCHEMA_VERSION,
    lastRunAt: null,
    durationMs: null,
    subnet: null,
    devices: [],
  };

  async function load() {
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state = {
          version: SCHEMA_VERSION,
          lastRunAt: parsed.lastRunAt || null,
          durationMs: Number.isFinite(parsed.durationMs) ? parsed.durationMs : null,
          subnet: parsed.subnet || null,
          devices: Array.isArray(parsed.devices) ? parsed.devices : [],
        };
        console.log(
          `[discovery] geladen: ${state.devices.length} apparaten, laatste scan ${state.lastRunAt || '?'}`
        );
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[discovery] geen bestand, geen eerdere scan');
        return api;
      }
      console.warn('[discovery] laad-fout:', err.message);
    }
    return api;
  }

  async function persist() {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    const body = JSON.stringify(state, null, 2);
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, filePath);
  }

  function save({ lastRunAt, durationMs, subnet, devices }) {
    state = {
      version: SCHEMA_VERSION,
      lastRunAt: lastRunAt || new Date().toISOString(),
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      subnet: subnet || null,
      devices: Array.isArray(devices) ? devices : [],
    };
  }

  function getLatest() {
    return {
      lastRunAt: state.lastRunAt,
      durationMs: state.durationMs,
      subnet: state.subnet,
      devices: state.devices.map((d) => ({ ...d, ports: [...(d.ports || [])] })),
    };
  }

  function ageMs() {
    if (!state.lastRunAt) return null;
    const t = Date.parse(state.lastRunAt);
    if (!Number.isFinite(t)) return null;
    return Date.now() - t;
  }

  const api = {
    load,
    persist,
    save,
    getLatest,
    ageMs,
  };
  return api;
}
