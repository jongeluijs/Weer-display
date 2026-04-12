// Dynamische luchtkleuren en weerdeeltjes op basis van zonpositie.

import { sunProgress } from './sun.js';

/**
 * Bereken en stel de CSS custom properties in voor de luchtgradiënt.
 * Wordt elke minuut aangeroepen vanuit app.js.
 * @param {string} supStr    - Zonsopkomst "HH:MM"
 * @param {string} sunderStr - Zonsondergang "HH:MM"
 */
export function applySkyColors(supStr, sunderStr) {
  const { t, isDay } = sunProgress(supStr, sunderStr);
  const root = document.documentElement;

  if (!isDay) {
    // Nacht
    root.style.setProperty('--sky-top', '#070d1f');
    root.style.setProperty('--sky-mid', '#0c1428');
    root.style.setProperty('--sky-bot', '#111b33');
    return;
  }

  // Dag: interpoleer op basis van zonpositie (t = 0..1)
  // Ochtend/avond → warmere tinten, middag → helderder
  if (t < 0.15) {
    // Vroege ochtend — zonsopkomst
    root.style.setProperty('--sky-top', '#0f1a3d');
    root.style.setProperty('--sky-mid', '#1a2855');
    root.style.setProperty('--sky-bot', '#2a3060');
  } else if (t < 0.3) {
    // Ochtend
    root.style.setProperty('--sky-top', '#12204a');
    root.style.setProperty('--sky-mid', '#1e3468');
    root.style.setProperty('--sky-bot', '#253a6a');
  } else if (t < 0.7) {
    // Middag
    root.style.setProperty('--sky-top', '#152555');
    root.style.setProperty('--sky-mid', '#1e3a78');
    root.style.setProperty('--sky-bot', '#253f75');
  } else if (t < 0.85) {
    // Late middag
    root.style.setProperty('--sky-top', '#12204a');
    root.style.setProperty('--sky-mid', '#1e3468');
    root.style.setProperty('--sky-bot', '#253a6a');
  } else {
    // Avond — zonsondergang
    root.style.setProperty('--sky-top', '#0f1a3d');
    root.style.setProperty('--sky-mid', '#1a2855');
    root.style.setProperty('--sky-bot', '#2a3060');
  }
}

/**
 * Bepaal welke CSS weerdeeltjes-klasse actief moet zijn op basis van het weericoon.
 * @param {string} image  - Weerlive image code
 * @param {boolean} isDay - Of het dag is
 * @returns {string|null} CSS klasse of null
 */
export function weatherParticleClass(image, isDay) {
  if (!image) return isDay ? null : 'weather-night';
  const code = String(image).toLowerCase();

  if (code.includes('onweer')) return 'weather-thunder';
  if (code.includes('sneeuw') || code.includes('hagel')) return 'weather-snow';
  if (code.includes('regen') || code.includes('bui')) return 'weather-rain';
  if (code.includes('mist')) return 'weather-mist';
  if (!isDay) return 'weather-night';
  return null;
}
