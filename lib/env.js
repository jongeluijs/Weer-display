import fs from 'node:fs';

/**
 * Eenvoudige .env parser. Vult process.env alleen met keys die nog niet bestaan.
 * Ondersteunt:
 *   KEY=value
 *   KEY="value met spaties"
 *   KEY='value'
 * Negeert lege regels en regels die beginnen met #.
 */
export function loadEnv(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[env] geen .env gevonden op ${filePath}`);
      return;
    }
    throw err;
  }

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
