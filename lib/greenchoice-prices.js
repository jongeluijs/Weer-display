// Wekelijkse scrape van Greenchoice variabele tarieven via overstappen.nl.
// Bewaart laatste resultaat op disk zodat we niet afhankelijk zijn van
// netwerkbeschikbaarheid bij elke pagina-load. Bij scrape-fouten blijft de
// vorige succesvolle waarde gewoon beschikbaar.

import https from 'node:https';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL =
  'https://www.overstappen.nl/energie/leveranciers/greenchoice-energie/';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagen
const STALE_MS = 7 * 24 * 60 * 60 * 1000;   // ouder dan 7d → meteen refreshen
const FETCH_TIMEOUT_MS = 15_000;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve(body));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function parseEuro(text) {
  const m = String(text).match(/([0-9]+[,.][0-9]+)/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

// Pak de tabel direct na "variabel contract" header en haal er 5 bedragen uit.
function parsePrices(html) {
  const headerIdx = html.search(/variabel\s+contract/i);
  if (headerIdx === -1) return null;
  const slice = html.slice(headerIdx, headerIdx + 4000);

  function findRow(label) {
    const re = new RegExp(
      `<td[^>]*>\\s*${label}[^<]*</td>\\s*<td[^>]*>\\s*([^<]+)</td>`,
      'i'
    );
    const m = slice.match(re);
    return m ? parseEuro(m[1]) : null;
  }

  const kwh_enkel = findRow('Enkeltarief');
  const kwh_normaal = findRow('Normaaltarief');
  const kwh_dal = findRow('Daltarief');
  const m3 = findRow('Gasprijs');
  const teruglevering = findRow('Terugleververgoeding');

  if (kwh_enkel == null || m3 == null) return null;
  return { kwh_enkel, kwh_normaal, kwh_dal, m3, teruglevering };
}

export function createGreenchoicePrices(filePath) {
  let state = null; // { fetchedAt, source, supplier, contractType, prices }
  let timer = null;
  let stopped = false;

  async function load() {
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.prices && parsed.prices.kwh_enkel != null) {
        state = parsed;
        console.log(
          `[prices] geladen: € ${parsed.prices.kwh_enkel}/kWh · € ${parsed.prices.m3}/m³ (${parsed.fetchedAt})`
        );
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[prices] load fout: ${err.message}`);
      }
    }
  }

  async function persist() {
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
  }

  async function refresh() {
    try {
      const html = await fetchText(SOURCE_URL);
      const prices = parsePrices(html);
      if (!prices) throw new Error('parse: variabel-tabel niet gevonden');
      state = {
        fetchedAt: new Date().toISOString(),
        source: 'overstappen.nl',
        sourceUrl: SOURCE_URL,
        supplier: 'Greenchoice',
        contractType: 'variabel',
        prices,
      };
      await persist();
      console.log(
        `[prices] refresh ok: € ${prices.kwh_enkel}/kWh · € ${prices.m3}/m³`
      );
      return state;
    } catch (err) {
      console.warn(`[prices] refresh fout: ${err.message}`);
      return null;
    }
  }

  function isStale() {
    if (!state || !state.fetchedAt) return true;
    const age = Date.now() - new Date(state.fetchedAt).getTime();
    return age >= STALE_MS;
  }

  async function start() {
    stopped = false;
    if (isStale()) {
      // Niet blokkeren bij start — laat refresh op de achtergrond lopen
      refresh().catch(() => {});
    }
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (stopped) return;
      refresh().catch(() => {});
    }, REFRESH_MS);
    if (timer.unref) timer.unref();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function get() {
    return state;
  }

  return { load, start, stop, refresh, get };
}
