import { el, setHTML, esc } from './util/dom.js';
import { formatClock, formatRelative, parseWeerliveHour, pad2 } from './util/format.js';
import { startPolling, getHistory } from './api.js';
import { renderToday } from './views/today.js';
import { renderForecast } from './views/forecast.js';
import { renderHistory } from './views/history.js';
import {
  renderEnergyShell,
  updateEnergyHero,
  updateEnergyGas,
  updateEnergyToday,
  updateEnergyDaily,
  updateEnergyHourly,
  updateEnergyDayHourly,
  setEnergyDayHourlyLoading,
  updateEnergyDiagnostics,
} from './views/energy.js';
import {
  renderFloorplanShell,
  bindFloorplanInteractions,
  bindFloorplanListeners,
  setFloorplanDevices,
  setDiscoveredDevices,
} from './views/floorplan.js';
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
  const now = new Date();
  const text = formatClock(now);
  const clockEl = el('clock');
  if (clockEl) clockEl.textContent = text;
  const energyClockEl = el('energy-clock');
  if (energyClockEl) energyClockEl.textContent = text;
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

// Pointer-swipe wisselt tussen drie hoofdpagina's: weer → energie → floor.
// - Swipe links: voorwaarts in de cycle (weer → energie → floor).
// - Swipe rechts: achterwaarts (floor → energie → weer).
// Tabs binnen weer/energie wissel je via de tab-knoppen, niet via swipe.
const PAGE_ORDER = ['weer', 'energie', 'floor'];

function bindSwipe() {
  const root = el('dial');
  if (!root) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.tabs, .modal-overlay, .energy-tabs, .floor-edit-panel, .floor-modal-overlay, .floor-icon, .floor-settings-form')) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  root.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;

    const diffX = e.clientX - startX;
    const diffY = e.clientY - startY;

    if (Math.abs(diffX) <= 50 || Math.abs(diffX) <= Math.abs(diffY) * 1.5) return;

    const idx = PAGE_ORDER.indexOf(activePage);
    if (diffX < 0 && idx < PAGE_ORDER.length - 1) {
      setActivePage(PAGE_ORDER[idx + 1]);
    } else if (diffX > 0 && idx > 0) {
      setActivePage(PAGE_ORDER[idx - 1]);
    }
  });

  root.addEventListener('pointercancel', () => {
    tracking = false;
  });
}

let activePage = 'weer';

function setActivePage(name) {
  if (!PAGE_ORDER.includes(name) || activePage === name) return;
  const previous = activePage;
  activePage = name;

  if (previous === 'energie' && name !== 'energie') closeEnergyView();
  if (previous === 'floor' && name !== 'floor') closeFloorView();

  if (name === 'energie') openEnergyView();
  else if (name === 'floor') openFloorView();
  // weer: niets openen — energy/floor zijn al gesloten
}

// ---------------------------------------------------------------------------
// Energie-overlay
// ---------------------------------------------------------------------------

let energyOpen = false;
let energyShellRendered = false;
let energyStream = null;
let energyDailyEntries = [];
let energyPrices = null; // /api/energy/prices payload
let energyTodayCache = null; // laatste { kwh, m3 } uit /api/energy/now zodat de live SSE-snapshot ook het dagtotaal in de gauge kan tonen
let energySelectedDay = null; // YYYY-MM-DD van de aangetikte dag in de 14-dagen view
let energyRefreshTimer = null;
const ENERGY_REFRESH_MS = 30_000; // dag-totalen elke 30s verversen

function ensureEnergyShell() {
  if (energyShellRendered) return;
  setHTML('view-energy', renderEnergyShell());
  energyShellRendered = true;

  // Klik-handler voor tabs én day-bars
  const view = el('view-energy');
  if (view) {
    view.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-energy-view]');
      if (tabBtn) {
        showEnergyPane(tabBtn.dataset.energyView);
        return;
      }
      const hit = e.target.closest('[data-energy-day]');
      if (hit) {
        const date = hit.getAttribute('data-energy-day');
        if (date) selectEnergyDay(date);
      }
    });
  }
}

