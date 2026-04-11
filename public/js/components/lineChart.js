import { esc } from '../util/dom.js';

// Pure SVG lijngrafiek met gevuld gebied. Geschikt voor temperatuurverloop.
// points: [{ label, value }]  — value mag null zijn, wordt overgeslagen
export function renderLineChart(points, opts = {}) {
  const {
    width = 400,
    height = 120,
    padX = 24,
    padY = 18,
    stroke = '#ffb454',
    fill = 'rgba(255,180,84,0.22)',
    unit = '°',
    showLabels = true,
  } = opts;

  if (!Array.isArray(points) || points.length === 0) {
    return '<svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  const valid = points.filter((p) => p.value != null && Number.isFinite(Number(p.value)));
  if (valid.length === 0) {
    return '<svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  const values = valid.map((p) => Number(p.value));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const n = points.length;
  const xStep = n > 1 ? innerW / (n - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * xStep;
    if (p.value == null || !Number.isFinite(Number(p.value))) return { x, y: null, value: null, label: p.label };
    const y = padY + innerH - ((Number(p.value) - min) / range) * innerH;
    return { x, y, value: Number(p.value), label: p.label };
  });

  // lijn pad (sla null punten over met M)
  let d = '';
  let started = false;
  for (const c of coords) {
    if (c.y == null) {
      started = false;
      continue;
    }
    d += (started ? ' L ' : 'M ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1);
    started = true;
  }

  // fill pad (lijn + onderkant)
  const firstValid = coords.find((c) => c.y != null);
  const lastValid = [...coords].reverse().find((c) => c.y != null);
  let fillPath = '';
  if (firstValid && lastValid) {
    fillPath = d + ` L ${lastValid.x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${firstValid.x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;
  }

  const circles = coords
    .filter((c) => c.y != null)
    .map(
      (c) =>
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${stroke}"/>`
    )
    .join('');

  const valueLabels = showLabels
    ? coords
        .filter((c) => c.y != null)
        .map(
          (c) =>
            `<text x="${c.x.toFixed(1)}" y="${(c.y - 6).toFixed(1)}" fill="#f4f6fb" font-size="10" text-anchor="middle" font-family="sans-serif">${esc(
              Math.round(c.value) + unit
            )}</text>`
        )
        .join('')
    : '';

  const xLabels = showLabels
    ? coords
        .map(
          (c) =>
            `<text x="${c.x.toFixed(1)}" y="${(height - 4).toFixed(1)}" fill="#8a93a6" font-size="9" text-anchor="middle" font-family="sans-serif">${esc(
              c.label || ''
            )}</text>`
        )
        .join('')
    : '';

  return `
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${fillPath ? `<path d="${fillPath}" fill="${fill}" stroke="none"/>` : ''}
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}
    ${valueLabels}
    ${xLabels}
  </svg>`;
}
