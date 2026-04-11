import { esc } from '../util/dom.js';

// Bepalen of er regen verwacht wordt in de komende 2 uur (buienradar data).
// Een enkele bin met mmh > 0 is voldoende.
export function hasRainForecast(entries) {
  if (!Array.isArray(entries)) return false;
  return entries.some((e) => Number(e.mmh) > 0);
}

// Render buienradar entries als een gevulde area-chart binnen een gegeven
// bounding box. Retourneert SVG fragmenten die direct in een <svg> passen
// (geen eigen svg-wrapper, zodat het in de sun-arc ingebed kan worden).
// Bounding box wordt geschaald op basis van de maximum mmh in de reeks.
export function renderRainRadarFragment({
  entries,
  x = 0,
  y = 0,
  width = 260,
  height = 46,
  color = '#7aa8ff',
  accent = '#7aa8ff',
  labelColor = '#8a93a6',
  padTop = 8,
  padBottom = 12,
  showTitle = true,
  showTotalMm = false,
}) {
  if (!Array.isArray(entries) || entries.length === 0) return '';

  const n = entries.length;
  const values = entries.map((e) => Math.max(0, Number(e.mmh) || 0));
  const maxVal = Math.max(0.2, ...values); // minimum 0.2 mm/h zodat lichte motregen zichtbaar is

  // verticale ruimte voor de area; padding boven/onder is configureerbaar
  // zodat we hem compact binnen de sun-arc kunnen plaatsen.
  const chartTop = y + padTop;
  const chartBottom = y + height - padBottom;
  const chartH = chartBottom - chartTop;
  const xStep = width / (n - 1 || 1);

  // Intensiteitskleur per mmh waarde
  function intensityColor(mmh) {
    if (mmh >= 5) return '#7733cc';    // paars: zware regen
    if (mmh >= 2) return '#3355cc';    // donkerblauw
    if (mmh >= 0.5) return '#4a7aff';  // mediumblauw
    return '#7aa8ff';                   // lichtblauw
  }

  // area pad: van links-onder via lijn via rechts-onder weer dicht
  const pts = values.map((v, i) => {
    const px = x + i * xStep;
    const py = chartBottom - (v / maxVal) * chartH;
    return { px, py, v };
  });

  let linePath = '';
  pts.forEach((p, i) => {
    linePath += (i === 0 ? 'M ' : ' L ') + p.px.toFixed(1) + ' ' + p.py.toFixed(1);
  });
  const areaPath =
    linePath +
    ` L ${(x + width).toFixed(1)} ${chartBottom.toFixed(1)}` +
    ` L ${x.toFixed(1)} ${chartBottom.toFixed(1)} Z`;

  // Multi-stop gradient op basis van intensiteit
  const gradId = `rainIntensity-${Math.random().toString(36).slice(2, 6)}`;
  const gradStops = pts.map((p, i) => {
    const pct = ((i / (pts.length - 1)) * 100).toFixed(1);
    const col = intensityColor(p.v);
    return `<stop offset="${pct}%" stop-color="${col}"/>`;
  }).join('');
  const intensityGradient = `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">${gradStops}</linearGradient>`;

  // intensiteits-categorie label op basis van max
  let intensityLabel = 'lichte regen';
  if (maxVal >= 5) intensityLabel = 'zware regen';
  else if (maxVal >= 2) intensityLabel = 'matige regen';
  else if (maxVal >= 0.5) intensityLabel = 'regen';

  // totaal in mm over de hele periode (~2 uur, 5 min per bin)
  const totalMm = values.reduce((s, v) => s + (v * 5) / 60, 0);

  const startTime = entries[0]?.time || '';
  const endTime = entries[entries.length - 1]?.time || '';
  const midTime = entries[Math.floor(n / 2)]?.time || '';

  // subtiele baseline
  const baseline = `<line x1="${x.toFixed(1)}" y1="${chartBottom.toFixed(1)}" x2="${(x + width).toFixed(
    1
  )}" y2="${chartBottom.toFixed(1)}" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>`;

  // tijd labels onderaan
  const timeLabels = `
    <text x="${(x + 2).toFixed(1)}" y="${(y + height - 1).toFixed(
    1
  )}" fill="${labelColor}" font-size="8" font-family="sans-serif" text-anchor="start">${esc(startTime)}</text>
    <text x="${(x + width / 2).toFixed(1)}" y="${(y + height - 1).toFixed(
    1
  )}" fill="${labelColor}" font-size="8" font-family="sans-serif" text-anchor="middle">${esc(midTime)}</text>
    <text x="${(x + width - 2).toFixed(1)}" y="${(y + height - 1).toFixed(
    1
  )}" fill="${labelColor}" font-size="8" font-family="sans-serif" text-anchor="end">${esc(endTime)}</text>
  `;

  // titel + totaal (optioneel, uit bij compacte inbouw)
  const title = showTitle
    ? `
    <text x="${(x + width / 2).toFixed(1)}" y="${(y + 5).toFixed(
      1
    )}" fill="${labelColor}" font-size="8" font-family="sans-serif" text-anchor="middle" letter-spacing="0.5">BUIENRADAR · ${esc(
      intensityLabel.toUpperCase()
    )}${totalMm > 0 ? ' · ' + totalMm.toFixed(1) + ' MM' : ''}</text>
  `
    : '';

  // Compact mm-totaal label (zonder volledige titel). Midden-boven, net
  // buiten de bounding box zodat het de grafiek niet overlapt.
  const totalMmLabel =
    showTotalMm && totalMm > 0
      ? `
    <text x="${(x + width / 2).toFixed(1)}" y="${(y - 2).toFixed(
          1
        )}" fill="${color}" font-size="6" font-family="sans-serif" font-weight="600" text-anchor="middle">${totalMm.toFixed(
          1
        )} mm</text>
  `
      : '';

  return `
    <defs>${intensityGradient}</defs>
    ${baseline}
    <path d="${areaPath}" fill="url(#${gradId})" fill-opacity="0.35" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="url(#${gradId})" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>
    ${title}
    ${totalMmLabel}
    ${timeLabels}
  `;
}
