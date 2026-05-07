// Diepe netwerkscan met fasen + voortgangs-SSE.
//
// Fase 1 (sweep): TCP-connect op een paar veelgebruikte poorten (80, 443,
//   22, 53, 8080) over alle 254 hosts in het subnet — wakker maken zonder
//   ICMP/root nodig te hebben. Hosts die op minstens één poort antwoorden
//   beschouwen we als "alive". ARP-cache wordt achteraf geconsulteerd voor
//   MAC's.
// Fase 2 (port scan): Voor iedere alive host parallel TCP-connect op de
//   top-100 poorten uit `service-identify.js`.
// Fase 3 (identify): Per (host, open_port) een banner-grab / HTTP-titel
//   ophalen om uit te vinden wat erachter draait. Daarna nog `probeDevice()`
//   uit `device-probe.js` voor vendor/type-vaststelling.
//
// Voortgang gaat via subscribe(res) → SSE `event: progress`. Iedere event
// bevat: { phase, hostsTotal, hostsAlive, hostsDone, currentIp,
//          devicesAnalyzed, totalDevices }.

import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { detectSubnet } from './subnet-detect.js';
import { TOP_PORTS, identifyService, tcpProbe } from './service-identify.js';
import { lookupVendor } from './oui-vendors.js';
import { probeDevice } from './device-probe.js';

const execFileP = promisify(execFile);

const SWEEP_PORTS = [80, 443, 22, 53, 8080, 5000, 8123];
const SWEEP_CONCURRENCY = 32;
const SWEEP_TIMEOUT_MS = 800;

const PORTSCAN_PORT_CONCURRENCY = 16; // parallelle poort-checks per host
const PORTSCAN_HOST_CONCURRENCY = 4;  // hoeveel hosts tegelijk
const PORTSCAN_TIMEOUT_MS = 700;

const IDENTIFY_CONCURRENCY = 4;       // hoeveel banner-grabs tegelijk

async function pMapLimit(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = null;
      }
      done++;
      if (onProgress) onProgress(done, items.length, items[i], results[i]);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length || 1) },
    worker
  );
  await Promise.all(workers);
  return results;
}

