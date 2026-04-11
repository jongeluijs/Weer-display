import { esc } from '../util/dom.js';

// Verbeterd windkompas met Beaufort-schaalringen, kardinale richtinglabels
// en proportionele pijl.
export function renderWindArrow(windrgr, opts = {}) {
  const {
    size = 60,
    showCompass = true,
    bft = null,
  } = opts;

  const deg = Number(windrgr);
  const hasWind = Number.isFinite(deg);
  const rotation = hasWind ? deg + 180 : 0;

  const bftNum = Number(bft);
  const intensity = Number.isFinite(bftNum) ? Math.min(1, bftNum / 8) : 0.6;
  const arrowColor = `rgba(255, 180, 84, ${(0.5 + intensity * 0.5).toFixed(2)})`;

  // Beaufort-schaalring: buitenring met kleurintensiteit
  const bftRingOpacity = Number.isFinite(bftNum) ? Math.min(0.5, bftNum / 12 * 0.5) : 0.1;

  // Kardinale richtinglabels
  const cardinals = showCompass
    ? `
    <text x="50" y="14" fill="rgba(255,255,255,0.35)" font-size="8" text-anchor="middle" font-family="sans-serif" font-weight="500">N</text>
    <text x="88" y="53" fill="rgba(255,255,255,0.25)" font-size="7" text-anchor="middle" font-family="sans-serif">O</text>
    <text x="50" y="92" fill="rgba(255,255,255,0.25)" font-size="7" text-anchor="middle" font-family="sans-serif">Z</text>
    <text x="12" y="53" fill="rgba(255,255,255,0.25)" font-size="7" text-anchor="middle" font-family="sans-serif">W</text>`
    : '';

  const compass = showCompass
    ? `
    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
    <circle cx="50" cy="50" r="44" fill="none" stroke="${arrowColor}" stroke-width="3" opacity="${bftRingOpacity.toFixed(2)}"
            stroke-dasharray="${(bftNum / 12 * 276).toFixed(0)} 276" stroke-linecap="round"
            transform="rotate(-90 50 50)"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
    <!-- Kompasstreepjes -->
    <line x1="50" y1="8" x2="50" y2="12" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    <line x1="50" y1="88" x2="50" y2="92" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>
    <line x1="8" y1="50" x2="12" y2="50" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>
    <line x1="88" y1="50" x2="92" y2="50" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>
    ${cardinals}`
    : '';

  // Pijllengte proportioneel aan windsnelheid
  const arrowLen = hasWind && Number.isFinite(bftNum)
    ? 18 + Math.min(18, bftNum * 2.5)
    : 30;
  const tipY = 50 - arrowLen;
  const baseY = 50 + arrowLen * 0.6;

  const arrow = hasWind
    ? `
    <g transform="rotate(${rotation.toFixed(1)} 50 50)">
      <path d="M 50 ${tipY.toFixed(0)} L 57 ${(tipY + 16).toFixed(0)} L 52 ${(tipY + 14).toFixed(0)} L 52 ${baseY.toFixed(0)} L 48 ${baseY.toFixed(0)} L 48 ${(tipY + 14).toFixed(0)} L 43 ${(tipY + 16).toFixed(0)} Z"
            fill="${arrowColor}" stroke="${arrowColor}" stroke-width="0.5" stroke-linejoin="round"/>
    </g>`
    : `<circle cx="50" cy="50" r="4" fill="#8a93a6"/>`;

  return `
  <svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" class="wind-arrow">
    ${compass}
    ${arrow}
  </svg>`;
}

// Compacte versie zonder kompas (voor forecast kaarten)
export function renderWindArrowCompact(windrgr, size = 24) {
  const deg = Number(windrgr);
  const hasWind = Number.isFinite(deg);
  const rotation = hasWind ? deg + 180 : 0;
  if (!hasWind) {
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="4" fill="#8a93a6"/></svg>`;
  }
  return `
  <svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${rotation.toFixed(1)} 50 50)">
      <path d="M 50 12 L 62 38 L 54 35 L 54 82 L 46 82 L 46 35 L 38 38 Z"
            fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
    </g>
  </svg>`;
}
