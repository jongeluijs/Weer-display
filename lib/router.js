import { URL } from 'node:url';
import { createStatic } from './static.js';

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createRouter({
  publicDir,
  cache,
  history,
  location,
  energy,
  energyHistory,
  prices,
  floorplan,
  networkScan,
  hueBridge,
  deviceControl,
  settings,
  deepScan,
  discoveryStore,
}) {
  const staticServer = createStatic({ publicDir });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'POST') {
      await handlePost(req, res, p, url);
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    if (p === '/' || p === '/index.html') {
      await staticServer.serve(req, res, '/index.html');
      return;
    }

    if (p === '/api/weather') {
      const entry = cache.get('weather');
      const rainEntry = cache.get('rain');
      if (!entry) {
        sendJson(res, 503, {
          ok: false,
          error: 'no data yet',
          location,
          rain: rainEntry
            ? { fetchedAt: rainEntry.value.fetchedAt, entries: rainEntry.value.entries, stale: !rainEntry.fresh }
            : null,
        });
        return;
      }
      const d = entry.value;
      sendJson(res, 200, {
        ok: true,
        fetchedAt: d.fetchedAt,
        stale: !entry.fresh,
        ageMs: entry.age,
        location,
        liveweer: d.liveweer,
        dagverwachting: d.dagverwachting,
        uurverwachting: d.uurverwachting,
        rain: rainEntry
          ? {
              fetchedAt: rainEntry.value.fetchedAt,
              stale: !rainEntry.fresh,
              entries: rainEntry.value.entries,
            }
          : null,
      });
      return;
    }

    if (p === '/api/history') {
      const range = url.searchParams.get('range') || 'daily';
      if (range === 'hourly') {
        sendJson(res, 200, { ok: true, range, entries: history.getHourly(14) });
      } else if (range === 'daily') {
        sendJson(res, 200, { ok: true, range, entries: history.getDaily(90) });
      } else {
        sendJson(res, 400, { ok: false, error: 'invalid range' });
      }
      return;
    }

    if (p === '/api/energy/now') {
      if (!energy) {
        sendJson(res, 503, { ok: false, error: 'energy disabled' });
        return;
      }
      const snap = energy.getSnapshot();
      const today = energyHistory ? energyHistory.getToday() : null;
      const yesterday = energyHistory ? energyHistory.getYesterday() : null;
      sendJson(res, 200, { ok: true, snapshot: snap, today, yesterday });
      return;
    }

    if (p === '/api/energy/recent') {
      if (!energy) {
        sendJson(res, 503, { ok: false, error: 'energy disabled' });
        return;
      }
      sendJson(res, 200, { ok: true, samples: energy.getRecent() });
      return;
    }

    if (p === '/api/energy/daily') {
      if (!energyHistory) {
        sendJson(res, 503, { ok: false, error: 'energy disabled' });
        return;
      }
      const days = Math.max(1, Math.min(60, Number(url.searchParams.get('days')) || 14));
      sendJson(res, 200, { ok: true, days, entries: energyHistory.getDaily(days) });
      return;
    }

    if (p === '/api/energy/hourly') {
      if (!energyHistory) {
        sendJson(res, 503, { ok: false, error: 'energy disabled' });
        return;
      }
      const date = url.searchParams.get('date'); // YYYY-MM-DD optioneel
      const snap = energy ? energy.getSnapshot() : null;
      sendJson(res, 200, {
        ok: true,
        date,
        entries: energyHistory.getHourlyMeter(date, snap),
      });
      return;
    }

    if (p === '/api/energy/today-hourly') {
      if (!energyHistory) {
        sendJson(res, 503, { ok: false, error: 'energy disabled' });
        return;
      }
      const snap = energy ? energy.getSnapshot() : null;
      sendJson(res, 200, {
        ok: true,
        entries: energyHistory.getTodayHourlyMeter(snap),
      });
      return;
    }

    if (p === '/api/energy/prices') {
      const data = prices ? prices.get() : null;
      if (!data) {
        sendJson(res, 200, { ok: true, prices: null });
        return;
      }
      sendJson(res, 200, { ok: true, ...data });
      return;
    }

    if (p === '/api/energy/stream') {
      if (!energy) {
        sendJson(res, 503, { ok: false, error: 'energy disabled' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // Stuur direct snapshot zodat de client geen lege staat ziet
      const snap = energy.getSnapshot();
      res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
      energy.subscribe(res);
      // Houd verbinding levend met periodieke pings
      const ping = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch {
          clearInterval(ping);
        }
      }, 25_000);
      res.on('close', () => clearInterval(ping));
      return;
    }

    if (p === '/api/floorplan') {
      if (!floorplan) {
        sendJson(res, 503, { ok: false, error: 'floorplan disabled' });
        return;
      }
      sendJson(res, 200, { ok: true, devices: floorplan.getAll() });
      return;
    }

    if (p === '/api/floorplan/discover') {
      const arpDevices = networkScan
        ? await networkScan.scan().catch((err) => {
            console.warn('[router] arp scan fout:', err.message);
            return [];
          })
        : [];
      const hueDevices = hueBridge && hueBridge.enabled
        ? await hueBridge.listDevices().catch((err) => {
            console.warn('[router] hue discover fout:', err.message);
            return [];
          })
        : [];
      // Merge: deep-scan resultaten verrijken ARP-entries met poort-info en
      // betere labels. Devices die alleen in de deep-scan voorkomen (offline
      // bij de live ARP-scan maar wel ooit gezien) komen er apart bij.
      let merged = arpDevices;
      if (discoveryStore) {
        const latest = discoveryStore.getLatest();
        if (latest?.devices?.length) {
          const byId = new Map(arpDevices.map((d) => [d.id, d]));
          for (const d of latest.devices) {
            const existing = byId.get(d.id);
            if (existing) {
              existing.ports = d.ports || [];
              if (!existing.label || existing.label === existing.ip) {
                existing.label = d.label || existing.label;
              }
              if (!existing.type || existing.type === 'generic') {
                existing.type = d.type || existing.type;
              }
              if (!existing.vendor) existing.vendor = d.vendor || null;
            } else {
              byId.set(d.id, { ...d });
            }
          }
          merged = Array.from(byId.values());
        }
      }
      sendJson(res, 200, {
        ok: true,
        network: merged,
        hue: hueDevices,
        discovery: discoveryStore
          ? (() => {
              const l = discoveryStore.getLatest();
              return {
                lastRunAt: l.lastRunAt,
                durationMs: l.durationMs,
                subnet: l.subnet,
                deviceCount: l.devices.length,
              };
            })()
          : null,
      });
      return;
    }

    {
      const m = p.match(/^\/api\/floorplan\/device\/([^/]+)$/);
      if (m) {
        if (!floorplan || !deviceControl) {
          sendJson(res, 503, { ok: false, error: 'floorplan disabled' });
          return;
        }
        const id = decodeURIComponent(m[1]);
        const dev = floorplan.getById(id);
        if (!dev) {
          sendJson(res, 404, { ok: false, error: 'device not found' });
          return;
        }
        const status = await deviceControl.getStatus(dev);
        sendJson(res, 200, { ok: true, device: dev, status });
        return;
      }
    }

    if (p === '/api/settings') {
      if (!settings) {
        sendJson(res, 503, { ok: false, error: 'settings disabled' });
        return;
      }
      const s = settings.getAll();
      sendJson(res, 200, {
        ok: true,
        hueBridgeHost: s.hueBridgeHost,
        hueBridgePaired: !!s.hueBridgeKey,
      });
      return;
    }

    if (p === '/api/discovery/progress') {
      if (!deepScan) {
        sendJson(res, 503, { ok: false, error: 'discovery disabled' });
        return;
      }
      sendJson(res, 200, { ok: true, ...deepScan.snapshot() });
      return;
    }

    if (p === '/api/discovery/result') {
      if (!discoveryStore) {
        sendJson(res, 503, { ok: false, error: 'discovery disabled' });
        return;
      }
      const latest = discoveryStore.getLatest();
      sendJson(res, 200, { ok: true, ...latest });
      return;
    }

    if (p === '/api/discovery/stream') {
      if (!deepScan) {
        sendJson(res, 503, { ok: false, error: 'discovery disabled' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      deepScan.subscribe(res);
      const ping = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch {
          clearInterval(ping);
        }
      }, 25_000);
      res.on('close', () => clearInterval(ping));
      return;
    }

    if (
      p.startsWith('/css/') ||
      p.startsWith('/js/') ||
      p.startsWith('/img/') ||
      p === '/favicon.ico'
    ) {
      await staticServer.serve(req, res, p);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found', path: p });
  }

  async function handlePost(req, res, p) {
    if (p === '/api/floorplan') {
      if (!floorplan) {
        sendJson(res, 503, { ok: false, error: 'floorplan disabled' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: `invalid body: ${err.message}` });
        return;
      }
      const action = body?.action;
      if (action === 'upsert') {
        const dev = floorplan.upsert(body.device);
        if (!dev) {
          sendJson(res, 400, { ok: false, error: 'invalid device' });
          return;
        }
        try {
          await floorplan.persist();
        } catch (err) {
          console.warn('[router] floorplan persist fout:', err.message);
        }
        sendJson(res, 200, { ok: true, device: dev });
        return;
      }
      if (action === 'remove') {
        const id = body?.id || body?.device?.id;
        if (!id) {
          sendJson(res, 400, { ok: false, error: 'missing id' });
          return;
        }
        const removed = floorplan.remove(id);
        try {
          await floorplan.persist();
        } catch (err) {
          console.warn('[router] floorplan persist fout:', err.message);
        }
        sendJson(res, 200, { ok: true, removed });
        return;
      }
      sendJson(res, 400, { ok: false, error: 'unknown action' });
      return;
    }

    {
      const m = p.match(/^\/api\/floorplan\/device\/([^/]+)$/);
      if (m) {
        if (!floorplan || !deviceControl) {
          sendJson(res, 503, { ok: false, error: 'floorplan disabled' });
          return;
        }
        const id = decodeURIComponent(m[1]);
        const dev = floorplan.getById(id);
        if (!dev) {
          sendJson(res, 404, { ok: false, error: 'device not found' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { ok: false, error: `invalid body: ${err.message}` });
          return;
        }
        try {
          const result = await deviceControl.applyAction(dev, body?.action || body);
          sendJson(res, 200, { ok: true, result });
        } catch (err) {
          sendJson(res, 502, { ok: false, error: err.message });
        }
        return;
      }
    }

    if (p === '/api/settings') {
      if (!settings) {
        sendJson(res, 503, { ok: false, error: 'settings disabled' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: `invalid body: ${err.message}` });
        return;
      }
      const partial = {};
      if (body && typeof body.hueBridgeHost === 'string') {
        partial.hueBridgeHost = body.hueBridgeHost;
      }
      if (body && (typeof body.hueBridgeKey === 'string' || body.hueBridgeKey === null)) {
        partial.hueBridgeKey = body.hueBridgeKey;
      }
      const next = settings.update(partial);
      try {
        await settings.persist();
      } catch (err) {
        console.warn('[router] settings persist fout:', err.message);
      }
      if (hueBridge) {
        hueBridge.setConfig({ host: next.hueBridgeHost, apiKey: next.hueBridgeKey });
      }
      sendJson(res, 200, {
        ok: true,
        hueBridgeHost: next.hueBridgeHost,
        hueBridgePaired: !!next.hueBridgeKey,
      });
      return;
    }

    if (p === '/api/discovery/start') {
      if (!deepScan) {
        sendJson(res, 503, { ok: false, error: 'discovery disabled' });
        return;
      }
      const result = deepScan.start();
      if (!result.started) {
        sendJson(res, 409, { ok: false, error: result.reason || 'cannot start' });
        return;
      }
      sendJson(res, 200, { ok: true, started: true });
      return;
    }

    if (p === '/api/discovery/cancel') {
      if (!deepScan) {
        sendJson(res, 503, { ok: false, error: 'discovery disabled' });
        return;
      }
      const result = deepScan.cancel();
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (p === '/api/settings/hue/pair') {
      if (!settings || !hueBridge) {
        sendJson(res, 503, { ok: false, error: 'hue not available' });
        return;
      }
      try {
        const result = await hueBridge.pair();
        if (result?.username) {
          settings.update({ hueBridgeKey: result.username });
          try {
            await settings.persist();
          } catch (err) {
            console.warn('[router] settings persist fout na pair:', err.message);
          }
        }
        sendJson(res, 200, { ok: true, paired: true });
      } catch (err) {
        const code = err.code === 'LINK_NOT_PRESSED' ? 428 : 502;
        sendJson(res, code, {
          ok: false,
          error: err.message,
          code: err.code || null,
        });
      }
      return;
    }

    sendJson(res, 405, { ok: false, error: 'method not allowed' });
  }

  return { handle };
}
