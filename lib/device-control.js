// Driver-registry voor lokale apparaatbediening tijdens runtime. Ieder driver
// implementeert getStatus(device) en optioneel applyAction(device, action).
// Apparaten zonder lokale API gebruiken de 'generic' driver, die alleen
// online/offline rapporteert via een ping (TCP-connect).

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

const HTTP_TIMEOUT_MS = 3_000;
const PING_TIMEOUT_MS = 1_500;

function fetchJson(targetUrl, { method = 'GET', body = null, timeoutMs = HTTP_TIMEOUT_MS } = {}) {
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
        const status = res.statusCode || 0;
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          if (!raw) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
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

function tcpPing(host, port = 80, timeoutMs = PING_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

// Per-device gen-cache: na de eerste call weten we welk Shelly-protocol bij
// een device hoort, zodat we niet steeds /shelly opnieuw hoeven op te halen.
const shellyGenCache = new Map();

async function detectShellyGen(device) {
  const id = device?.id;
  if (id && shellyGenCache.has(id)) return shellyGenCache.get(id);
  if (!device?.local_endpoint) return 1;
  try {
    const info = await fetchJson(
      `${device.local_endpoint.replace(/\/$/, '')}/shelly`,
      { timeoutMs: 1500 }
    );
    const gen = Number(info?.gen) >= 2 ? 2 : 1;
    if (id) shellyGenCache.set(id, gen);
    return gen;
  } catch {
    return 1;
  }
}

// MVP-drivers. Voor onbekende apparaten: alleen ping. Shelly Gen1 spreekt het
// oude REST-protocol (/status, /relay/0); Gen2+ JSON-RPC (/rpc/...). De
// `shelly` driver detecteert het generatie en routeert intern naar Gen2 als
// dat blijkt. Zo blijven al-geplaatste apparaten werken zonder re-place.
const drivers = {
  generic: {
    async getStatus(device) {
      if (!device.ip) return { online: false, error: 'no ip' };
      const ok = await tcpPing(device.ip, 80);
      if (!ok) {
        const ok443 = await tcpPing(device.ip, 443);
        return { online: ok443 };
      }
      return { online: true };
    },
    async applyAction() {
      throw new Error('generic driver supports no actions');
    },
  },

  shelly: {
    async getStatus(device) {
      if (!device.local_endpoint) return { online: false, error: 'no endpoint' };
      const gen = await detectShellyGen(device);
      if (gen >= 2) return drivers.shelly_gen2.getStatus(device);
      try {
        const data = await fetchJson(`${device.local_endpoint.replace(/\/$/, '')}/status`);
        const relay = Array.isArray(data?.relays) ? data.relays[0] : null;
        const meter = Array.isArray(data?.meters) ? data.meters[0] : null;
        const total_wh = meter && Number.isFinite(meter.total) ? meter.total : null;
        return {
          online: true,
          on: relay ? !!relay.ison : null,
          power_w: meter && Number.isFinite(meter.power) ? meter.power : null,
          total_kwh: total_wh != null ? Math.round(total_wh / 60) / 1000 : null,
          raw: data,
        };
      } catch (err) {
        return { online: false, error: err.message };
      }
    },
    async applyAction(device, action) {
      if (!device.local_endpoint) throw new Error('no endpoint');
      const gen = await detectShellyGen(device);
      if (gen >= 2) return drivers.shelly_gen2.applyAction(device, action);
      const base = device.local_endpoint.replace(/\/$/, '');
      if (action?.type === 'toggle') {
        return fetchJson(`${base}/relay/0?turn=toggle`);
      }
      if (action?.type === 'on') {
        return fetchJson(`${base}/relay/0?turn=on`);
      }
      if (action?.type === 'off') {
        return fetchJson(`${base}/relay/0?turn=off`);
      }
      throw new Error(`unknown action: ${action?.type}`);
    },
  },

  // Shelly Gen2 / Gen3 — JSON-RPC API. Werkt voor PM Mini (pm1:0), Plus/Pro
  // 1PM (switch:0), Pro EM (em1:0). Voor de PM Mini bestaat geen relay; alleen
  // metingen. Voor Plus/Pro 1PM ook on/off via Switch.Set / Switch.Toggle.
  shelly_gen2: {
    async getStatus(device) {
      if (!device.local_endpoint) return { online: false, error: 'no endpoint' };
      const base = device.local_endpoint.replace(/\/$/, '');
      try {
        const data = await fetchJson(`${base}/rpc/Shelly.GetStatus`);
        const comp =
          data?.['pm1:0'] || data?.['switch:0'] || data?.['em1:0'] || null;
        const total_wh = comp?.aenergy?.total;
        const status = {
          online: true,
          power_w: comp && Number.isFinite(comp.apower) ? comp.apower : null,
          total_kwh: Number.isFinite(total_wh)
            ? Math.round((total_wh / 1000) * 1000) / 1000
            : null,
          voltage: comp && Number.isFinite(comp.voltage) ? comp.voltage : null,
          current: comp && Number.isFinite(comp.current) ? comp.current : null,
        };
        if (data?.['switch:0']) {
          status.on = !!data['switch:0'].output;
        }
        return status;
      } catch (err) {
        return { online: false, error: err.message };
      }
    },
    async applyAction(device, action) {
      if (!device.local_endpoint) throw new Error('no endpoint');
      const base = device.local_endpoint.replace(/\/$/, '');
      const t = action?.type;
      if (t === 'toggle') {
        return fetchJson(`${base}/rpc/Switch.Toggle?id=0`);
      }
      if (t === 'on' || t === 'off') {
        const onParam = t === 'on' ? 'true' : 'false';
        return fetchJson(`${base}/rpc/Switch.Set?id=0&on=${onParam}`);
      }
      throw new Error(`unknown action: ${t}`);
    },
  },

  // Hue Bridge zelf — alleen info. /api/0/config is ongewenst geblokkeerd:
  // alleen niet-gevoelige metadata. Voor extra info hebben we een API-key
  // nodig, maar dat slaan we hier over (info-only popup).
  hue_bridge: {
    async getStatus(device) {
      if (!device.local_endpoint) return { online: false, error: 'no endpoint' };
      const base = device.local_endpoint.replace(/\/$/, '');
      try {
        const data = await fetchJson(`${base}/api/0/config`);
        return {
          online: true,
          name: data?.name || null,
          model: data?.modelid || null,
          swversion: data?.swversion || null,
          bridgeid: data?.bridgeid || null,
          mac: data?.mac || null,
        };
      } catch (err) {
        return { online: false, error: err.message };
      }
    },
    async applyAction() {
      throw new Error('hue bridge ondersteunt geen acties');
    },
  },

  // Individuele Hue-lamp via de bridge. local_endpoint is van de vorm
  // http://{host}/api/{key}/lights/{id} (zie hue-bridge.js listDevices).
  // Alle PUT-acties gaan naar /state.
  hue_light: {
    async getStatus(device) {
      if (!device.local_endpoint) return { online: false, error: 'no endpoint' };
      try {
        const data = await fetchJson(device.local_endpoint);
        const state = data?.state || {};
        const capabilities = data?.capabilities?.control || {};
        return {
          online: state.reachable !== false,
          reachable: state.reachable !== false,
          on: typeof state.on === 'boolean' ? state.on : null,
          brightness: Number.isFinite(state.bri) ? state.bri : null,
          color_temp: Number.isFinite(state.ct) ? state.ct : null,
          colormode: state.colormode || null,
          model: data?.modelid || null,
          product: data?.productname || null,
          manufacturer: data?.manufacturername || null,
          subtype: data?.type || null,
          // Door capabilities expliciet te delen kan de UI knoppen verbergen
          // voor lampen zonder kleurtemp- of dim-functie.
          supports: {
            on: true,
            brightness: capabilities.mindimlevel != null || Number.isFinite(state.bri),
            color_temp: !!capabilities.ct || Number.isFinite(state.ct),
          },
        };
      } catch (err) {
        return { online: false, error: err.message };
      }
    },
    async applyAction(device, action) {
      if (!device.local_endpoint) throw new Error('no endpoint');
      const stateUrl = `${device.local_endpoint.replace(/\/$/, '')}/state`;
      const t = action?.type;
      if (t === 'on') return fetchJson(stateUrl, { method: 'PUT', body: { on: true } });
      if (t === 'off') return fetchJson(stateUrl, { method: 'PUT', body: { on: false } });
      if (t === 'toggle') {
        const cur = await fetchJson(device.local_endpoint).catch(() => null);
        const isOn = !!cur?.state?.on;
        return fetchJson(stateUrl, { method: 'PUT', body: { on: !isOn } });
      }
      if (t === 'brightness') {
        const bri = Math.max(1, Math.min(254, Number(action.value) || 0));
        return fetchJson(stateUrl, { method: 'PUT', body: { on: true, bri } });
      }
      if (t === 'color_temp') {
        const ct = Math.max(153, Math.min(500, Number(action.value) || 0));
        return fetchJson(stateUrl, { method: 'PUT', body: { on: true, ct } });
      }
      throw new Error(`unknown action: ${t}`);
    },
  },
};

export function createDeviceControl() {
  function driverFor(device) {
    return drivers[device?.driver] || drivers.generic;
  }

  async function getStatus(device) {
    if (!device) return { online: false, error: 'no device' };
    try {
      return await driverFor(device).getStatus(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function applyAction(device, action) {
    if (!device) throw new Error('no device');
    return driverFor(device).applyAction(device, action);
  }

  return { getStatus, applyAction };
}
