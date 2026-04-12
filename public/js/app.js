import { el, setHTML, esc } from './util/dom.js';
import { formatClock, formatRelative, parseWeerliveHour, pad2 } from './util/format.js';
import { startPolling, getHistory } from './api.js';
import { renderToday } from './views/today.js';
import { renderForecast } from './views/forecast.js';
import { renderHistory } from './views/history.js';
import { renderLineChart } from './components/lineChart.js';
import { sunProgress } from './util/sun.js';
import { applySkyColors, weatherParticleClass } from './util/atmosphere.js';
import { computePressureTrend } from './components/pressureTrend.js';

const POLL_MS = 10 * 60 * 1000; // 10 minuten
const CLOCK_MS = 1000;
const ATMOSPHERE_MS = 60 * 1000; // elke minuut luchtkleuren updaten

let currentView = 'today';
let latestData = null;
let latestHourlyHistory = null;

// View volgorde voor richtingsbewuste transities
const VIEW_ORDER = ['history', 'today', 'forecast'];

// Weerdeeltjes klassen
const WEATHER_CLASSES = ['weather-rain', 'weather-snow', 'weather-night', 'weather-mist', 'weather-thunder'];

function showView(name) {
  const oldIndex = VIEW_ORDER.indexOf(currentView);
  const newIndex = VIEW_ORDER.indexOf(name);
  const direction = newIndex > oldIndex ? 'right' : newIndex < oldIndex ? 'left' : '';

  currentView = name;
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((v) => {
    const isTarget = v.id === `view-${name}`;
    v.classList.remove('active', 'slide-in-left', 'slide-in-right');
    if (isTarget) {
      v.classList.add('active');
      if (direction === 'left') v.classList.add('slide-in-left');
      else if (direction === 'right') v.classList.add('slide-in-right');
    }
  });

  // Weeralarm-knop alleen op Vandaag-view zichtbaar.
  const warnBtn = el('warning-btn');
  if (warnBtn) warnBtn.hidden = name !== 'today';

  updateTabIndicator();
  renderCurrentView();
}

async function renderCurrentView() {
  if (currentView === 'today') {
    // Haal druktrend op
    let pressureTrendText = '';
    if (latestData?.liveweer) {
      try {
        if (!latestHourlyHistory) {
          const res = await getHistory('hourly');
          if (res && Array.isArray(res.entries)) latestHourlyHistory = res.entries;
        }
        const trend = computePressureTrend(latestData.liveweer.luchtd, latestHourlyHistory || []);
        pressureTrendText = `${trend.arrow} ${trend.label}`;
      } catch (e) {
        // negeer — trend is optioneel
      }
    }
    setHTML('view-today', renderToday(latestData, { pressureTrendText }));
  } else if (currentView === 'forecast') {
    setHTML('view-forecast', renderForecast(latestData));
  } else if (currentView === 'history') {
    setHTML('view-history', '<div class="state-msg">Laden…</div>');
    const html = await renderHistory();
    setHTML('view-history', html);
  }
}

