// Daglengte-balk component. Toont totale daglengte, verschil met gisteren,
// en een visuele balk (vulling = daglengte / 24u).

import { esc } from '../util/dom.js';

/**
 * Bereken daglengte in minuten uit sunrise/sunset "HH:MM" strings.
 */
function dayLengthMinutes(supStr, sunderStr) {
  if (!supStr || !sunderStr) return null;
  const [rh, rm] = supStr.split(':').map(Number);
  const [sh, sm] = sunderStr.split(':').map(Number);
  if ([rh, rm, sh, sm].some((v) => !Number.isFinite(v))) return null;
  return (sh * 60 + sm) - (rh * 60 + rm);
}

/**
 * Formatteer minuten als "Xu Ym".
 */
function formatMinutesToHM(mins) {
  if (mins == null || !Number.isFinite(mins)) return '—';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}u ${m}m`;
}

/**
 * Schat de daglengte van gisteren op basis van de breedtegraad.
 * Simpele benadering: daglengte verandert ~1-3 minuten per dag rond de equinoxen,
 * minder rond de solstices. We gebruiken een vaste schatting van ±2 minuten
 * als we geen echte gisteren-data hebben.
 *
 * @param {number} todayMinutes - Daglengte vandaag in minuten
 * @param {Date}   now          - Huidige datum
 * @returns {number} Geschatte daglengte gisteren in minuten
 */
function estimateYesterdayLength(todayMinutes, now = new Date()) {
  // Op basis van dag-van-het-jaar: rond equinoxen (~dag 80 en 265) is de
  // verandering maximaal (~3 min/dag), rond solstices (~dag 172 en 355) minimaal (~0.5 min/dag)
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  // Sinusvormige benadering van de dagelijkse verandering
  const changeRate = 2.5 * Math.abs(Math.cos((dayOfYear / 365.25) * 2 * Math.PI));
  // In het voorjaar worden de dagen langer, in het najaar korter (N-halfrond)
  const isGettingLonger = dayOfYear > 355 || dayOfYear < 172;
  const delta = isGettingLonger ? changeRate : -changeRate;
  return todayMinutes - delta; // gisteren was korter/langer
}

/**
 * Render de daglengte-balk als HTML.
 * @param {string} supStr    - Zonsopkomst "HH:MM"
 * @param {string} sunderStr - Zonsondergang "HH:MM"
 * @returns {string} HTML string
 */
export function renderDayLength(supStr, sunderStr) {
  const mins = dayLengthMinutes(supStr, sunderStr);
  if (mins == null || mins <= 0) return '';

  const pct = Math.min(100, (mins / (24 * 60)) * 100);
  const formatted = formatMinutesToHM(mins);

  // Verschil met gisteren (geschat)
  const yesterday = estimateYesterdayLength(mins);
  const diff = Math.round(mins - yesterday);
  const diffText = diff > 0 ? `+${diff} min` : diff < 0 ? `${diff} min` : '±0 min';
  const diffColor = diff > 0 ? '#6fd598' : diff < 0 ? '#ff8c42' : '#8a93a6';

  return `
  <div class="day-length">
    <div class="day-length-bar">
      <div class="day-length-fill" style="width: ${pct.toFixed(1)}%"></div>
    </div>
    <div class="day-length-info">
      <span class="day-length-text">${esc(formatted)} licht</span>
      <span class="day-length-diff" style="color: ${diffColor}">${esc(diffText)}</span>
    </div>
  </div>`;
}
