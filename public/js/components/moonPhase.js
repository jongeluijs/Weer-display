// Maanfase berekening en SVG rendering.
// Gebaseerd op een vereenvoudigd lunair algoritme (synodische maand = 29.53059 dagen).

import { esc } from '../util/dom.js';

// Bekende nieuwe maan referentiepunt: 6 jan 2000 18:14 UTC
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
const SYNODIC_MONTH = 29.53059; // dagen

/**
 * Bereken de maanfase als fractie 0..1.
 * 0 = nieuwe maan, 0.25 = eerste kwartier, 0.5 = volle maan, 0.75 = laatste kwartier.
 * @param {Date} date
 * @returns {number} Fase 0..1
 */
export function moonPhase(date = new Date()) {
  const diffMs = date.getTime() - KNOWN_NEW_MOON;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const cycles = diffDays / SYNODIC_MONTH;
  return cycles - Math.floor(cycles);
}

/**
 * Geef de Nederlandse naam van de maanfase.
 * @param {number} phase - Fase 0..1
 * @returns {string}
 */
export function moonPhaseName(phase) {
  if (phase < 0.0625 || phase >= 0.9375) return 'nieuwe maan';
  if (phase < 0.1875) return 'jonge maan';
  if (phase < 0.3125) return 'eerste kwartier';
  if (phase < 0.4375) return 'wassende maan';
  if (phase < 0.5625) return 'volle maan';
  if (phase < 0.6875) return 'afnemende maan';
  if (phase < 0.8125) return 'laatste kwartier';
  return 'oude maan';
}

/**
 * Render een maanfase-icoon als SVG string.
 * @param {number} phase - Fase 0..1
 * @param {number} size  - SVG grootte (default 40)
 * @returns {string} SVG HTML string
 */
export function renderMoonPhase(phase, size = 40) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const terminator = Math.cos(phase * 2 * Math.PI) * r;

  let moonSvg = '';

  if (phase >= 0.49 && phase <= 0.51) {
    // Volle maan
    moonSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8e4d4" opacity="0.85"/>`;
  } else if (phase > 0.01 && phase < 0.99) {
    const isWaxing = phase < 0.5;
    const sweepOuter = isWaxing ? 1 : 0;
    const rxT = Math.abs(terminator);
    const sweepInner = rxT < r ? (isWaxing ? 0 : 1) : (isWaxing ? 1 : 0);
    const top = { x: cx, y: cy - r };
    const bot = { x: cx, y: cy + r };
    const moonPath = `M ${top.x} ${top.y} A ${r} ${r} 0 0 ${sweepOuter} ${bot.x} ${bot.y} A ${rxT.toFixed(2)} ${r} 0 0 ${sweepInner} ${top.x} ${top.y} Z`;
    moonSvg = `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.06)"/>
      <path d="${moonPath}" fill="#e8e4d4" opacity="0.75"/>`;
  } else {
    // Nieuwe maan — alleen rand
    moonSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>`;
  }

  const name = moonPhaseName(phase);

  return `
  <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="moon-icon">
    ${moonSvg}
    <text x="${cx}" y="${size - 2}" fill="#8a93a6" font-size="${(size * 0.18).toFixed(0)}" text-anchor="middle" font-family="sans-serif">${esc(name)}</text>
  </svg>`;
}
