import { esc } from '../util/dom.js';

// Pure SVG bargrafiek. Geschikt voor neerslag (mm) of neerslagkans (%).
export function renderBarChart(bars, opts = {}) {
  const {
    width = 400,
    height = 110,
    padX = 20,
    padY = 18,
    color = '#7aa8ff',
    unit = 'mm',
    maxOverride = null,
    showLabels = true,
  } = opts;

  if (!Array.isArray(bars) || bars.length === 0) {
    return '<svg viewBox="0 0 400 110" xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  const values = bars.map((b) => Number(b.value) || 0);
  const maxVal = maxOverride != null ? maxOverride : Math.max(...values, 1);
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = bars.length;
  const slot = innerW / n;
  const barW = Math.max(6, slot * 0.6);

  const rects = bars
    .map((b, i) => {
      const v = Number(b.value) || 0;
      const h = (v / maxVal) * innerH;
      const x = padX + i * slot + (slot - barW) / 2;
      const y = padY + innerH - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
        1
      )}" height="${h.toFixed(1)}" rx="2" fill="${color}" opacity="0.85"/>`;
    })
    .join('');

  const valueLabels = showLabels
    ? bars
        .map((b, i) => {
          const v = Number(b.value) || 0;
          const x = padX + i * slot + slot / 2;
          const h = (v / maxVal) * innerH;
          const y = padY + innerH - h - 4;
          if (v === 0) return '';
          return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="#f4f6fb" font-size="9" text-anchor="middle" font-family="sans-serif">${esc(
            (Number.isInteger(v) ? v : v.toFixed(1)) + unit
          )}</text>`;
        })
        .join('')
    : '';

  const xLabels = showLabels
    ? bars
        .map((b, i) => {
          const x = padX + i * slot + slot / 2;
          return `<text x="${x.toFixed(1)}" y="${(height - 4).toFixed(
            1
          )}" fill="#8a93a6" font-size="9" text-anchor="middle" font-family="sans-serif">${esc(
            b.label || ''
          )}</text>`;
        })
        .join('')
    : '';

  return `
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${rects}
    ${valueLabels}
    ${xLabels}
  </svg>`;
}