function showEnergyPane(name) {
  const view = el('view-energy');
  if (!view) return;
  view.querySelectorAll('.energy-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.energyView === name);
  });
  view.querySelectorAll('.energy-pane').forEach((p) => {
    p.classList.toggle('active', p.dataset.pane === name);
  });
}

function openEnergyView() {
  ensureEnergyShell();
  const view = el('view-energy');
  if (!view) return;
  view.classList.add('open');
  view.setAttribute('aria-hidden', 'false');
  const dial = el('dial');
  if (dial) dial.classList.add('energy-mode');
  energyOpen = true;
  startEnergyStream();
  refreshEnergyData();
  if (!energyRefreshTimer) {
    energyRefreshTimer = setInterval(refreshEnergyData, ENERGY_REFRESH_MS);
  }
}

function closeEnergyView() {
  const view = el('view-energy');
  if (!view) return;
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
  const dial = el('dial');
  if (dial) dial.classList.remove('energy-mode');
  energyOpen = false;
  stopEnergyStream();
  if (energyRefreshTimer) {
    clearInterval(energyRefreshTimer);
    energyRefreshTimer = null;
  }
}

function startEnergyStream() {
  if (energyStream) return;
  try {
    energyStream = new EventSource('/api/energy/stream');
    energyStream.addEventListener('snapshot', (ev) => {
      try {
        const snap = JSON.parse(ev.data);
        updateEnergyHero(snap, energyTodayCache);
        updateEnergyGas(snap, energyTodayCache);
        updateEnergyDiagnostics(snap);
      } catch {}
    });
    energyStream.addEventListener('power', (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        updateEnergyHero({ power_kw: evt.power_w / 1000, connected: true }, energyTodayCache);
      } catch {}
    });
    energyStream.onerror = () => {
      // EventSource doet zelf reconnect; we updaten alleen status
      const txt = document.getElementById('energy-status-text');
      if (txt) txt.textContent = 'verbinden…';
    };
  } catch (err) {
    console.warn('[app] energy stream fout:', err);
  }
}

function stopEnergyStream() {
  if (energyStream) {
    try { energyStream.close(); } catch {}
    energyStream = null;
  }
}

