import { sunProgress, uvFromGr } from '../util/sun.js';
import { esc } from '../util/dom.js';
import { renderRainRadarFragment, hasRainForecast } from './rainRadar.js';

// Afgeplatte halve-ellips zonboog met huidige zonpositie, zonkracht +
// UV-index vast aan de zon, en optioneel een compacte buienradar
// area-chart geïntegreerd binnen het half-ellips interieur.
export function renderSunArc(liveweer, rainEntries = [], now = new Date()) {
  const { rise, set, t, isDay } = sunProgress(liveweer?.sup, liveweer?.sunder, now);

  const showRain = hasRainForecast(rainEntries);
  const w = 260;
  const baselineY = 100; // waar rise/set lijn ligt
  const riseSetLabelY = baselineY + 12;
  const h = riseSetLabelY + 6; // 118, iets hoger dan de volledig platte versie

  const cx = w / 2;
  const cy = baselineY;
  const rx = 108; // horizontaal ongewijzigd
  const ry = 75;  // iets hoger dan afgeplatte 60, nog steeds lager dan cirkel 108

  const start = { x: cx - rx, y: cy };
  const end = { x: cx + rx, y: cy };
  const arcPath = `M ${start.x} ${start.y} A ${rx} ${ry} 0 0 1 ${end.x} ${end.y}`;

  // Zonpositie op halve ellips via parametrische formule.
  // t=0 → linkerpunt (sunrise), t=1 → rechterpunt (sunset), t=0.5 → top.
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

  // Zonkracht (gr in W/m²) en UV-index, afgeleid uit gr (UVI ≈ gr/100).
  const grNum = Number(liveweer?.gr);
  const hasGr = Number.isFinite(grNum) && grNum > 0;
  const grText = hasGr ? `${Math.round(grNum)} W/m²` : '';
  const uv = hasGr ? uvFromGr(grNum) : null;
  const uvText = uv != null ? `UV ${uv}` : '';

  // Labels schuiven mee met de zon en staan recht boven het icoon
  // (buitenkant van de ellips). Kleiner font zodat het netjes past.
  const labelX = pos.x;
  const grLabelY = pos.y - 22;
  const uvLabelY = pos.y - 14;

  const grLabelSvg = hasGr
    ? `
      <text x="${labelX.toFixed(1)}" y="${grLabelY.toFixed(1)}" fill="#ffb454"
            font-size="6" font-family="sans-serif" font-weight="500"
            text-anchor="middle">${esc(grText)}</text>
      <text x="${labelX.toFixed(1)}" y="${uvLabelY.toFixed(1)}" fill="#ffb454"
            font-size="6" font-family="sans-serif" font-weight="400"
            opacity="0.85" text-anchor="middle">${esc(uvText)}</text>`
    : '';

  // Zon- of maanicoon — clickable (data-action) voor zonnekracht-grafiek.
  // Onzichtbare hit-circle maakt de tap-target ook op touch voldoende groot.
  const sunBody = isDay
    ? `<circle r="11" fill="${sunColor}" opacity="0.22"/>
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
       </g>`
    : `<path d="M -4 -7 A 7 7 0 1 0 -4 7 A 5 5 0 0 1 -4 -7 Z" fill="${sunColor}"/>`;

  const sunIcon = `
    <g transform="translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})"
       data-action="show-sun-chart" style="cursor: pointer;">
      <circle r="18" fill="transparent"/>
      ${sunBody}
    </g>`;

  // Ruimere regengrafiek binnen de half-ellips. rect(55,45,150,50) —
  // de bovenhoeken rake(n) bijna de arc-rand (ellips cx=130, cy=100,
  // rx=108, ry=75); de onderkant stopt ruim boven de baseline (y=95).
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
      <path d="${arcPath}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-dasharray="2 4"/>
      ${progressPath ? `<path d="${progressPath}" fill="none" stroke="url(#arcGrad)" stroke-width="3" stroke-linecap="round"/>` : ''}
      ${rainFragment}
      <line x1="${(start.x - 4).toFixed(1)}" y1="${cy}" x2="${(end.x + 4).toFixed(1)}" y2="${cy}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
      ${sunIcon}
      ${grLabelSvg}
      <text x="${(start.x + 2).toFixed(1)}" y="${riseSetLabelY}" fill="#8a93a6" font-size="10" text-anchor="start" font-family="sans-serif">↑ ${riseLabel}</text>
      <text x="${(end.x - 2).toFixed(1)}" y="${riseSetLabelY}" fill="#8a93a6" font-size="10" text-anchor="end" font-family="sans-serif">${setLabel} ↓</text>
    </svg>
  </div>`;
}
