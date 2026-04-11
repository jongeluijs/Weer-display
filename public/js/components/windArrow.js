import { esc } from '../util/dom.js';

// Roteerbare windpijl op een cirkel met N/O/Z/W labels.
// Conventie: windrgr is de richting waar de wind VANDAAN komt.
// De pijl wijst mee met de wind (waar hij HEEN gaat), dus we roteren met +180°.
export function renderWindArrow(windrgr, opts = {}) {
  const {
    size = 60,
    showCompass = true,
    bft = null,
  } = opts;

  const deg = Number(windrgr);
  const hasWind = Number.isFinite(deg);
  const rotation = hasWind ? deg + 180 : 0;

  // kleurintensiteit op basis van bft (0..12)
  const bftNum = Number(bft);
  const intensity = Number.isFinite(bftNum) ? Math.min(1, bftNum / 8) : 0.6;
  const arrowColor = `rgba(255, 180, 84, ${(0.5 + intensity * 0.5).toFixed(2)})`;

  const compass = showCompass
    ? `
    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`
    : '';

  const arrow = hasWind
    ? `
    <g transform="rotate(${rotation.toFixed(1)} 50 50)">
      <path d="M 50 18 L 58 38 L 52 36 L 52 74 L 48 74 L 48 36 L 42 38 Z"
            fill="${arrowColor}" stroke="${arrowColor}" stroke-width="1" stroke-linejoin="round"/>
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