async function refreshEnergyData() {
  try {
    const [nowRes, dailyRes, hourlyRes, pricesRes] = await Promise.all([
      fetch('/api/energy/now', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/energy/daily?days=14', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/energy/today-hourly', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/energy/prices', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);

    energyPrices = pricesRes?.ok ? pricesRes : null;

    if (nowRes?.ok) {
      energyTodayCache = nowRes.today || null;
      updateEnergyHero(nowRes.snapshot, nowRes.today);
      updateEnergyGas(nowRes.snapshot, nowRes.today);
      updateEnergyDiagnostics(nowRes.snapshot);
      updateEnergyToday(nowRes.today, nowRes.yesterday, energyPrices);
    }
    if (dailyRes?.ok) {
      energyDailyEntries = dailyRes.entries || [];
      updateEnergyDaily(energyDailyEntries, energySelectedDay);
    }
    if (hourlyRes?.ok) {
      updateEnergyHourly(hourlyRes.entries || []);
    }
  } catch (err) {
    console.warn('[app] energy data fout:', err);
  }
}

async function selectEnergyDay(date) {
  energySelectedDay = date;
  updateEnergyDaily(energyDailyEntries, energySelectedDay);
  setEnergyDayHourlyLoading(date);

  const block = el('energy-day-hourly-block');
  if (block) {
    requestAnimationFrame(() => {
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  try {
    const res = await fetch(`/api/energy/hourly?date=${encodeURIComponent(date)}`, {
      cache: 'no-store',
    });
    const json = await res.json();
    if (energySelectedDay !== date) return; // selectie inmiddels veranderd
    const entries = Array.isArray(json?.entries) ? json.entries : [];
    updateEnergyDayHourly(entries, date);
  } catch (err) {
    if (energySelectedDay !== date) return;
    updateEnergyDayHourly([], date);
  }
}

// ---------------------------------------------------------------------------
// BeganeGrond-overlay
// ---------------------------------------------------------------------------

let floorOpen = false;
let floorShellRendered = false;

function ensureFloorShell() {
  if (floorShellRendered) return;
  setHTML('view-floor', renderFloorplanShell());
  floorShellRendered = true;

  bindFloorplanListeners({
    onSave: async (device) => {
      const res = await fetch('/api/floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert', device }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) refreshFloorDevices();
    },
    onRemove: async (id) => {
      const res = await fetch('/api/floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) refreshFloorDevices();
    },
    onStatus: async (id) => {
      const res = await fetch(`/api/floorplan/device/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      return json?.status || null;
    },
    onAction: async (id, action) => {
      const res = await fetch(`/api/floorplan/device/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || 'actie mislukt');
      return json.result;
    },
    onRefreshDiscover: refreshFloorDiscovery,
    onOpenSettings: openSettingsModal,
  });

  bindFloorplanInteractions();
  bindSettingsModal();
  bindDiscoveryControls();
}

// ---------------------------------------------------------------------------
// Hue settings modal
// ---------------------------------------------------------------------------

function bindSettingsModal() {
  const modal = el('floor-settings-modal');
  const closeBtn = el('floor-settings-close');
  const form = el('floor-settings-form');
  const testBtn = el('floor-settings-test');
  const pairBtn = el('floor-settings-pair');
  if (!modal || !form) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.hidden = true;
    });
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = el('floor-settings-hue-host')?.value.trim() || '192.168.1.159';
    setSettingsStatus('opslaan…');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hueBridgeHost: host }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'opslaan mislukt');
      setSettingsStatus(`Opgeslagen. Bridge: ${json.hueBridgeHost}`);
      refreshFloorDiscovery();
    } catch (err) {
      setSettingsStatus(`Fout: ${err.message}`, true);
    }
  });

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const host = el('floor-settings-hue-host')?.value.trim() || '192.168.1.159';
      setSettingsStatus('verbinden…');
      try {
        // Probeer direct de bridge config endpoint via een tijdelijke save
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hueBridgeHost: host }),
        });
        const dRes = await fetch('/api/floorplan/discover', { cache: 'no-store' });
        const dJson = await dRes.json();
        const hueDevices = Array.isArray(dJson?.hue) ? dJson.hue : [];
        const bridge = hueDevices.find((d) => d.type === 'hub');
        if (bridge) {
          setSettingsStatus(`Verbonden met ${bridge.label || 'Hue Bridge'} op ${host}`);
        } else {
          setSettingsStatus(`Geen bridge gevonden op ${host}`, true);
        }
      } catch (err) {
        setSettingsStatus(`Fout: ${err.message}`, true);
      }
    });
  }

  if (pairBtn) {
    pairBtn.addEventListener('click', async () => {
      setSettingsStatus('koppelen… druk eerst op de fysieke knop op de bridge');
      try {
        const res = await fetch('/api/settings/hue/pair', { method: 'POST' });
        const json = await res.json();
        if (json?.ok) {
          setSettingsStatus('Gekoppeld! Lampen worden nu opgehaald.');
          refreshFloorDiscovery();
        } else if (json?.code === 'LINK_NOT_PRESSED') {
          setSettingsStatus('Druk eerst op de knop op de Hue Bridge en probeer opnieuw.', true);
        } else {
          setSettingsStatus(`Fout: ${json?.error || 'onbekende fout'}`, true);
        }
      } catch (err) {
        setSettingsStatus(`Fout: ${err.message}`, true);
      }
    });
  }
}

function setSettingsStatus(text, isError = false) {
  const slot = el('floor-settings-status');
  if (!slot) return;
  slot.textContent = text;
  slot.classList.toggle('error', !!isError);
}

