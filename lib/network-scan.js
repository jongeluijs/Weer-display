// Lokale netwerkscan zonder externe packages. Probeert eerst `ip neigh show`
// (Linux/Pi), valt terug op `arp -an` (macOS / oudere Linux). Per gevonden
// host: reverse-DNS, MAC-vendor lookup, en HTTP-fingerprint via probeDevice
// voor identificatie van smart-home apparaten. Resultaten worden gecached.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dns from 'node:dns/promises';

import { lookupVendor } from './oui-vendors.js';
import { probeDevice } from './device-probe.js';

const execFileP = promisify(execFile);

const CACHE_TTL_MS = 60_000;
const SCAN_TIMEOUT_MS = 4_000;
const PROBE_CONCURRENCY = 6; // gelijktijdige HTTP-probes

const MAC_RE = /([0-9a-f]{2}:){5}[0-9a-f]{2}/i;
const IPV4_RE = /(\d{1,3}\.){3}\d{1,3}/;

function parseLine(line) {
  const ipMatch = line.match(IPV4_RE);
  const macMatch = line.match(MAC_RE);
  if (!ipMatch || !macMatch) return null;
  const mac = macMatch[0].toLowerCase();
  if (mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff') return null;
  return { ip: ipMatch[0], mac };
}

async function tryCommand(cmd, args) {
  try {
    const { stdout } = await execFileP(cmd, args, {
      timeout: SCAN_TIMEOUT_MS,
      maxBuffer: 1 << 20,
    });
    return stdout;
  } catch (err) {
    return null;
  }
}

async function resolveHostname(ip) {
  try {
    const names = await dns.reverse(ip);
    if (Array.isArray(names) && names.length > 0) return names[0];
  } catch {
    // negeer — geen PTR record
  }
  return null;
}

// Beperkt parallel uitvoeren van async fns. We willen niet 50 HTTP-probes
// tegelijk, dat overlast geeft op Pi en op het netwerk.
async function pMapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = null;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// Maakt een hostname leesbaar: "kees-iphone.local" → "Kees Iphone"
function prettyHost(hostname) {
  if (!hostname) return null;
  if (hostname.endsWith('.in-addr.arpa')) return null;
  let h = hostname.replace(/\.(local|lan|home)\.?$/i, '');
  if (!h) return null;
  return h
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildLabel(probe, vendor, hostname, ip) {
  if (probe?.friendlyName) return probe.friendlyName;
  const pretty = prettyHost(hostname);
  if (pretty) return pretty;
  if (vendor && vendor !== 'Privé MAC') {
    const typeLbl = probe?.type && probe.type !== 'generic' ? ` ${probe.type}` : '';
    return `${vendor}${typeLbl}`;
  }
  if (vendor === 'Privé MAC') return `Onbekend apparaat (${ip})`;
  return ip;
}

export function createNetworkScan() {
  let cache = null; // { fetchedAt, entries }

  async function rawScan() {
    let raw = await tryCommand('ip', ['neigh', 'show']);
    if (!raw) raw = await tryCommand('arp', ['-an']);
    if (!raw) {
      console.warn('[network-scan] geen scan-tool gevonden (ip/arp)');
      return [];
    }
    const seen = new Map();
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseLine(line);
      if (!parsed) continue;
      if (!seen.has(parsed.mac)) seen.set(parsed.mac, parsed);
    }
    return Array.from(seen.values());
  }

  // Voert hostname-lookup, vendor-lookup en HTTP-probe parallel uit. Geeft
  // verrijkte device entries terug. Probes hebben een korte timeout zodat
  // de totale scan niet over de 5–10s gaat ook als er veel hosts zijn.
  async function scan() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return cache.entries;
    }

    const hosts = await rawScan();
    if (hosts.length === 0) {
      cache = { fetchedAt: now, entries: [] };
      return [];
    }

    // Hostnames + vendor in parallel (gratis, geen netwerk-overlast)
    await Promise.all(
      hosts.map(async (h) => {
        h.hostname = await resolveHostname(h.ip);
        h.vendor = lookupVendor(h.mac);
      })
    );

    // HTTP-probes met concurrency-limit
    const probed = await pMapLimit(hosts, PROBE_CONCURRENCY, async (h) => {
      const probe = await probeDevice({
        ip: h.ip,
        mac: h.mac,
        hostname: h.hostname,
        vendor: h.vendor,
      });
      return { host: h, probe };
    });

    const entries = probed.map(({ host, probe }) => {
      const label = buildLabel(probe, host.vendor, host.hostname, host.ip);
      return {
        source: 'arp',
        id: `arp:${host.mac}`,
        ip: host.ip,
        mac: host.mac,
        hostname: host.hostname,
        vendor: probe?.vendor || host.vendor || null,
        type: probe?.type || 'generic',
        label,
        model: probe?.model || null,
        capabilities: probe?.capabilities || [],
        driver: probe?.driver || 'generic',
        details: probe?.details || {},
      };
    });

    cache = { fetchedAt: now, entries };
    return entries;
  }

  return { scan };
}
