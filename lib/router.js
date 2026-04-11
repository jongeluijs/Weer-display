import { URL } from 'node:url';
import { createStatic } from './static.js';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

export function createRouter({ publicDir, cache, history, location }) {
  const staticServer = createStatic({ publicDir });

  async function handle(req, res) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

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

    if (
      p.startsWith('/css/') ||
      p.startsWith('/js/') ||
      p === '/favicon.ico'
    ) {
      await staticServer.serve(req, res, p);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found', path: p });
  }

  return { handle };
}