async function openSettingsModal() {
  const modal = el('floor-settings-modal');
  if (!modal) return;
  modal.hidden = false;
  setSettingsStatus('');
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const json = await res.json();
    if (json?.ok) {
      const input = el('floor-settings-hue-host');
      if (input) input.value = json.hueBridgeHost || '192.168.1.159';
      if (json.hueBridgePaired) {
        setSettingsStatus(`Gekoppeld met bridge op ${json.hueBridgeHost}`);
      } else {
        setSettingsStatus(`Bridge: ${json.hueBridgeHost} (niet gekoppeld)`);
      }
    }
  } catch (err) {
    setSettingsStatus(`Fout: ${err.message}`, true);
  }
  refreshDiscoveryMeta();
}

// ---------------------------------------------------------------------------
// Diepe netwerkscan
// ---------------------------------------------------------------------------

let discoveryStream = null;

const PHASE_LABELS = {
  idle: 'Klaar',
  sweep: '1/3 — Subnet aftasten',
  port_scan: '2/3 — Poorten scannen',
  identify: '3/3 — Services identificeren',
  complete: 'Voltooid',
  cancelled: 'Gestopt',
  error: 'Fout',
};

function bindDiscoveryControls() {
  const startBtn = el('floor-discovery-start');
  const cancelBtn = el('floor-discovery-cancel');
  if (startBtn) {
    startBtn.addEventListener('click', startDiscovery);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelDiscovery);
  }
}

function formatRelativeAge(isoString) {
  if (!isoString) return null;
  const t = Date.parse(isoString);
  if (!Number.isFinite(t)) return null;
  const ageMs = Date.now() - t;
  const days = Math.floor(ageMs / (24 * 3600 * 1000));
  if (days === 0) {
    const h = Math.floor(ageMs / (3600 * 1000));
    if (h === 0) return 'zojuist';
    return `${h} uur geleden`;
  }
  if (days === 1) return '1 dag geleden';
  return `${days} dagen geleden`;
}

async function refreshDiscoveryMeta() {
  const meta = el('floor-discovery-meta');
  if (!meta) return;
  try {
    const res = await fetch('/api/discovery/result', { cache: 'no-store' });
    const json = await res.json();
    if (!json?.ok || !json.lastRunAt) {
      meta.textContent = 'Nog niet uitgevoerd.';
      return;
    }
    const age = formatRelativeAge(json.lastRunAt);
    const dur = json.durationMs ? `, duurde ${Math.round(json.durationMs / 1000)}s` : '';
    meta.textContent = `Laatste scan: ${age || json.lastRunAt}${dur} — ${
      json.deviceCount ?? json.devices?.length ?? 0
    } apparaten op ${json.subnet || 'onbekend subnet'}.`;
  } catch (err) {
    meta.textContent = `Kon laatste scan niet laden: ${err.message}`;
  }
}

async function startDiscovery() {
  const startBtn = el('floor-discovery-start');
  const cancelBtn = el('floor-discovery-cancel');
  const progress = el('floor-discovery-progress');
  if (startBtn) startBtn.disabled = true;
  try {
    const res = await fetch('/api/discovery/start', { method: 'POST' });
    const json = await res.json();
    if (!json?.ok) {
      setSettingsStatus(`Start mislukt: ${json?.error || 'onbekend'}`, true);
      if (startBtn) startBtn.disabled = false;
      return;
    }
    if (progress) progress.hidden = false;
    if (cancelBtn) cancelBtn.hidden = false;
    if (startBtn) startBtn.hidden = true;
    openDiscoveryStream();
  } catch (err) {
    setSettingsStatus(`Fout: ${err.message}`, true);
    if (startBtn) startBtn.disabled = false;
  }
}

async function cancelDiscovery() {
  try {
    await fetch('/api/discovery/cancel', { method: 'POST' });
  } catch {
    // negeer
  }
}

