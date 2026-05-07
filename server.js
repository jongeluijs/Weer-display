import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './lib/env.js';
import { createCache } from './lib/cache.js';
import { createClient } from './lib/weerlive.js';
import { createBuienradarClient } from './lib/buienradar.js';
import { createHistory } from './lib/history.js';
import { createEnergiemeter } from './lib/energiemeter.js';
import { createEnergyHistory } from './lib/energy-history.js';
import { createGreenchoicePrices } from './lib/greenchoice-prices.js';
import { createFloorplanStore } from './lib/floorplan-store.js';
import { createNetworkScan } from './lib/network-scan.js';
import { createHueBridge } from './lib/hue-bridge.js';
import { createDeviceControl } from './lib/device-control.js';
import { createSettingsStore } from './lib/settings-store.js';
import { createDiscoveryStore } from './lib/discovery-store.js';
import { createDeepScan } from './lib/deep-scan.js';
import { createShellyHistory } from './lib/shelly-history.js';
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

  // Energiemeter (ESPHome DSMR)
  const energyHost = process.env.ENERGY_METER_HOST || 'energiemeter.local';
  const energyPort = Number(process.env.ENERGY_METER_PORT) || 80;
  const energy = createEnergiemeter({ host: energyHost, port: energyPort });
  const energyHistory = createEnergyHistory(
    path.join(__dirname, 'data', 'energy-history.json')
  );
  await energyHistory.load();
  energy.start();

  // Wekelijkse Greenchoice tariefscrape
  const prices = createGreenchoicePrices(
    path.join(__dirname, 'data', 'greenchoice-prices.json')
  );
  await prices.load();
  await prices.start();

  // BeganeGrond plattegrond + apparaat-discovery
  const floorplan = createFloorplanStore(
    path.join(__dirname, 'data', 'floorplan.json')
  );
  await floorplan.load();
  const networkScan = createNetworkScan();

  // Runtime-configureerbare instellingen (Hue bridge IP, key) — overschrijft env
  const settings = createSettingsStore(
    path.join(__dirname, 'data', 'settings.json')
  );
  await settings.load();
  const settingsState = settings.getAll();
  const hueBridge = createHueBridge({
    host: settingsState.hueBridgeHost || process.env.HUE_BRIDGE_HOST || '192.168.1.159',
    apiKey: settingsState.hueBridgeKey || process.env.HUE_BRIDGE_KEY || null,
  });
  const deviceControl = createDeviceControl();

  // Diepe netwerkscan (~maandelijks handmatig). Resultaat persistent in
  // data/discovery.json voor merge in /api/floorplan/discover.
  const discoveryStore = createDiscoveryStore(
    path.join(__dirname, 'data', 'discovery.json')
  );
  await discoveryStore.load();
  const deepScan = createDeepScan({ store: discoveryStore });

  // Per-device historie voor Shelly PM-apparaten op de plattegrond.
  // Eén bestand per device in data/shelly/.
  const shellyHistory = createShellyHistory(path.join(__dirname, 'data', 'shelly'));

  async function sampleShellyDevices() {
    const devices = floorplan.getAll().filter(
      (d) => d.driver === 'shelly' || d.driver === 'shelly_gen2'
    );
    if (devices.length === 0) return;
    for (const dev of devices) {
      try {
        const status = await deviceControl.getStatus(dev);
        if (!status?.online) continue;
        await shellyHistory.ingest(dev.id, {
          power_w: status.power_w,
          total_kwh: status.total_kwh,
        });
      } catch (err) {
        console.warn(`[shelly-history] ${dev.id} sample fout: ${err.message}`);
      }
    }
    try {
      await shellyHistory.persistAll();
    } catch (err) {
      console.warn(`[shelly-history] persist fout: ${err.message}`);
    }
  }

  const SHELLY_SAMPLE_MS = 60_000;
  const shellyTimer = setInterval(sampleShellyDevices, SHELLY_SAMPLE_MS);
  // Eerste sample direct, zodat de hover-popup niet leeg blijft tot de volgende minuut.
  sampleShellyDevices();

  // Sample meterstanden + vermogen één keer per minuut naar history
  const ENERGY_SAMPLE_MS = 60_000;
  const energyTimer = setInterval(async () => {
    const snap = energy.getSnapshot();
    if (Number.isFinite(snap.power_kw)) {
      energyHistory.ingestPower(snap.power_kw * 1000);
    }
    if (Number.isFinite(snap.total_kwh) || Number.isFinite(snap.gas_m3)) {
      energyHistory.snapshotMeter(
        Number.isFinite(snap.total_kwh) ? snap.total_kwh : null,
        Number.isFinite(snap.gas_m3) ? snap.gas_m3 : null
      );
      energyHistory.snapshotHourMeter(
        Number.isFinite(snap.total_kwh) ? snap.total_kwh : null,
        Number.isFinite(snap.gas_m3) ? snap.gas_m3 : null
      );
      energyHistory.prune();
      try {
        await energyHistory.persist();
      } catch (err) {
        console.warn(`[weer-display] energy-history persist fout: ${err.message}`);
      }
    }
  }, ENERGY_SAMPLE_MS);

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
  const router = createRouter({
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
    shellyHistory,
  });

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
    clearInterval(energyTimer);
    clearInterval(shellyTimer);
    energy.stop();
    prices.stop();
    try {
      await history.persist();
      await energyHistory.persist();
      await shellyHistory.persistAll();
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
