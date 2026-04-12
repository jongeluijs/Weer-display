// Druktrend-indicator. Berekent de drukverschil over de laatste 3 uur
// uit history data en toont een pijl + tekst.

import { esc } from '../util/dom.js';

/**
 * Bereken de druktrend op basis van de huidige druk en history.
 * @param {number} currentPressure - Huidige luchtdruk in hPa
 * @param {Array}  hourlyEntries   - Array van history entries met { ts, luchtd }
 * @returns {{ delta: number, direction: string, color: string, arrow: string, label: string }}
 */
export function computePressureTrend(currentPressure, hourlyEntries = []) {
  const now = Date.now();
  const threeHoursAgo = now - 3 * 60 * 60 * 1000;

  // Zoek de meest recente entry van ~3 uur geleden
  const current = Number(currentPressure);
  if (!Number.isFinite(current)) {
    return { delta: 0, direction: 'stable', color: '#8a93a6', arrow: '→', label: 'stabiel' };
  }

  // Zoek entries van rond 3 uur geleden
  let oldPressure = null;
  let closestDiff = Infinity;

  for (const entry of hourlyEntries) {
    const ts = new Date(entry.ts).getTime();
    if (Number.isNaN(ts)) continue;
    const luchtd = Number(entry.luchtd);
    if (!Number.isFinite(luchtd)) continue;

    const diff = Math.abs(ts - threeHoursAgo);
    if (diff < closestDiff && ts < now) {
      closestDiff = diff;
      oldPressure = luchtd;
    }
  }

  if (oldPressure == null) {
    return { delta: 0, direction: 'stable', color: '#8a93a6', arrow: '→', label: 'stabiel' };
  }

  const delta = current - oldPressure;

  if (delta > 1) {
    return { delta, direction: 'rising', color: '#6fd598', arrow: '↗', label: 'stijgend' };
  }
  if (delta < -1) {
    return { delta, direction: 'falling', color: '#ff8c42', arrow: '↘', label: 'dalend' };
  }
  return { delta, direction: 'stable', color: '#8a93a6', arrow: '→', label: 'stabiel' };
}

/**
 * Render druktrend als compact HTML fragment.
 */
export function renderPressureTrend(trend) {
  if (!trend) return '';
  const { arrow, label, color, delta } = trend;
  const deltaText = Math.abs(delta) > 0.1 ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)})` : '';

  return `<span class="pressure-trend" style="color: ${color}">
    <span class="trend-arrow">${esc(arrow)}</span>
    <span class="trend-label">${esc(label)}${esc(deltaText)}</span>
  </span>`;
}
