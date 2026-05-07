import { sunProgress } from '../util/sun.js';
import { moonProgress } from '../util/moon.js';
import { esc } from '../util/dom.js';
import { renderRainRadarFragment, hasRainForecast } from './rainRadar.js';
import { moonPhase, moonPhaseName } from './moonPhase.js';

// Afgeplatte halve-ellips zonboog met huidige zonpositie, zonkracht +
// UV-index vast aan de zon, gouden-uur markering, maanfase 's nachts,
// en optioneel een compacte buienradar area-chart geïntegreerd binnen
// het half-ellips interieur.
export function renderSunArc(liveweer, rainEntries = [], now = new Date()) {
  const { rise, set, t, isDay } = sunProgress(liveweer?.sup, liveweer?.sunder, now);

  const showRain = hasRainForecast(rainEntries);
  const w = 260;
  const baselineY = 100;
  const riseSetLabelY = baselineY + 12;
  const h = riseSetLabelY + 6;

  const cx = w / 2;
  const cy = baselineY;
  const rx = 108;
  const ry = 75;

  const start = { x: cx - rx, y: cy };
  const end = { x: cx + rx, y: cy };
  const arcPath = `M ${start.x} ${start.y} A ${rx} ${ry} 0 0 1 ${end.x} ${end.y}`;

  // Zonpositie op halve ellips
  const angle = Math.PI * t;
  const progPoint = {
    x: cx - rx * Math.cos(angle),
    y: cy - ry * Math.sin(angle),
  };
  const progressPath =
    t > 0
      ? `M ${start.x} ${start.y} A ${rx} ${ry} 0 0 1 ${progPoint.x.toFixed(1)} ${progPoint.y.toFixed(1)}`
      : '';

  const pos = progPoint;
  const sunColor = isDay ? '#ffb454' : '#6a7390';

  const riseLabel = liveweer?.sup ? esc(liveweer.sup) : '—';
  const setLabel = liveweer?.sunder ? esc(liveweer.sunder) : '—';

  // Gouden-uur berekening (~30 min rond zonsopkomst/ondergang)
  let goldenHourSvg = '';
  let goldenHourActive = false;
  if (rise && set) {
    const riseMs = rise.getTime();
    const setMs = set.getTime();
    const nowMs = now.getTime();
    const dayLen = setMs - riseMs;

    if (dayLen > 0) {
      // Gouden uur ochtend: rise tot rise+30min
      const goldenMorningEnd = Math.min(30 * 60 * 1000 / dayLen, 0.1);
      // Gouden uur avond: set-30min tot set
      const goldenEveningStart = Math.max(1 - 30 * 60 * 1000 / dayLen, 0.9);

      // Ochtend gouden-uur boog
      const gmEndAngle = Math.PI * goldenMorningEnd;
      const gmEnd = {
        x: cx - rx * Math.cos(gmEndAngle),
        y: cy - ry * Math.sin(gmEndAngle),
      };
      goldenHourSvg += `<path d="M ${start.x} ${start.y} A ${rx} ${ry} 0 0 1 ${gmEnd.x.toFixed(1)} ${gmEnd.y.toFixed(1)}"
        fill="none" stroke="rgba(255, 200, 80, 0.35)" stroke-width="6" stroke-linecap="round"/>`;

      // Avond gouden-uur boog
      const geStartAngle = Math.PI * goldenEveningStart;
      const geStart = {
        x: cx - rx * Math.cos(geStartAngle),
        y: cy - ry * Math.sin(geStartAngle),
      };
      goldenHourSvg += `<path d="M ${geStart.x.toFixed(1)} ${geStart.y.toFixed(1)} A ${rx} ${ry} 0 0 1 ${end.x} ${end.y}"
        fill="none" stroke="rgba(255, 200, 80, 0.35)" stroke-width="6" stroke-linecap="round"/>`;

      // Check of we nu in het gouden uur zitten
      if (isDay && (t < goldenMorningEnd || t > goldenEveningStart)) {
        goldenHourActive = true;
      }
    }
  }

  // Zonkracht label
  const grNum = Number(liveweer?.gr);
  const hasGr = Number.isFinite(grNum) && grNum > 0;
  const grText = hasGr ? `${Math.round(grNum)} W/m²` : '';

  const labelX = pos.x;
  const grLabelY = pos.y - 18;

  const grLabelSvg = hasGr
    ? `
      <text x="${labelX.toFixed(1)}" y="${grLabelY.toFixed(1)}" fill="#ffb454"
            font-size="6" font-family="sans-serif" font-weight="500"
            text-anchor="middle">${esc(grText)}</text>`
    : '';

  // Zonicoon — alleen overdag op de boog
  const sunIcon = isDay
    ? `
      <g transform="translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})"
         data-action="show-sun-chart" style="cursor: pointer;">
        <circle r="18" fill="transparent"/>
        <circle r="11" fill="${sunColor}" opacity="0.22"/>
        <circle r="6" fill="${sunColor}"/>
        <g stroke="${sunColor}" stroke-width="1.3" stroke-linecap="round">
          <line x1="0" y1="-11" x2="0" y2="-14"/>
          <line x1="0" y1="11" x2="0" y2="14"/>
          <line x1="-11" y1="0" x2="-14" y2="0"/>
          <line x1="11" y1="0" x2="14" y2="0"/>
          <line x1="-8" y1="-8" x2="-10" y2="-10"/>
          <line x1="8" y1="8" x2="10" y2="10"/>
          <line x1="-8" y1="8" x2="-10" y2="10"/>
          <line x1="8" y1="-8" x2="10" y2="-10"/>
        </g>
      </g>`
    : '';

  // Maan op de boog wanneer hij boven de horizon staat (zowel overdag als 's nachts).
  const moon = moonProgress(now);
  let moonSvg = '';
  if (moon.isUp) {
    const mAngle = Math.PI * moon.t;
    const mPos = {
      x: cx - rx * Math.cos(mAngle),
      y: cy - ry * Math.sin(mAngle),
    };
    const phase = moonPhase(now);
    const phaseName = moonPhaseName(phase);
    const mr = 7;
    const terminator = Math.cos(phase * 2 * Math.PI) * mr;

    let moonBody;
    if (phase >= 0.49 && phase <= 0.51) {
      moonBody = `<circle r="${mr}" fill="#e8e4d4" opacity="0.9"/>`;
    } else if (phase > 0.01 && phase < 0.99) {
      const isWaxing = phase < 0.5;
      const sweepOuter = isWaxing ? 1 : 0;
      const rxT = Math.abs(terminator);
      const sweepInner = rxT < mr ? (isWaxing ? 0 : 1) : (isWaxing ? 1 : 0);
      const moonPath = `M 0 ${-mr} A ${mr} ${mr} 0 0 ${sweepOuter} 0 ${mr} A ${rxT.toFixed(2)} ${mr} 0 0 ${sweepInner} 0 ${-mr} Z`;
      moonBody = `
        <circle r="${mr}" fill="rgba(255,255,255,0.08)"/>
        <path d="${moonPath}" fill="#e8e4d4" opacity="0.85"/>`;
    } else {
      moonBody = `<circle r="${mr}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>`;
    }

    moonSvg = `
      <g transform="translate(${mPos.x.toFixed(1)} ${mPos.y.toFixed(1)})">
        <circle r="14" fill="transparent"/>
        ${moonBody}
        <text x="0" y="${mr + 7}" fill="#8a93a6" font-size="5" text-anchor="middle" font-family="sans-serif">${esc(phaseName)}</text>
      </g>`;
  }

  // Regengrafiek binnen de half-ellips
  const rainFragment = showRain
    ? renderRainRadarFragment({
        entries: rainEntries,
        x: 55,
        y: 45,
        width: 150,
        height: 50,
        color: '#7aa8ff',
        accent: '#7aa8ff',
        labelColor: '#8a93a6',
        padTop: 3,
        padBottom: 8,
        showTitle: false,
        showTotalMm: true,
      })
    : '';

  // Gouden-uur label
  const goldenLabel = goldenHourActive
    ? `<div class="golden-hour-label">gouden uur</div>`
    : '';

  return `
  <div class="sun-arc ${showRain ? 'with-rain' : ''}">
    <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ffb454" stop-opacity="0.15"/>
          <stop offset="50%" stop-color="#ffb454" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="#ffb454" stop-opacity="0.15"/>
        </linearGradient>
      </defs>
      ${goldenHourSvg}
      <path d="${arcPath}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-dasharray="2 4"/>
      ${progressPath ? `<path d="${progressPath}" fill="none" stroke="url(#arcGrad)" stroke-width="3" stroke-linecap="round"/>` : ''}
      ${rainFragment}
      <line x1="${(start.x - 4).toFixed(1)}" y1="${cy}" x2="${(end.x + 4).toFixed(1)}" y2="${cy}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
      ${moonSvg}
      ${sunIcon}
      ${grLabelSvg}
      <text x="${(start.x + 2).toFixed(1)}" y="${riseSetLabelY}" fill="#8a93a6" font-size="10" text-anchor="start" font-family="sans-serif">↑ ${riseLabel}</text>
      <text x="${(end.x - 2).toFixed(1)}" y="${riseSetLabelY}" fill="#8a93a6" font-size="10" text-anchor="end" font-family="sans-serif">${setLabel} ↓</text>
    </svg>
    ${goldenLabel}
  </div>`;
}
