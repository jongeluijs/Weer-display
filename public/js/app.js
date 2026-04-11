import { el, setHTML, esc } from './util/dom.js';
import { formatClock, formatRelative, parseWeerliveHour, pad2 } from './util/format.js';
import { startPolling, getHistory } from './api.js';
import { renderToday } from './views/today.js';
import { renderForecast } from './views/forecast.js';
import { renderHistory } from './views/history.js';
import { renderLineChart } from './components/lineChart.js';
import { uvFromGr } from './util/sun.js';

const POLL_MS = 10 * 60 * 1000; // 10 minuten
const CLOCK_MS = 1000;

let currentView = 'today';
let latestData = null;

function showView(name) {
  currentView = name;
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === `view-${name}`);
  });
  // Weeralarm-knop alleen op Vandaag-view zichtbaar.
  const warnBtn = el('warning-btn');
  if (warnBtn) warnBtn.hidden = name !== 'today';
  renderCurrentView();
}

async function renderCurrentView() {
  if (currentView === 'today') {
    setHTML('view-today', renderToday(latestData));
  } else if (currentView === 'forecast') {
    setHTML('view-forecast', renderForecast(latestData));
  } else if (currentView === 'history') {
    setHTML('view-history', '<div class="state-msg">Laden…</div>');
    const html = await renderHistory();
    setHTML('view-history', html);
  }
}

function updateAlertBanner(data) {
  const btn = el('warning-btn');
  const banner = el('alert-banner');
  const title = el('alert-title');
  const text = el('alert-text');
  if (!btn || !banner || !title || !text) return;

  const l = data?.liveweer || {};
  const level = Number(l.alarm);
  const hasAlarm = Number.isFinite(level) && level > 0;

  // Knop is altijd zichtbaar; klasse bepaalt de visuele state (gedempt vs. rood).
  btn.classList.toggle('has-alarm', hasAlarm);
  btn.setAttribute(
    'aria-label',
    hasAlarm ? 'Weerwaarschuwing actief' : 'Geen weerwaarschuwing'
  );

  // Veilig: textContent voorkomt XSS via lkop/ltekst
  if (hasAlarm) {
    title.textContent = l.lkop || 'Waarschuwing';
    text.textContent = l.ltekst || '';
  } else {
    title.textContent = 'Geen waarschuwingen';
    text.textContent = 'Er is op dit moment geen weeralarm actief voor deze locatie.';
    banner.hidden = true;
  }
}

function updateMeta(data) {
  const location = data?.location;
  if (location) {
    const locEl = el('location');
    if (locEl) locEl.textContent = location;
  }

  const lastEl = el('last-update');
  const dial = el('dial');
  const meta = document.querySelector('.meta');
  if (!lastEl) return;

  if (data?.fetchedAt) {
    lastEl.textContent = formatRelative(data.fetchedAt);
    if (meta) meta.classList.toggle('stale', !!data.stale);
  } else {
    lastEl.textContent = 'geen data';
    if (meta) meta.classList.add('stale');
  }
}

function tickClock() {
  const clockEl = el('clock');
  if (clockEl) clockEl.textContent = formatClock(new Date());
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  const warnBtn = el('warning-btn');
  const banner = el('alert-banner');
  if (warnBtn && banner) {
    warnBtn.addEventListener('click', () => {
      banner.hidden = !banner.hidden;
    });
    const closeBtn = banner.querySelector('.alert-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        banner.hidden = true;
      });
    }
  }

  // Klik-delegatie binnen de Vandaag-view voor alle modal-triggers.
  const todayView = el('view-today');
  if (todayView) {
    todayView.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="show-temp-chart"]')) {
        openTempChart();
      } else if (e.target.closest('[data-action="show-sun-chart"]')) {
        openSunChart();
      }
    });
  }

  bindModal('temp-chart-modal');
  bindModal('sun-chart-modal');
}

// Standaard modal-gedrag: close-knop + klik-buiten-kaart sluit.
function bindModal(id) {
  const modal = el(id);
  if (!modal) return;
  const card = modal.querySelector('.modal-card');
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.hidden = true;
    });
  }
  modal.addEventListener('click', (e) => {
    if (!card || !card.contains(e.target)) modal.hidden = true;
  });
}