function openDiscoveryStream() {
  closeDiscoveryStream();
  try {
    discoveryStream = new EventSource('/api/discovery/stream');
    discoveryStream.addEventListener('progress', (ev) => {
      try {
        const snap = JSON.parse(ev.data);
        renderDiscoveryProgress(snap);
        if (!snap.running && snap.phase === 'idle') {
          finishDiscovery();
        }
      } catch {}
    });
    discoveryStream.addEventListener('complete', () => {
      finishDiscovery();
      refreshFloorDiscovery();
    });
    discoveryStream.addEventListener('cancelled', () => {
      finishDiscovery();
    });
    discoveryStream.addEventListener('error', () => {
      // EventSource doet zelf reconnect; bij definitieve sluiting wordt
      // finishDiscovery() vanuit progress=idle aangeroepen.
    });
  } catch (err) {
    setSettingsStatus(`Stream fout: ${err.message}`, true);
  }
}

function closeDiscoveryStream() {
  if (discoveryStream) {
    try { discoveryStream.close(); } catch {}
    discoveryStream = null;
  }
}

function renderDiscoveryProgress(snap) {
  const phaseEl = el('floor-progress-phase');
  const fillEl = el('floor-progress-fill');
  const statsEl = el('floor-progress-stats');
  if (phaseEl) phaseEl.textContent = PHASE_LABELS[snap.phase] || snap.phase;

  let pct = 0;
  let stats = '';
  if (snap.phase === 'sweep' && snap.hostsTotal) {
    pct = (snap.hostsDone / snap.hostsTotal) * 100;
    stats = `${snap.hostsDone}/${snap.hostsTotal} IP's gescand • ${snap.hostsAlive || 0} apparaten gevonden${snap.currentIp ? ` • bezig met ${snap.currentIp}` : ''}`;
  } else if (snap.phase === 'port_scan' && snap.totalDevices) {
    pct = (snap.devicesAnalyzed / snap.totalDevices) * 100;
    stats = `${snap.devicesAnalyzed}/${snap.totalDevices} apparaten geanalyseerd${snap.currentIp ? ` • bezig met ${snap.currentIp}` : ''}`;
  } else if (snap.phase === 'identify' && snap.totalDevices) {
    pct = (snap.devicesAnalyzed / snap.totalDevices) * 100;
    stats = `${snap.devicesAnalyzed}/${snap.totalDevices} apparaten geïdentificeerd${snap.currentIp ? ` • bezig met ${snap.currentIp}` : ''}`;
  } else if (snap.phase === 'complete') {
    pct = 100;
    stats = 'Voltooid';
  } else if (snap.phase === 'cancelled') {
    stats = 'Gestopt door gebruiker';
  } else if (snap.phase === 'error') {
    stats = 'Fout opgetreden';
  }
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, pct)).toFixed(1)}%`;
  if (statsEl) statsEl.textContent = stats;
}

function finishDiscovery() {
  closeDiscoveryStream();
  const startBtn = el('floor-discovery-start');
  const cancelBtn = el('floor-discovery-cancel');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.hidden = false;
  }
  if (cancelBtn) cancelBtn.hidden = true;
  refreshDiscoveryMeta();
}

async function refreshFloorDevices() {
  try {
    const res = await fetch('/api/floorplan', { cache: 'no-store' });
    const json = await res.json();
    if (json?.ok) setFloorplanDevices(json.devices || []);
  } catch (err) {
    console.warn('[app] floorplan ophalen fout:', err);
  }
}

async function refreshFloorDiscovery() {
  try {
    const res = await fetch('/api/floorplan/discover', { cache: 'no-store' });
    const json = await res.json();
    if (json?.ok) setDiscoveredDevices(json);
  } catch (err) {
    console.warn('[app] floorplan discovery fout:', err);
  }
}

function openFloorView() {
  ensureFloorShell();
  const view = el('view-floor');
  if (!view) return;
  view.classList.add('open');
  view.setAttribute('aria-hidden', 'false');
  const dial = el('dial');
  if (dial) dial.classList.add('floor-mode');
  floorOpen = true;
  refreshFloorDevices();
}

function closeFloorView() {
  const view = el('view-floor');
  if (!view) return;
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
  const dial = el('dial');
  if (dial) dial.classList.remove('floor-mode');
  floorOpen = false;
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