// Tab-indicator: schuivende balk onder actieve tab
function updateTabIndicator() {
  const tabs = document.querySelector('.tabs');
  const activeTab = document.querySelector('.tab.active');
  if (!tabs || !activeTab) return;

  const tabsRect = tabs.getBoundingClientRect();
  const btnRect = activeTab.getBoundingClientRect();
  const left = btnRect.left - tabsRect.left;
  const width = btnRect.width;

  tabs.style.setProperty('--tab-left', `${left}px`);
  tabs.style.setProperty('--tab-width', `${width}px`);
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

  btn.classList.toggle('has-alarm', hasAlarm);
  btn.setAttribute(
    'aria-label',
    hasAlarm ? 'Weerwaarschuwing actief' : 'Geen weerwaarschuwing'
  );

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

// Update dynamische luchtkleuren op basis van zonpositie
function updateAtmosphere() {
  if (!latestData?.liveweer) return;
  const l = latestData.liveweer;
  applySkyColors(l.sup, l.sunder);
}

// Stel weerdeeltjes-klasse in op de dial
function updateWeatherParticles() {
  const dial = el('dial');
  if (!dial || !latestData?.liveweer) return;

  const l = latestData.liveweer;
  const { isDay } = sunProgress(l.sup, l.sunder);
  const cls = weatherParticleClass(l.image, isDay);

  // Verwijder alle weer-klassen, voeg juiste toe
  WEATHER_CLASSES.forEach((c) => dial.classList.remove(c));
  if (cls) dial.classList.add(cls);
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

  // Touch swipe ondersteuning
  bindSwipe();
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

// Touch swipe voor view-wisseling
function bindSwipe() {
  const stage = document.querySelector('.stage');
  if (!stage) return;

  let startX = 0;
  let startY = 0;

  stage.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Alleen horizontale swipes (groter dan 50px, meer horizontaal dan verticaal)
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      const idx = VIEW_ORDER.indexOf(currentView);
      if (diffX < 0 && idx < VIEW_ORDER.length - 1) {
        showView(VIEW_ORDER[idx + 1]);
      } else if (diffX > 0 && idx > 0) {
        showView(VIEW_ORDER[idx - 1]);
      }
    }
  }, { passive: true });
}

// Helper: test of een Date op dezelfde lokale kalenderdag valt als een ref.
function isSameLocalDay(d, ref) {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

// Bouwt een 24-punts temperatuurverloop voor de hele kalenderdag (00..23u)
function buildFullDayTempPoints(data, historyEntries) {
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
      const v = Number(e.temp);
      if (Number.isFinite(v)) byHour[h] = v;
    }
  }

  const currentTemp = Number(data?.liveweer?.temp);
  if (Number.isFinite(currentTemp)) {
    byHour[currentHour] = currentTemp;
  }

  const hours = Array.isArray(data?.uurverwachting) ? data.uurverwachting : [];
  for (const u of hours) {
    const d = parseWeerliveHour(u.uur);
    if (!d) continue;
    if (!isSameLocalDay(d, now)) continue;
    const h = d.getHours();
    if (h <= currentHour) continue;
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

  const grValues = grPoints.map((p) => p.value).filter((v) => v != null);
  const peakGr = grValues.length > 0 ? Math.round(Math.max(...grValues)) : null;

  const sparseGr = grPoints.map((p, i) => ({
    label: i % 3 === 0 ? p.label : '',
    value: p.value,
  }));

  const grChart = renderLineChart(sparseGr, {
    width: 480,
    height: 200,
    padX: 34,
    padY: 28,
    stroke: '#ffb454',
    fill: 'rgba(255,180,84,0.22)',
    unit: '',
    showLabels: true,
  });

  const summary =
    peakGr != null
      ? `<div class="sun-chart-summary">Piek vandaag: <strong>${esc(
          String(peakGr)
        )}&nbsp;W/m²</strong></div>`
      : '';

  body.innerHTML = `
    ${summary}
    <div class="sun-chart-sub">
      <span class="sub-label">Zonnekracht (W/m²)</span>
      ${grChart}
    </div>`;
}

function showError(message) {
  if (latestData) return;
  setHTML(
    'view-today',
    `<div class="state-msg error">Geen verbinding.<br>${esc(message)}</div>`
  );
}

async function onWeatherUpdate(data) {
  latestData = data;
  updateMeta(data);
  updateAlertBanner(data);
  updateAtmosphere();
  updateWeatherParticles();
  renderCurrentView();

  // Haal hourly history op (voor druktrend e.d.)
  try {
    const res = await getHistory('hourly');
    if (res && Array.isArray(res.entries)) {
      latestHourlyHistory = res.entries;
    }
  } catch (e) {
    // negeer
  }
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

  // Initiële tab indicator positie
  requestAnimationFrame(updateTabIndicator);

  // Atmosfeer elke minuut updaten
  setInterval(updateAtmosphere, ATMOSPHERE_MS);

  // refresh meta elke 30s zodat "X min geleden" blijft lopen
  setInterval(() => updateMeta(latestData), 30_000);

  startPolling({
    intervalMs: POLL_MS,
    onUpdate: onWeatherUpdate,
    onError: onWeatherError,
  });
}

main();
