import { esc } from '../util/dom.js';
import { getIcon } from '../components/icons.js';
import { renderSunArc } from '../components/sunArc.js';
import { renderCircularGauge } from '../components/circularGauge.js';
import { renderComfortBadge } from '../components/comfortIndex.js';
import { renderDayLength } from '../components/dayLength.js';
import {
  formatTemp,
  formatNumber,
  parseWeerliveHour,
  pad2,
} from '../util/format.js';

// Zicht in meters → kilometers met passende eenheid
function formatZicht(m) {
  const v = Number(m);
  if (!Number.isFinite(v)) return '—';
  if (v >= 10000) return `${Math.round(v / 1000)} km`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} km`;
  return `${Math.round(v)} m`;
}

// Dynamische temperatuur-glow kleur
function tempGlowColor(temp) {
  const t = Number(temp);
  if (!Number.isFinite(t)) return 'rgba(255, 180, 84, 0.15)';
  if (t <= 0) return 'rgba(100, 160, 255, 0.35)';
  if (t <= 10) return 'rgba(120, 180, 255, 0.25)';
  if (t <= 20) return 'rgba(255, 220, 130, 0.2)';
  if (t <= 28) return 'rgba(255, 180, 84, 0.3)';
  if (t <= 35) return 'rgba(255, 130, 50, 0.35)';
  return 'rgba(255, 80, 50, 0.4)';
}

// Circulaire gauge voor wind
function windGauge(l) {
  const bft = Number(l.windbft);
  const val = Number.isFinite(bft) ? bft : 0;
  const dir = l.windr || '';

  // Wind pijl als centraal SVG element
  const deg = Number(l.windrgr);
  const hasDeg = Number.isFinite(deg);
  const rotation = hasDeg ? deg + 180 : 0;

  const arrowSvg = hasDeg
    ? `<g transform="rotate(${rotation.toFixed(1)} 50 50)">
        <path d="M 50 28 L 55 40 L 52 39 L 52 62 L 48 62 L 48 39 L 45 40 Z"
              fill="#ffb454" opacity="0.85" stroke-linejoin="round"/>
      </g>`
    : '';

  const centerContent = `
    <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
    ${arrowSvg}
    <text x="50" y="72" fill="#8a93a6" font-size="7" text-anchor="middle" font-family="sans-serif">${esc(dir)}</text>`;

  return renderCircularGauge({
    value: val,
    min: 0,
    max: 12,
    label: 'Wind',
    unit: '',
    color: '#ffb454',
    size: 100,
    sublabel: `${val} Bft`,
    centerHTML: centerContent,
  });
}

// Circulaire gauge voor vochtigheid
function humidityGauge(l) {
  const val = Number(l.lv);
  const dauw = Number(l.dauwp);
  const sublabel = Number.isFinite(dauw) ? `dauw ${Math.round(dauw)}°` : '';

  return renderCircularGauge({
    value: Number.isFinite(val) ? val : 0,
    min: 0,
    max: 100,
    label: 'Vocht',
    unit: '%',
    color: '#7aa8ff',
    size: 100,
    sublabel,
  });
}

// Circulaire gauge voor luchtdruk
function pressureGauge(l, trendHtml) {
  const val = Number(l.luchtd);

  return renderCircularGauge({
    value: Number.isFinite(val) ? val : 1013,
    min: 960,
    max: 1060,
    label: 'Druk',
    unit: '',
    color: '#6fd598',
    size: 100,
    sublabel: '',
  });
}

function hourCells(uurverwachting) {
  if (!Array.isArray(uurverwachting) || uurverwachting.length === 0) return '';
  const cells = uurverwachting.slice(0, 12).map((u) => {
    const date = parseWeerliveHour(u.uur);
    const hour = date ? `${pad2(date.getHours())}u` : esc(u.uur || '');
    const icon = getIcon(u.image);
    const temp = formatTemp(u.temp);
    const rainNum = Number(u.neersl);
    const rain = Number.isFinite(rainNum) && rainNum > 0 ? `${rainNum.toFixed(1)}` : '';
    return `
    <div class="hour-cell">
      <span class="hour-time">${esc(hour)}</span>
      <span class="hour-icon">${icon}</span>
      <span class="hour-temp">${esc(temp)}</span>
      <span class="hour-rain">${esc(rain)}</span>
    </div>`;
  });
  return `<div class="hour-strip">${cells.join('')}</div>`;
}

export function renderToday(data, opts = {}) {
  if (!data || !data.liveweer) {
    return `<div class="state-msg">Geen data beschikbaar</div>`;
  }
  const l = data.liveweer;
  const icon = getIcon(l.image);
  const tempRounded = Number.isFinite(Number(l.temp)) ? Math.round(Number(l.temp)) : null;
  const tempDisplay = tempRounded != null ? `${tempRounded}` : '—';
  const feels = Number.isFinite(Number(l.gtemp)) ? `voelt als ${Math.round(Number(l.gtemp))}°` : '';
  const glowColor = tempGlowColor(l.temp);

  // Comfort badge
  const comfortBadge = renderComfortBadge(l);

  const hero = `
    <div class="hero">
      <div class="icon-big">${icon}</div>
      <div class="temp-block">
        <button type="button" class="temp-big" data-action="show-temp-chart"
                aria-label="Toon temperatuurverloop"
                style="--temp-glow: ${glowColor}">${esc(tempDisplay)}<sup>°C</sup></button>
        ${feels ? `<div class="feels-like">${esc(feels)} ${comfortBadge}</div>` : ''}
      </div>
    </div>`;

  // Circulaire gauges
  const pressureTrendHtml = opts.pressureTrendHtml || '';
  const gauges = `
    <div class="gauge-grid">
      <div class="gauge-cell">
        ${windGauge(l)}
      </div>
      <div class="gauge-cell">
        ${humidityGauge(l)}
      </div>
      <div class="gauge-cell">
        ${pressureGauge(l, pressureTrendHtml)}
        ${pressureTrendHtml ? `<div class="gauge-sub">${pressureTrendHtml}</div>` : ''}
      </div>
    </div>`;

  const verwText = l.verw ? `<div class="verw-text">${esc(l.verw)}</div>` : '';

  const hourStrip = hourCells(data.uurverwachting);

  const rainEntries = Array.isArray(data?.rain?.entries) ? data.rain.entries : [];
  const sunArc = renderSunArc(l, rainEntries);

  // Daglengte-balk
  const dayLength = renderDayLength(l.sup, l.sunder);

  return `
  <div class="today-main">
    ${hero}
    ${gauges}
    ${hourStrip}
    ${verwText}
    <div class="sun-wrap">
      ${sunArc}
      ${dayLength}
    </div>
  </div>`;
}
