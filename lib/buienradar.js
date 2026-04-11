import https from 'node:https';
import { URL } from 'node:url';

const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const BASE = 'https://gpsgadget.buienradar.nl/data/raintext/';

// Buienradar levert 25 regels met formaat "VVV|HH:MM"
//   VVV = ruwe waarde 0..255
//   mm/h = 10^((VVV - 109) / 32)
// Iedere regel vertegenwoordigt 5 minuten, dus ~2 uur vooruit.
function parseValue(v) {
  const raw = Number(v);
  if (!Number.isFinite(raw)) return { raw: 0, mmh: 0 };
  const mmh = Math.pow(10, (raw - 109) / 32);
  return {
    raw,
    mmh: mmh < 0.01 ? 0 : Math.round(mmh * 100) / 100,
  };
}

function fetchFollowingRedirects(targetUrl, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > MAX_REDIRECTS) {
      reject(new Error('too many redirects'));
      return;
    }
    const req = https.get(targetUrl, { timeout: TIMEOUT_MS }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        fetchFollowingRedirects(nextUrl, depth + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export function createBuienradarClient({ lat, lon }) {
  if (lat == null || lon == null) throw new Error('buienradar: lat/lon ontbreekt');

  const url = `${BASE}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

  async function fetchOnce() {
    const body = (await fetchFollowingRedirects(url)).trim();
    if (!body) throw new Error('empty body');
    const entries = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [vRaw, tRaw] = line.split('|');
        const { raw, mmh } = parseValue(vRaw);
        return {
          time: (tRaw || '').trim(),
          raw,
          mmh,
        };
      });
    if (entries.length === 0) throw new Error('no entries');
    return {
      fetchedAt: new Date().toISOString(),
      entries,
    };
  }

  return { fetch: fetchOnce };
}
