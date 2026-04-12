// Herbruikbare circulaire SVG-boog gauge.
// Gebruikt stroke-dasharray/dashoffset techniek voor de gevulde boog.

import { esc } from '../util/dom.js';

/**
 * Render een circulaire gauge als SVG string.
 * @param {Object} opts
 * @param {number} opts.value     - Huidige waarde
 * @param {number} opts.min       - Minimum waarde
 * @param {number} opts.max       - Maximum waarde
 * @param {string} opts.label     - Label boven de waarde
 * @param {string} opts.unit      - Eenheid achter de waarde
 * @param {string} opts.color     - Kleur van de gevulde boog
 * @param {number} opts.size      - SVG grootte (default 100)
 * @param {string} opts.sublabel  - Extra tekst onder de waarde
 * @param {string} opts.centerHTML - HTML in het midden i.p.v. standaard value+unit
 * @param {number} opts.startAngle - Starthoek in graden (default 135)
 * @param {number} opts.sweepAngle - Hoek van de boog in graden (default 270)
 */
export function renderCircularGauge(opts = {}) {
  const {
    value = 0,
    min = 0,
    max = 100,
    label = '',
    unit = '',
    color = '#ffb454',
    size = 100,
    sublabel = '',
    centerHTML = '',
    startAngle = 135,
    sweepAngle = 270,
  } = opts;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeW = size * 0.06;

  // Bereken percentage 0..1
  const range = max - min;
  const pct = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;

  // Boogpad genereren
  const startRad = (startAngle * Math.PI) / 180;
  const sweepRad = (sweepAngle * Math.PI) / 180;
  const endRad = startRad + sweepRad;

  function polarToCart(angle) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  const start = polarToCart(startRad);
  const end = polarToCart(endRad);
  const largeArc = sweepAngle > 180 ? 1 : 0;

  // Achtergrond track (volledig)
  const trackPath = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;

  // Gevulde boog
  const fillSweep = sweepAngle * pct;
  const fillEndRad = startRad + (fillSweep * Math.PI) / 180;
  const fillEnd = polarToCart(fillEndRad);
  const fillLargeArc = fillSweep > 180 ? 1 : 0;
  const fillPath = pct > 0.001
    ? `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${fillLargeArc} 1 ${fillEnd.x.toFixed(2)} ${fillEnd.y.toFixed(2)}`
    : '';

  // Glow punt aan het uiteinde
  const glowDot = pct > 0.01
    ? `<circle cx="${fillEnd.x.toFixed(2)}" cy="${fillEnd.y.toFixed(2)}" r="${(strokeW * 0.8).toFixed(1)}" fill="${color}" opacity="0.5" class="gauge-glow"/>
       <circle cx="${fillEnd.x.toFixed(2)}" cy="${fillEnd.y.toFixed(2)}" r="${(strokeW * 0.45).toFixed(1)}" fill="${color}"/>`
    : '';

  // Display waarde
  const displayVal = Number.isFinite(value) ? Math.round(value) : '—';

  // Middeninhoud
  const centerContent = centerHTML || `
    <text x="${cx}" y="${cy - size * 0.02}" fill="#f4f6fb" font-size="${(size * 0.2).toFixed(0)}"
          text-anchor="middle" dominant-baseline="central" font-family="sans-serif"
          font-weight="300" font-variant-numeric="tabular-nums">${esc(String(displayVal))}${esc(unit)}</text>`;

  const labelSvg = label
    ? `<text x="${cx}" y="${cy - size * 0.18}" fill="#8a93a6" font-size="${(size * 0.1).toFixed(0)}"
            text-anchor="middle" font-family="sans-serif" letter-spacing="0.06em"
            text-transform="uppercase">${esc(label)}</text>`
    : '';

  const sublabelSvg = sublabel
    ? `<text x="${cx}" y="${cy + size * 0.17}" fill="#8a93a6" font-size="${(size * 0.09).toFixed(0)}"
            text-anchor="middle" font-family="sans-serif">${esc(sublabel)}</text>`
    : '';

  // Uniek gradient-id om botsingen te voorkomen
  const gradId = `gg-${label.replace(/\W/g, '').toLowerCase() || 'g'}-${Math.random().toString(36).slice(2, 6)}`;

  return `
  <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="circular-gauge">
    <defs>
      <filter id="glow-${gradId}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3"/>
      </filter>
    </defs>
    <!-- Track -->
    <path d="${trackPath}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round"/>
    <!-- Filled arc -->
    ${fillPath ? `<path d="${fillPath}" fill="none" stroke="${color}" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" opacity="0.9"/>` : ''}
    <!-- Glow end dot -->
    ${glowDot}
    <!-- Labels -->
    ${labelSvg}
    ${centerContent}
    ${sublabelSvg}
  </svg>`;
}
