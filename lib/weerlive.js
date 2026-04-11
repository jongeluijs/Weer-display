import https from 'node:https';

const BASE = 'https://weerlive.nl/api/weerlive_api_v2.php';
const TIMEOUT_MS = 10_000;

/**
 * Weerlive v2 API client. Haalt live weer + verwachtingen op voor één locatie.
 */
export function createClient({ key, location }) {
  if (!key) throw new Error('weerlive: key ontbreekt');
  if (!location) throw new Error('weerlive: locatie ontbreekt');

  const url = `${BASE}?key=${encodeURIComponent(key)}&locatie=${encodeURIComponent(location)}`;

  function fetchOnce() {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: TIMEOUT_MS }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(body);
            if (!json || !Array.isArray(json.liveweer) || json.liveweer.length === 0) {
              reject(new Error('invalid payload'));
              return;
            }
            resolve({
              fetchedAt: new Date().toISOString(),
              liveweer: json.liveweer[0],
              dagverwachting: Array.isArray(json.wk_verw) ? json.wk_verw : [],
              uurverwachting: Array.isArray(json.uur_verw) ? json.uur_verw : [],
              info: Array.isArray(json.api) ? json.api[0] : null,
            });
          } catch (err) {
            reject(new Error(`invalid payload: ${err.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  return {
    fetch: fetchOnce,
  };
}
