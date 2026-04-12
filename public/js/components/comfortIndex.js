// Comfort-index badge. Combineert gevoelstemperatuur, vochtigheid en wind
// tot een comfort-score met gekleurde badge.

import { esc } from '../util/dom.js';

/**
 * Bereken comfort-index op basis van weer-parameters.
 * @param {Object} opts
 * @param {number} opts.gtemp  - Gevoelstemperatuur (°C)
 * @param {number} opts.lv     - Luchtvochtigheid (%)
 * @param {number} opts.windbft - Windkracht (Beaufort)
 * @returns {{ level: string, label: string, color: string, bgColor: string }}
 */
export function computeComfort({ gtemp, lv, windbft } = {}) {
  const gt = Number(gtemp);
  const humidity = Number(lv);
  const wind = Number(windbft);

  if (!Number.isFinite(gt)) {
    return { level: 'unknown', label: '—', color: '#8a93a6', bgColor: 'rgba(138,147,166,0.15)' };
  }

  // IJskoud
  if (gt < 0) {
    return { level: 'freezing', label: 'ijskoud', color: '#88bbff', bgColor: 'rgba(136,187,255,0.18)' };
  }

  // Koud
  if (gt < 10) {
    return { level: 'cold', label: 'koud', color: '#7aa8ff', bgColor: 'rgba(122,168,255,0.18)' };
  }

  // Fris
  if (gt < 18) {
    return { level: 'cool', label: 'fris', color: '#77cccc', bgColor: 'rgba(119,204,204,0.18)' };
  }

  // Aangenaam: gtemp 18-24, ideaal met lage vochtigheid en weinig wind
  if (gt <= 24) {
    const humidOk = !Number.isFinite(humidity) || (humidity >= 30 && humidity <= 70);
    const windOk = !Number.isFinite(wind) || wind <= 4;
    if (humidOk && windOk) {
      return { level: 'pleasant', label: 'aangenaam', color: '#6fd598', bgColor: 'rgba(111,213,152,0.18)' };
    }
    return { level: 'fair', label: 'redelijk', color: '#aacc55', bgColor: 'rgba(170,204,85,0.18)' };
  }

  // Warm
  if (gt <= 30) {
    return { level: 'warm', label: 'warm', color: '#ffb454', bgColor: 'rgba(255,180,84,0.18)' };
  }

  // Heet
  if (gt <= 35) {
    return { level: 'hot', label: 'heet', color: '#ff8c42', bgColor: 'rgba(255,140,66,0.18)' };
  }

  // Extreem heet
  return { level: 'extreme', label: 'snikheet', color: '#ff5a5f', bgColor: 'rgba(255,90,95,0.18)' };
}

/**
 * Render de comfort-badge als HTML.
 */
export function renderComfortBadge(liveweer) {
  if (!liveweer) return '';

  const comfort = computeComfort({
    gtemp: liveweer.gtemp,
    lv: liveweer.lv,
    windbft: liveweer.windbft,
  });

  if (comfort.level === 'unknown') return '';

  return `<span class="comfort-badge" style="color: ${comfort.color}; background: ${comfort.bgColor}; border-color: ${comfort.color}40">${esc(comfort.label)}</span>`;
}
