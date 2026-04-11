import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './lib/env.js';
import { createCache } from './lib/cache.js';
import { createClient } from './lib/weerlive.js';
import { createBuienradarClient } from './lib/buienradar.js';
import { createHistory } from './lib/history.js';
import { createRouter } from './lib/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const REFRESH_MS = 10 * 60 * 1000; // 10 minuten
const CACHE_TTL_MS = 10 * 60 * 1000;

async function main() {
  loadEnv(path.join(__dirname, '.env'));

  const apiKey = process.env.WEERLIVE_API_KEY;
  const location = process.env.WEERLIVE_LOCATION || 'Eindhoven';
  // defaults voor Eindhoven centrum
  const lat = process.env.WEATHER_LAT || '51.4416';
  const lon = process.env.WEATHER_LON || '5.4697';

  if (!apiKey) {
    console.error('[weer-display] WEERLIVE_API_KEY ontbreekt in .env');
    process.exit(1);
  }

  const cache = createCache({ ttlMs: CACHE_TTL_MS });
  const history = createHistory(path.join(__dirname, 'data', 'weather-history.json'));
  await history.load();

  const client = createClient({ key: apiKey, location });
  const rainClient = createBuienradarClient({ lat, lon });

  async function refresh() {
    const [weatherRes, rainRes] = await Promise.allSettled([
      client.fetch(),
      rainClient.fetch(),
    ]);

    if (weatherRes.status === 'fulfilled') {
      const data = weatherRes.value;
      cache.set('weather', data);
      try {
        history.ingest(data);
        history.rollupIfNewDay(new Date());
        history.prune();
        await history.persist();
      } catch (err) {
        console.warn(`[weer-display] history fout: ${err.message}`);
      }
      console.log(`[weer-display] weer ok @ ${new Date().toISOString()}`);
    } else {
      console.warn(`[weer-display] weer fout: ${weatherRes.reason?.message || weatherRes.reason}`);
    }

    if (rainRes.status === 'fulfilled') {
      cache.set('rain', rainRes.value);
      const nRain = rainRes.value.entries.filter((e) => e.mmh > 0).length;
      console.log(`[weer-display] buienradar ok (${nRain}/${rainRes.value.entries.length} rain bins)`);
    } else {
      console.warn(`[weer-display] buienradar fout: ${rainRes.reason?.message || rainRes.reason}`);
    }
  }

  // eerste fetch meteen, daarna op interval
  await refresh();
  const timer = setInterval(refresh, REFRESH_MS);

  const publicDir = path.join(__dirname, 'public');
  const router = createRouter({ publicDir, cache, history, location });

  const server = http.createServer((req, res) => {
    router.handle(req, res).catch((err) => {
      console.error('[weer-display] router fout:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'internal' }));
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`[weer-display] server draait op http://localhost:${PORT}`);
    console.log(`[weer-display] locatie: ${location} (${lat}, ${lon}), refresh elke ${REFRESH_MS / 60000} min`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[weer-display] ${signal} ontvangen, afsluiten...`);
    clearInterval(timer);
    try {
      await history.persist();
    } catch (err) {
      console.warn('[weer-display] persist bij shutdown faalde:', err.message);
    }
    server.close(() => {
      process.exit(0);
    });
    // fallback als server.close blijft hangen
    setTimeout(() => process.exit(0), 3000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[weer-display] fatal:', err);
  process.exit(1);
});
