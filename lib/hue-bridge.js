// Philips Hue Bridge client. De bridge is de centrale hub voor alle
// Hue-lampen (en zigbee-via-Hue apparaten). De bridge zelf werkt zonder
// auth voor public info (`/api/0/config`), maar voor lichtdiscovery en
// bediening hebben we een API-key (gebruikersnaam) nodig.
//
// Configuratie wordt geleverd door de settings-store (data/settings.json).
// Default host: 192.168.1.159. Pairing gebeurt via `pair()` nadat de
// fysieke knop op de bridge is ingedrukt.
//
// Zonder key: alleen bridge-info zichtbaar (één entry in discovery-lijst).
// Met key: ook alle lampen verschijnen als sleepbare apparaten op de
// plattegrond.

import http from 'node:http';
import { URL } from 'node:url';

const TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 30_000;

function fetchJson(targetUrl, { method = 'GET', body = null, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const headers = { Accept: 'application/json' };
    let payload = null;
    if (body != null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      parsed,
      { method, timeout: timeoutMs, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : null);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function createHueBridge({ host = null, apiKey = null } = {}) {
  let currentHost = host || null;
  let currentKey = apiKey || null;
  let cache = null; // { fetchedAt, devices }

  function clearCache() {
    cache = null;
  }

  function setConfig({ host: nextHost, apiKey: nextKey } = {}) {
    if (nextHost !== undefined) currentHost = nextHost && String(nextHost).trim() ? String(nextHost).trim() : null;
    if (nextKey !== undefined) currentKey = nextKey && String(nextKey).trim() ? String(nextKey).trim() : null;
    clearCache();
    console.log(
      `[hue] config: host=${currentHost || '(geen)'}, paired=${!!currentKey}`
    );
  }

  async function getConfig() {
    if (!currentHost) return null;
    return fetchJson(`http://${currentHost}/api/0/config`).catch(() => null);
  }

  async function listLights() {
    if (!currentHost || !currentKey) return [];
    const data = await fetchJson(
      `http://${currentHost}/api/${currentKey}/lights`
    ).catch(() => null);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    // Hue API geeft een object terug: { "1": {name, state, type, ...}, "2": ... }
    return Object.entries(data).map(([id, light]) => ({
      hue_id: id,
      name: light?.name || `Lamp ${id}`,
      type: light?.type || null,
      modelid: light?.modelid || null,
      manufacturername: light?.manufacturername || null,
      state: light?.state || {},
    }));
  }

  async function listDevices() {
    if (!currentHost) return [];
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return cache.devices;
    }

    const config = await getConfig();
    const devices = [];
    if (config?.bridgeid) {
      devices.push({
        source: 'hue',
        id: `hue:bridge:${config.bridgeid}`,
        type: 'hub',
        label: config.name || 'Hue Bridge',
        vendor: 'Philips Hue',
        ip: currentHost,
        mac: config.mac || null,
        hostname: null,
        driver: 'hue_bridge',
        local_endpoint: `http://${currentHost}`,
        details: {
          bridgeid: config.bridgeid,
          modelid: config.modelid,
          swversion: config.swversion,
        },
      });
    }

    if (currentKey) {
      try {
        const lights = await listLights();
        for (const l of lights) {
          devices.push({
            source: 'hue',
            id: `hue:light:${l.hue_id}`,
            type: 'light',
            label: l.name,
            vendor: l.manufacturername || 'Philips Hue',
            ip: currentHost,
            mac: null,
            hostname: null,
            driver: 'hue_light',
            local_endpoint: `http://${currentHost}/api/${currentKey}/lights/${l.hue_id}`,
            details: {
              hue_id: l.hue_id,
              modelid: l.modelid,
              type: l.type,
              on: l.state?.on,
              reachable: l.state?.reachable,
            },
          });
        }
      } catch (err) {
        console.warn('[hue] lights ophalen mislukt:', err.message);
      }
    }

    cache = { fetchedAt: now, devices };
    return devices;
  }

  // Pair: vraagt een nieuwe API-key aan. De gebruiker moet eerst op de
  // fysieke link-knop op de bridge drukken (geldig ~30s). Bij succes
  // returnt de bridge { success: { username: '...' } }, anders een
  // error-array met description "link button not pressed".
  async function pair({ devicetype = 'weer-display#dial' } = {}) {
    if (!currentHost) throw new Error('hue bridge host niet ingesteld');
    const result = await fetchJson(`http://${currentHost}/api`, {
      method: 'POST',
      body: { devicetype },
    });
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0];
      if (first?.success?.username) {
        const username = first.success.username;
        currentKey = username;
        clearCache();
        return { paired: true, username };
      }
      if (first?.error?.description) {
        const desc = String(first.error.description);
        const err = new Error(desc);
        err.code = first.error.type === 101 ? 'LINK_NOT_PRESSED' : 'HUE_ERROR';
        throw err;
      }
    }
    throw new Error('onverwacht antwoord van bridge');
  }

  async function setLight(hueId, body) {
    if (!currentHost || !currentKey) throw new Error('hue not configured');
    return fetchJson(
      `http://${currentHost}/api/${currentKey}/lights/${hueId}/state`,
      { method: 'PUT', body }
    );
  }

  async function getLight(hueId) {
    if (!currentHost || !currentKey) throw new Error('hue not configured');
    return fetchJson(`http://${currentHost}/api/${currentKey}/lights/${hueId}`);
  }

  return {
    get enabled() {
      return !!currentHost;
    },
    get paired() {
      return !!currentKey;
    },
    get host() {
      return currentHost;
    },
    setConfig,
    pair,
    listDevices,
    listLights,
    getConfig,
    setLight,
    getLight,
  };
}
