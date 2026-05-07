// Persistente plattegrond-store. Houdt de lijst van apparaten bij die op de
// BeganeGrond-plattegrond geplaatst zijn. Iedere device heeft een stabiele id,
// een type, en relatieve x/y coördinaten (0..1) zodat de plattegrond
// schaal-onafhankelijk is. Optionele velden: ip/mac/hostname (uit ARP-scan),
// driver + local_endpoint (voor lokale runtime-bediening), customLabel
// (door gebruiker overschreven naam).

import fsp from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function normalizeDevice(input) {
  if (!input || typeof input !== 'object') return null;
  const id = String(input.id || '').trim();
  if (!id) return null;
  return {
    id,
    label: typeof input.label === 'string' ? input.label : '',
    customLabel:
      typeof input.customLabel === 'string' && input.customLabel.trim()
        ? input.customLabel.trim()
        : null,
    type: typeof input.type === 'string' ? input.type : 'generic',
    x: clamp01(Number(input.x)),
    y: clamp01(Number(input.y)),
    ip: typeof input.ip === 'string' ? input.ip : null,
    mac: typeof input.mac === 'string' ? input.mac : null,
    hostname: typeof input.hostname === 'string' ? input.hostname : null,
    vendor: typeof input.vendor === 'string' ? input.vendor : null,
    driver: typeof input.driver === 'string' ? input.driver : 'generic',
    local_endpoint:
      typeof input.local_endpoint === 'string' ? input.local_endpoint : null,
  };
}

export function createFloorplanStore(filePath) {
  let state = { version: SCHEMA_VERSION, devices: [] };

  async function load() {
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      const list = Array.isArray(parsed.devices) ? parsed.devices : [];
      state = {
        version: SCHEMA_VERSION,
        devices: list.map(normalizeDevice).filter(Boolean),
      };
      console.log(`[floorplan] geladen: ${state.devices.length} apparaten`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[floorplan] geen bestand, start leeg');
        return api;
      }
      const backup = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fsp.rename(filePath, backup);
        console.warn(`[floorplan] corrupt, verplaatst naar ${backup}: ${err.message}`);
      } catch (renameErr) {
        console.warn('[floorplan] rename corrupt faalde:', renameErr.message);
      }
      state = { version: SCHEMA_VERSION, devices: [] };
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

  function getAll() {
    return state.devices.map((d) => ({ ...d }));
  }

  function getById(id) {
    const d = state.devices.find((x) => x.id === id);
    return d ? { ...d } : null;
  }

  // Voegt toe of werkt bij op basis van id. Geeft het opgeslagen device terug.
  function upsert(input) {
    const dev = normalizeDevice(input);
    if (!dev) return null;
    const idx = state.devices.findIndex((d) => d.id === dev.id);
    if (idx === -1) {
      state.devices.push(dev);
    } else {
      state.devices[idx] = dev;
    }
    return { ...dev };
  }

  function remove(id) {
    const before = state.devices.length;
    state.devices = state.devices.filter((d) => d.id !== id);
    return state.devices.length < before;
  }

  const api = {
    load,
    persist,
    getAll,
    getById,
    upsert,
    remove,
    _state: () => state,
  };
  return api;
}
