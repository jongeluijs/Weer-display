// Persistente settings-store voor runtime-configureerbare instellingen.
// Houdt momenteel het Hue Bridge IP en de gepairde API-key bij. Defaults
// worden gebruikt als data/settings.json nog niet bestaat. Het bestand is
// .gitignored (zie .gitignore: data/).

import fsp from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;

const DEFAULTS = Object.freeze({
  version: SCHEMA_VERSION,
  hueBridgeHost: '192.168.1.159',
  hueBridgeKey: null,
});

function normalize(input) {
  const merged = { ...DEFAULTS, ...(input && typeof input === 'object' ? input : {}) };
  return {
    version: SCHEMA_VERSION,
    hueBridgeHost:
      typeof merged.hueBridgeHost === 'string' && merged.hueBridgeHost.trim()
        ? merged.hueBridgeHost.trim()
        : DEFAULTS.hueBridgeHost,
    hueBridgeKey:
      typeof merged.hueBridgeKey === 'string' && merged.hueBridgeKey.trim()
        ? merged.hueBridgeKey.trim()
        : null,
  };
}

export function createSettingsStore(filePath) {
  let state = { ...DEFAULTS };

  async function load() {
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      state = normalize(parsed);
      console.log(
        `[settings] geladen: hue=${state.hueBridgeHost}, paired=${!!state.hueBridgeKey}`
      );
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`[settings] geen bestand, gebruik defaults (hue=${state.hueBridgeHost})`);
        return api;
      }
      const backup = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fsp.rename(filePath, backup);
        console.warn(`[settings] corrupt, verplaatst naar ${backup}: ${err.message}`);
      } catch (renameErr) {
        console.warn('[settings] rename corrupt faalde:', renameErr.message);
      }
      state = { ...DEFAULTS };
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
    return { ...state };
  }

  function update(partial) {
    if (!partial || typeof partial !== 'object') return getAll();
    const next = { ...state };
    if ('hueBridgeHost' in partial) {
      const v = partial.hueBridgeHost;
      next.hueBridgeHost =
        typeof v === 'string' && v.trim() ? v.trim() : DEFAULTS.hueBridgeHost;
    }
    if ('hueBridgeKey' in partial) {
      const v = partial.hueBridgeKey;
      next.hueBridgeKey =
        typeof v === 'string' && v.trim() ? v.trim() : null;
    }
    state = normalize(next);
    return getAll();
  }

  const api = {
    load,
    persist,
    getAll,
    update,
  };
  return api;
}
