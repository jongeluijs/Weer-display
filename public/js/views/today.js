import { esc } from '../util/dom.js';
import { getIcon } from '../components/icons.js';
import { renderSunArc } from '../components/sunArc.js';
import { renderWindArrow } from '../components/windArrow.js';
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

function windStat(l) {
  const arrow = renderWindArrow(l.windrgr, { size: 52, bft: l.windbft });
  const bft = Number.isFinite(Number(l.windbft)) ? `${l.windbft} Bft` : '—';
  // Windroos wordt absoluut gepositioneerd bóven de stat-cell, zodat
  // "Wind" label + Bft-waarde op dezelfde rij uitlijnen als de andere stats.
  return `
  <div class="stat wind-stat">
    <div class="wind-arrow-wrap">${arrow}</div>
    <span class="label">Wind</span>
    <span class="value">${esc(bft)}</span>
    <span class="sublabel"></span>
  </div>`;
}

function vochtStat(l) {
  return `
  <div class="stat">
    <span class="label">Vocht</span>
    <span class="value">${esc(formatNumber(l.lv, 0, '%'))}</span>
    <span class="sublabel">dauw ${esc(formatNumber(l.dauwp, 0, '°'))}</span>
  </div>`;
}

function drukStat(l) {
  return `
  <div class="stat">
    <span class="label">Druk</span>
    <span class="value">${esc(formatNumber(l.luchtd, 0, ' hPa'))}</span>
    <span class="sublabel">${esc(formatNumber(l.ldmmhg, 0, ' mmHg'))}</span>
  </div>`;
}

function zichtStat(l) {
  return `
  <div class="stat">
    <span class="label">Zicht</span>
    <span class="value">${esc(formatZicht(l.zicht))}</span>
    <span class="sublabel">${esc(l.plaats || '')}</span>
  </div>`;
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

export function renderToday(data) {
  if (!data || !data.liveweer) {
    return `<div class="state-msg">Geen data beschikbaar</div>`;
  }
  const l = data.liveweer;
  const icon = getIcon(l.image);
  const tempRounded = Number.isFinite(Number(l.temp)) ? Math.round(Number(l.temp)) : null;
  const tempDisplay = tempRounded != null ? `${tempRounded}` : '—';
  const feels = Number.isFinite(Number(l.gtemp)) ? `voelt als ${Math.round(Number(l.gtemp))}°` : '';

  const hero = `
    <div class="hero">
      <div class="icon-big">${icon}</div>
      <div class="temp-block">
        <button type="button" class="temp-big" data-action="show-temp-chart" aria-label="Toon temperatuurverloop">${esc(tempDisplay)}<sup>°C</sup></button>
        ${feels ? `<div class="feels-like">${esc(feels)}</div>` : ''}
      </div>
    </div>`;

  const statsGrid = `
    <div class="stats-grid">
      ${windStat(l)}
      ${vochtStat(l)}
      ${drukStat(l)}
      ${zichtStat(l)}
    </div>`;

  const verwText = l.verw ? `<div class="verw-text">${esc(l.verw)}</div>` : '';

  const hourStrip = hourCells(data.uurverwachting);

  const rainEntries = Array.isArray(data?.rain?.entries) ? data.rain.entries : [];
  const sunArc = renderSunArc(l, rainEntries);

  return `
  <div class="today-main">
    ${hero}
    ${statsGrid}
    ${hourStrip}
    ${verwText}
    <div class="sun-wrap">${sunArc}</div>
  </div>`;
}
