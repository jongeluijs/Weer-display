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

// MVP-drivers. Voor onbekende apparaten: alleen ping. Shelly als demonstratie
// van een lokale REST-API (Shelly Gen1: GET /status, POST /relay/0?turn=on).
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
      try {
        const data = await fetchJson(`${device.local_endpoint.replace(/\/$/, '')}/status`);
        const relay = Array.isArray(data?.relays) ? data.relays[0] : null;
        const meter = Array.isArray(data?.meters) ? data.meters[0] : null;
        return {
          online: true,
          on: relay ? !!relay.ison : null,
          power_w: meter && Number.isFinite(meter.power) ? meter.power : null,
          raw: data,
        };
      } catch (err) {
        return { online: false, error: err.message };
      }
    },
    async applyAction(device, action) {
      if (!device.local_endpoint) throw new Error('no endpoint');
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