// Helper: test of een Date op dezelfde lokale kalenderdag valt als een ref.
function isSameLocalDay(d, ref) {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

// Bouwt een 24-punts temperatuurverloop voor de hele kalenderdag (00..23u):
// - Voorbije uren: gemeten temperatuur uit de history snapshots
// - Huidige uur:   actuele liveweer.temp
// - Toekomstige uren: voorspelling uit uurverwachting
// Ontbrekende uren blijven `null` zodat de lineChart die overslaat.
function buildFullDayTempPoints(data, historyEntries) {
  const now = new Date();
  const currentHour = now.getHours();

  const byHour = new Array(24).fill(null);

  // 1) Voorbije uren uit history (filter op vandaag, lokale klok-uur)
  if (Array.isArray(historyEntries)) {
    for (const e of historyEntries) {
      const d = new Date(e.ts);
      if (Number.isNaN(d.getTime())) continue;
      if (!isSameLocalDay(d, now)) continue;
      const h = d.getHours();
      if (h >= currentHour) continue; // laat huidige/toekomstige met rust
      const v = Number(e.temp);
      if (Number.isFinite(v)) byHour[h] = v;
    }
  }

  // 2) Huidige uur uit liveweer
  const currentTemp = Number(data?.liveweer?.temp);
  if (Number.isFinite(currentTemp)) {
    byHour[currentHour] = currentTemp;
  }

  // 3) Toekomstige uren uit uurverwachting (filter op vandaag)
  const hours = Array.isArray(data?.uurverwachting) ? data.uurverwachting : [];
  for (const u of hours) {
    const d = parseWeerliveHour(u.uur);
    if (!d) continue;
    if (!isSameLocalDay(d, now)) continue;
    const h = d.getHours();
    if (h <= currentHour) continue; // overschrijf niet wat al is gezet
    const v = Number(u.temp);
    if (Number.isFinite(v)) byHour[h] = v;
  }

  return byHour.map((value, h) => ({
    label: `${pad2(h)}u`,
    value,
  }));
}

async function openTempChart() {
  const modal = el('temp-chart-modal');
  const body = el('temp-chart-body');
  if (!modal || !body) return;

  modal.hidden = false;
  body.innerHTML = '<div class="state-msg">Laden…</div>';

  let historyEntries = [];
  try {
    const res = await getHistory('hourly');
    if (res && Array.isArray(res.entries)) historyEntries = res.entries;
  } catch (err) {
    console.warn('[app] history fetch voor temp-chart faalde:', err);
  }

  const points = buildFullDayTempPoints(latestData, historyEntries);
  const anyValid = points.some((p) => p.value != null);
  if (!anyValid) {
    body.innerHTML = '<div class="state-msg">Geen temperatuurdata beschikbaar</div>';
    return;
  }

  // Toon elk 3e label op de x-as om clutter te vermijden
  const sparsePoints = points.map((p, i) => ({
    label: i % 3 === 0 ? p.label : '',
    value: p.value,
  }));
  const chart = renderLineChart(sparsePoints, {
    width: 480,
    height: 200,
    padX: 30,
    padY: 28,
    stroke: '#ffb454',
    fill: 'rgba(255,180,84,0.22)',
    unit: '°',
    showLabels: true,
  });
  body.innerHTML = chart;
}

// Bouwt een 24-punts zonnekracht-verloop (gr in W/m²) voor de hele
// kalenderdag. Zelfde strategie als buildFullDayTempPoints: voorbije
// uren uit history, huidige uur uit liveweer, toekomstige uit uurverwachting.
function buildFullDayGrPoints(data, historyEntries) {
  const now = new Date();
  const currentHour = now.getHours();

  const byHour = new Array(24).fill(null);

  if (Array.isArray(historyEntries)) {
    for (const e of historyEntries) {
      const d = new Date(e.ts);
      if (Number.isNaN(d.getTime())) continue;
      if (!isSameLocalDay(d, now)) continue;
      const h = d.getHours();
      if (h >= currentHour) continue;
      const v = Number(e.gr);
      if (Number.isFinite(v)) byHour[h] = v;
    }
  }

  const currentGr = Number(data?.liveweer?.gr);
  if (Number.isFinite(currentGr)) {
    byHour[currentHour] = currentGr;
  }

  const hours = Array.isArray(data?.uurverwachting) ? data.uurverwachting : [];
  for (const u of hours) {
    const d = parseWeerliveHour(u.uur);
    if (!d) continue;
    if (!isSameLocalDay(d, now)) continue;
    const h = d.getHours();
    if (h <= currentHour) continue;
    const v = Number(u.gr);
    if (Number.isFinite(v)) byHour[h] = v;
  }

  return byHour.map((value, h) => ({
    label: `${pad2(h)}u`,
    value,
  }));
}

async function openSunChart() {
  const modal = el('sun-chart-modal');
  const body = el('sun-chart-body');
  if (!modal || !body) return;

  modal.hidden = false;
  body.innerHTML = '<div class="state-msg">Laden…</div>';

  let historyEntries = [];
  try {
    const res = await getHistory('hourly');
    if (res && Array.isArray(res.entries)) historyEntries = res.entries;
  } catch (err) {
    console.warn('[app] history fetch voor sun-chart faalde:', err);
  }

  const grPoints = buildFullDayGrPoints(latestData, historyEntries);
  const anyValid = grPoints.some((p) => p.value != null);
  if (!anyValid) {
    body.innerHTML = '<div class="state-msg">Geen zonnekracht-data beschikbaar</div>';
    return;
  }

  // UV-punten worden afgeleid uit gr met dezelfde benadering als in de
  // sun-arc (UVI ≈ gr/100). Zo staat het direct naast de meetwaarde.
  const uvPoints = grPoints.map((p) => ({
    label: p.label,
    value: p.value != null ? uvFromGr(p.value) : null,
  }));

  // Piek-waarden voor de samenvatting
  const grValues = grPoints.map((p) => p.value).filter((v) => v != null);
  const peakGr = grValues.length > 0 ? Math.round(Math.max(...grValues)) : null;
  const peakUv = peakGr != null ? uvFromGr(peakGr) : null;

  const sparseGr = grPoints.map((p, i) => ({
    label: i % 3 === 0 ? p.label : '',
    value: p.value,
  }));
  const sparseUv = uvPoints.map((p, i) => ({
    label: i % 3 === 0 ? p.label : '',
    value: p.value,
  }));

  const grChart = renderLineChart(sparseGr, {
    width: 480,
    height: 150,
    padX: 34,
    padY: 24,
    stroke: '#ffb454',
    fill: 'rgba(255,180,84,0.22)',
    unit: '',
    showLabels: true,
  });
  const uvChart = renderLineChart(sparseUv, {
    width: 480,
    height: 130,
    padX: 34,
    padY: 22,
    stroke: '#c3a1ff',
    fill: 'rgba(195,161,255,0.22)',
    unit: '',
    showLabels: true,
  });

  const summary =
    peakGr != null && peakUv != null
      ? `<div class="sun-chart-summary">Piek vandaag: <strong>${esc(
          String(peakGr)
        )}&nbsp;W/m²</strong> · UV <strong>${esc(String(peakUv))}</strong></div>`
      : '';

  body.innerHTML = `
    ${summary}
    <div class="sun-chart-sub">
      <span class="sub-label">Zonnekracht (W/m²)</span>
      ${grChart}
    </div>
    <div class="sun-chart-sub">
      <span class="sub-label">UV-index (schatting)</span>
      ${uvChart}
    </div>`;
}

function showError(message) {
  if (latestData) return; // houd oude data tonen
  setHTML(
    'view-today',
    `<div class="state-msg error">Geen verbinding.<br>${esc(message)}</div>`
  );
}

function onWeatherUpdate(data) {
  latestData = data;
  updateMeta(data);
  updateAlertBanner(data);
  renderCurrentView();
}

function onWeatherError(err) {
  console.warn('[app] weer fout:', err);
  showError(err.message || 'Onbekende fout');
  const lastEl = el('last-update');
  if (lastEl && !latestData) lastEl.textContent = 'geen data';
}

function main() {
  bindTabs();
  tickClock();
  setInterval(tickClock, CLOCK_MS);

  // refresh meta elke 30s zodat "X min geleden" blijft lopen
  setInterval(() => updateMeta(latestData), 30_000);

  startPolling({
    intervalMs: POLL_MS,
    onUpdate: onWeatherUpdate,
    onError: onWeatherError,
  });
}

main();