// Lees ARP-cache na een sweep zodat we MAC's bij gevonden IP's kunnen koppelen.
async function readArpCache() {
  const map = new Map();
  let raw = null;
  try {
    raw = (await execFileP('ip', ['neigh', 'show'], { timeout: 4000 })).stdout;
  } catch {
    try {
      raw = (await execFileP('arp', ['-an'], { timeout: 4000 })).stdout;
    } catch {
      return map;
    }
  }
  if (!raw) return map;
  const macRe = /([0-9a-f]{2}:){5}[0-9a-f]{2}/i;
  const ipRe = /(\d{1,3}\.){3}\d{1,3}/;
  for (const line of raw.split(/\r?\n/)) {
    const ipM = line.match(ipRe);
    const macM = line.match(macRe);
    if (!ipM || !macM) continue;
    const mac = macM[0].toLowerCase();
    if (mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff') continue;
    map.set(ipM[0], mac);
  }
  return map;
}

async function resolveHostname(ip) {
  try {
    const names = await dns.reverse(ip);
    if (Array.isArray(names) && names.length > 0) return names[0];
  } catch {
    // negeer
  }
  return null;
}

export function createDeepScan({ store }) {
  // State machine. `running` is `null` als er niets loopt, anders een object
  // met de huidige progress + cancel-flag.
  let running = null;
  const subscribers = new Set();

  function snapshot() {
    if (!running) {
      const last = store ? store.getLatest() : null;
      return {
        phase: 'idle',
        running: false,
        lastRunAt: last?.lastRunAt || null,
        durationMs: last?.durationMs || null,
        subnet: last?.subnet || null,
        deviceCount: last?.devices?.length || 0,
      };
    }
    return {
      phase: running.phase,
      running: true,
      subnet: running.subnet,
      hostsTotal: running.hostsTotal,
      hostsAlive: running.aliveHosts.length,
      hostsDone: running.hostsDone,
      currentIp: running.currentIp || null,
      devicesAnalyzed: running.devicesAnalyzed,
      totalDevices: running.aliveHosts.length,
      startedAt: running.startedAt,
      cancelled: running.cancelled,
    };
  }

  function broadcast(eventName) {
    const data = JSON.stringify(snapshot());
    const payload = `event: ${eventName}\ndata: ${data}\n\n`;
    for (const res of subscribers) {
      try {
        res.write(payload);
      } catch {
        subscribers.delete(res);
      }
    }
  }

  function subscribe(res) {
    subscribers.add(res);
    // Stuur direct snapshot zodat client niet hoeft te wachten op eerste event
    try {
      res.write(`event: progress\ndata: ${JSON.stringify(snapshot())}\n\n`);
    } catch {
      subscribers.delete(res);
    }
    res.on('close', () => subscribers.delete(res));
  }

  async function runScan() {
    const subnet = detectSubnet();
    if (!subnet) {
      throw new Error('Geen geschikt netwerk gevonden voor scan');
    }
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    running = {
      phase: 'sweep',
      subnet: `${subnet.network}/${subnet.prefix}`,
      hostsTotal: subnet.hosts.length,
      aliveHosts: [],
      hostsDone: 0,
      currentIp: null,
      devicesAnalyzed: 0,
      cancelled: false,
      startedAt,
    };
    broadcast('progress');

    // ---- Fase 1: sweep ----
    await pMapLimit(
      subnet.hosts,
      SWEEP_CONCURRENCY,
      async (ip) => {
        if (running.cancelled) return null;
        running.currentIp = ip;
        // Probeer een aantal sweep-poorten parallel; eerste hit = alive
        const checks = SWEEP_PORTS.map((p) => tcpProbe(ip, p, SWEEP_TIMEOUT_MS));
        const results = await Promise.all(checks);
        const alive = results.some(Boolean);
        if (alive) running.aliveHosts.push(ip);
        return alive;
      },
      (done) => {
        running.hostsDone = done;
        // Iedere 4 voltooide hosts een progress-event sturen
        if (done % 4 === 0 || done === subnet.hosts.length) {
          broadcast('progress');
        }
      }
    );

    if (running.cancelled) return finishCancelled(subnet, startedAt, startTime);

    // ---- Fase 1b: ARP + reverse-DNS voor alive hosts ----
    const arpMap = await readArpCache();
    const enriched = await Promise.all(
      running.aliveHosts.map(async (ip) => ({
        ip,
        mac: arpMap.get(ip) || null,
        hostname: await resolveHostname(ip),
      }))
    );

    // ---- Fase 2: port scan per alive host ----
    running.phase = 'port_scan';
    running.hostsDone = 0;
    broadcast('progress');

    const hostResults = [];
    await pMapLimit(
      enriched,
      PORTSCAN_HOST_CONCURRENCY,
      async (h) => {
        if (running.cancelled) return null;
        running.currentIp = h.ip;
        const openPorts = [];
        await pMapLimit(TOP_PORTS, PORTSCAN_PORT_CONCURRENCY, async (port) => {
          if (running.cancelled) return null;
          const ok = await tcpProbe(h.ip, port, PORTSCAN_TIMEOUT_MS);
          if (ok) openPorts.push(port);
        });
        openPorts.sort((a, b) => a - b);
        hostResults.push({ ...h, openPorts });
        return openPorts;
      },
      (done) => {
        running.hostsDone = done;
        running.devicesAnalyzed = done;
        broadcast('progress');
      }
    );

    if (running.cancelled) return finishCancelled(subnet, startedAt, startTime);

    // ---- Fase 3: identificatie per (host, port) + device-probe ----
    running.phase = 'identify';
    running.hostsDone = 0;
    running.devicesAnalyzed = 0;
    broadcast('progress');

    const finalDevices = [];
    await pMapLimit(
      hostResults,
      IDENTIFY_CONCURRENCY,
      async (h) => {
        if (running.cancelled) return null;
        running.currentIp = h.ip;
        const vendor = h.mac ? lookupVendor(h.mac) : null;
        // Banner-grab per open poort, parallel
        const services = await Promise.all(
          h.openPorts.map((p) => identifyService(h.ip, p).catch(() => null))
        );
        // Device-probe (HTTP-fingerprint) voor vendor/type
        const probe = await probeDevice({
          ip: h.ip,
          mac: h.mac,
          hostname: h.hostname,
          vendor,
        });
        finalDevices.push({
          source: 'deep',
          id: `arp:${h.mac || h.ip}`,
          ip: h.ip,
          mac: h.mac,
          hostname: h.hostname,
          vendor: probe?.vendor || vendor || null,
          type: probe?.type || 'generic',
          label:
            probe?.friendlyName ||
            (h.hostname && !h.hostname.endsWith('.in-addr.arpa') ? h.hostname : null) ||
            (vendor && vendor !== 'Privé MAC' ? vendor : null) ||
            h.ip,
          model: probe?.model || null,
          driver: probe?.driver || 'generic',
          local_endpoint: probe?.driver === 'hue' ? `http://${h.ip}` : null,
          ports: services.filter(Boolean).map((s) => ({
            port: s.port,
            name: s.name,
            kind: s.kind,
            banner: s.banner,
            server: s.server,
            title: s.title,
          })),
        });
        return finalDevices.length;
      },
      (done) => {
        running.hostsDone = done;
        running.devicesAnalyzed = done;
        broadcast('progress');
      }
    );

    if (running.cancelled) return finishCancelled(subnet, startedAt, startTime);

    running.phase = 'complete';
    running.currentIp = null;
    const durationMs = Date.now() - startTime;

    // Sorteer op IP voor stabiele output
    finalDevices.sort((a, b) => {
      const ai = (a.ip || '').split('.').map(Number);
      const bi = (b.ip || '').split('.').map(Number);
      for (let i = 0; i < 4; i++) {
        if ((ai[i] || 0) !== (bi[i] || 0)) return (ai[i] || 0) - (bi[i] || 0);
      }
      return 0;
    });

    if (store) {
      store.save({
        lastRunAt: startedAt,
        durationMs,
        subnet: `${subnet.network}/${subnet.prefix}`,
        devices: finalDevices,
      });
      try {
        await store.persist();
      } catch (err) {
        console.warn('[deep-scan] persist fout:', err.message);
      }
    }
    broadcast('progress');
    broadcast('complete');
    running = null;
    broadcast('progress');
    return finalDevices;
  }

  async function finishCancelled(subnet, startedAt, startTime) {
    running.phase = 'cancelled';
    running.currentIp = null;
    broadcast('cancelled');
    broadcast('progress');
    running = null;
    broadcast('progress');
    return [];
  }

  function start() {
    if (running) return { started: false, reason: 'already running' };
    runScan().catch((err) => {
      console.error('[deep-scan] fout:', err);
      if (running) {
        running.phase = 'error';
        running.error = err.message;
        broadcast('error');
      }
      running = null;
      broadcast('progress');
    });
    return { started: true };
  }

  function cancel() {
    if (!running) return { cancelled: false, reason: 'not running' };
    running.cancelled = true;
    return { cancelled: true };
  }

  function isRunning() {
    return !!running;
  }

  return {
    start,
    cancel,
    isRunning,
    snapshot,
    subscribe,
  };
}
