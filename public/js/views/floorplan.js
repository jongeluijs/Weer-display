// BeganeGrond view: plattegrond met apparaat-iconen.
// - Normale mode: tikken op icoon → modal met device-status + bediening
// - Edit-mode:    side-panel met gevonden apparaten (lokaal: ARP + Hue).
//                 Slepen vanuit panel of tussen plekken op de plattegrond.
//                 Klik op verwijder-badge haalt het icoon weg. Naam aanpassen
//                 voor geplaatste apparaten via ✎-knop.
// - Settings:     ⚙-knop in edit-paneel opent modal voor Hue Bridge IP +
//                 koppelen. Default IP is 192.168.1.159.
//
// Coördinaten worden opgeslagen als fractie (0..1) van canvas breedte/hoogte
// zodat herschalen werkt zonder herpositionering.

import { esc } from '../util/dom.js';
import { getDeviceIcon, deviceTypeLabel } from '../util/device-icons.js';

let state = {
  devices: [],         // geplaatste apparaten (van /api/floorplan)
  discovered: { hue: [], network: [] }, // van /api/floorplan/discover
  editing: false,
  selectedDevice: null,
  renaming: null,      // id van device waarvan label op dit moment bewerkt wordt
};

// Status-cache per device-id voor live aan/uit-indicatie op de plattegrond.
// Wordt gevuld door pollPlacedStatuses() en bijgewerkt na elke actie.
const statusById = new Map();

const LONG_PRESS_MS = 500;
const PRESS_MOVE_TOLERANCE = 12;

let listeners = {
  onSave: null,        // (device) => Promise<void>
  onRemove: null,      // (id) => Promise<void>
  onStatus: null,      // (id) => Promise<status>
  onAction: null,      // (id, action) => Promise<result>
  onRefreshDiscover: null, // () => Promise<void>
  onOpenSettings: null,    // () => Promise<void>
};

export function bindFloorplanListeners(handlers) {
  listeners = { ...listeners, ...handlers };
}

export function renderFloorplanShell() {
  return `
  <div class="floor-main">
    <header class="floor-head">
      <span class="floor-title">Begane grond</span>
      <button type="button" class="floor-edit-btn" id="floor-edit-btn" aria-pressed="false">
        Bewerken
      </button>
    </header>

    <div class="floor-canvas-wrap">
      <div class="floor-canvas" id="floor-canvas"></div>
    </div>

    <aside class="floor-edit-panel" id="floor-edit-panel" hidden>
      <header class="floor-edit-panel-head">
        <strong>Apparaten</strong>
        <span class="floor-edit-panel-actions">
          <button type="button" class="floor-icon-btn" id="floor-settings-btn" title="Instellingen" aria-label="Instellingen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
            </svg>
          </button>
          <button type="button" class="floor-icon-btn" id="floor-refresh-btn" title="Opnieuw scannen" aria-label="Opnieuw scannen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7"/>
              <polyline points="21 4 21 9 16 9"/>
            </svg>
          </button>
        </span>
      </header>
      <div class="floor-edit-list" id="floor-edit-list">
        <div class="state-msg">Klik op &#8635; om te scannen</div>
      </div>
    </aside>

    <div class="floor-modal-overlay" id="floor-modal" hidden>
      <div class="floor-modal-card">
        <button type="button" class="modal-close" id="floor-modal-close" aria-label="Sluiten">&times;</button>
        <div class="floor-modal-body" id="floor-modal-body"></div>
      </div>
    </div>

    <div class="floor-modal-overlay" id="floor-settings-modal" hidden>
      <div class="floor-modal-card">
        <button type="button" class="modal-close" id="floor-settings-close" aria-label="Sluiten">&times;</button>
        <div class="floor-modal-body" id="floor-settings-body">
          <strong class="floor-modal-title">Instellingen</strong>
          <form class="floor-settings-form" id="floor-settings-form">
            <h4 class="floor-settings-heading">Hue Bridge</h4>
            <label class="floor-settings-row">
              <span>Hue Bridge IP</span>
              <input type="text" id="floor-settings-hue-host" placeholder="192.168.1.159" />
            </label>
            <div class="floor-settings-status" id="floor-settings-status"></div>
            <div class="floor-settings-actions">
              <button type="button" class="floor-action-btn" id="floor-settings-test">Verbinden testen</button>
              <button type="button" class="floor-action-btn" id="floor-settings-pair">Koppelen</button>
              <button type="submit" class="floor-action-btn primary">Opslaan</button>
            </div>
            <p class="floor-settings-hint">
              Druk eerst op de fysieke knop op de Hue Bridge en klik daarna binnen 30 seconden op <em>Koppelen</em>.
            </p>
          </form>

          <hr class="floor-settings-divider" />

          <div class="floor-discovery">
            <h4 class="floor-settings-heading">Volledige netwerkscan</h4>
            <p class="floor-discovery-meta" id="floor-discovery-meta">Nog niet uitgevoerd.</p>

            <div class="floor-discovery-progress" id="floor-discovery-progress" hidden>
              <div class="floor-progress-phase" id="floor-progress-phase">Voorbereiden…</div>
              <div class="floor-progress-bar">
                <div class="floor-progress-fill" id="floor-progress-fill" style="width:0%"></div>
              </div>
              <div class="floor-progress-stats" id="floor-progress-stats"></div>
            </div>

            <div class="floor-settings-actions">
              <button type="button" class="floor-action-btn primary" id="floor-discovery-start">Volledig scannen</button>
              <button type="button" class="floor-action-btn" id="floor-discovery-cancel" hidden>Stoppen</button>
            </div>
            <p class="floor-settings-hint">
              Sweep van het hele subnet en poortcontrole per gevonden apparaat. Duurt enkele minuten — meestal hoeft dit maar één keer per maand.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function setFloorplanDevices(devices) {
  state.devices = Array.isArray(devices) ? devices : [];
  renderIcons();
  if (state.editing) renderEditList();
  pollPlacedStatuses();
}

export function setDiscoveredDevices(payload) {
  state.discovered = {
    hue: Array.isArray(payload?.hue) ? payload.hue : [],
    network: Array.isArray(payload?.network) ? payload.network : [],
  };
  if (state.editing) renderEditList();
}

export function isEditing() {
  return state.editing;
}

export function setEditing(on) {
  state.editing = !!on;
  const btn = document.getElementById('floor-edit-btn');
  const panel = document.getElementById('floor-edit-panel');
  const canvas = document.getElementById('floor-canvas');
  if (btn) {
    btn.classList.toggle('active', state.editing);
    btn.setAttribute('aria-pressed', state.editing ? 'true' : 'false');
    btn.textContent = state.editing ? 'Klaar' : 'Bewerken';
  }
  if (panel) panel.hidden = !state.editing;
  if (canvas) canvas.classList.toggle('editing', state.editing);
  renderIcons();
  if (state.editing) renderEditList();
}

function deviceDisplayName(d) {
  return d.customLabel || d.label || d.hostname || d.ip || d.id;
}

function renderIcons() {
  const canvas = document.getElementById('floor-canvas');
  if (!canvas) return;
  if (state.devices.length === 0) {
    canvas.innerHTML = state.editing
      ? '<div class="floor-empty-hint">Sleep apparaten van rechts op de plattegrond</div>'
      : '';
    return;
  }
  canvas.innerHTML = state.devices.map((d) => iconHtml(d)).join('');
}

function iconHtml(d) {
  const xPct = (d.x * 100).toFixed(2);
  const yPct = (d.y * 100).toFixed(2);
  const label = esc(deviceDisplayName(d));
  const stateAttr = stateAttrFor(statusById.get(d.id));
  return `
    <div class="floor-icon" data-id="${esc(d.id)}" style="left:${xPct}%;top:${yPct}%">
      <span class="floor-icon-svg" data-type="${esc(d.type)}" data-state="${stateAttr}">${getDeviceIcon(d.type)}</span>
      <span class="floor-icon-label">${label}</span>
      <button type="button" class="floor-icon-remove" data-action="remove" aria-label="Verwijder ${label}">&times;</button>
    </div>`;
}

function stateAttrFor(status) {
  if (!status) return 'unknown';
  if (status.online === false || status.reachable === false) return 'offline';
  if (status.on === true) return 'on';
  if (status.on === false) return 'off';
  if (status.online === true) return 'online';
  return 'unknown';
}

function controllableDriver(driver) {
  return driver === 'hue_light' || driver === 'shelly';
}

function pollPlacedStatuses() {
  if (!listeners.onStatus) return;
  for (const dev of state.devices) {
    if (!controllableDriver(dev.driver)) continue;
    void pollOne(dev.id);
  }
}

async function pollOne(id) {
  if (!listeners.onStatus) return null;
  try {
    const status = await listeners.onStatus(id);
    statusById.set(id, status || null);
    updateIconState(id);
    return status;
  } catch {
    statusById.set(id, { online: false });
    updateIconState(id);
    return null;
  }
}

function updateIconState(id) {
  const icon = document.querySelector(`.floor-icon[data-id="${CSS.escape(id)}"] .floor-icon-svg`);
  if (!icon) return;
  icon.setAttribute('data-state', stateAttrFor(statusById.get(id)));
}

function priorityRank(d) {
  // Hue eerst, dan herkenbare smart-home (probe-type ≠ generic), dan overige.
  if (d.source === 'hue') return 0;
  if (d.type && d.type !== 'generic') return 1;
  return 2;
}

function renderEditList() {
  const list = document.getElementById('floor-edit-list');
  if (!list) return;
  const placedIds = new Set(state.devices.map((d) => d.id));

  // Sectie 1: geplaatste apparaten — naam aanpassen / verwijderen
  const placed = state.devices.slice().sort((a, b) =>
    deviceDisplayName(a).localeCompare(deviceDisplayName(b))
  );

  // Sectie 2: gevonden apparaten — Hue + ARP, gefilterd op niet-geplaatst,
  // gegroepeerd op prioriteit en gesorteerd op type/label
  const all = [...state.discovered.hue, ...state.discovered.network];
  const candidates = all
    .filter((d) => !placedIds.has(d.id))
    .sort((a, b) => {
      const r = priorityRank(a) - priorityRank(b);
      if (r !== 0) return r;
      return (a.label || a.id).localeCompare(b.label || b.id);
    });

  const html = [];
  if (placed.length > 0) {
    html.push('<h4 class="floor-edit-section">Geplaatst</h4>');
    html.push(placed.map(placedItemHtml).join(''));
  }
  if (candidates.length > 0) {
    html.push('<h4 class="floor-edit-section">Gevonden</h4>');
    html.push(candidates.map(discoveredItemHtml).join(''));
  } else if (placed.length === 0) {
    html.push('<div class="state-msg">Geen apparaten — klik &#8635; om te scannen</div>');
  }

  list.innerHTML = html.join('');
}

function placedItemHtml(d) {
  const isRenaming = state.renaming === d.id;
  const label = esc(deviceDisplayName(d));
  const sub = esc(
    [deviceTypeLabel(d.type), d.vendor, d.ip].filter(Boolean).join(' • ')
  );
  if (isRenaming) {
    const initial = esc(d.customLabel || d.label || '');
    return `
      <div class="floor-pill placed renaming" data-placed="${esc(d.id)}">
        <span class="floor-pill-icon" data-type="${esc(d.type)}">${getDeviceIcon(d.type)}</span>
        <span class="floor-pill-text">
          <input type="text" class="floor-pill-input" data-rename="${esc(d.id)}" value="${initial}" placeholder="${esc(d.label || '')}" />
          <small>${sub}</small>
        </span>
        <button type="button" class="floor-pill-action" data-rename-save="${esc(d.id)}" title="Opslaan">✓</button>
        <button type="button" class="floor-pill-action" data-rename-cancel="${esc(d.id)}" title="Annuleren">×</button>
      </div>`;
  }
  return `
    <div class="floor-pill placed" data-placed="${esc(d.id)}">
      <span class="floor-pill-icon" data-type="${esc(d.type)}">${getDeviceIcon(d.type)}</span>
      <span class="floor-pill-text">
        <strong>${label}</strong>
        <small>${sub}</small>
      </span>
      <button type="button" class="floor-pill-action" data-rename-start="${esc(d.id)}" title="Naam aanpassen" aria-label="Naam aanpassen">✎</button>
    </div>`;
}

function discoveredItemHtml(d) {
  const primary = d.label || d.hostname || d.ip || d.id;
  const sub =
    [deviceTypeLabel(d.type || 'generic'), d.vendor, d.ip].filter(Boolean).join(' • ');
  const portChip =
    Array.isArray(d.ports) && d.ports.length > 0
      ? `<span class="floor-pill-portchip" title="${esc(
          d.ports.map((p) => `${p.port} ${p.name}`).join(', ')
        )}">${d.ports.length} poort${d.ports.length === 1 ? '' : 'en'}</span>`
      : '';
  return `
    <button type="button" class="floor-pill" draggable="true"
            data-discovered="${esc(d.id)}"
            data-source="${esc(d.source || 'arp')}"
            data-type="${esc(d.type || 'generic')}"
            data-label="${esc(primary)}"
            data-vendor="${esc(d.vendor || '')}"
            data-driver="${esc(d.driver || 'generic')}"
            data-local-endpoint="${esc(d.local_endpoint || '')}"
            ${d.ip ? `data-ip="${esc(d.ip)}"` : ''}
            ${d.mac ? `data-mac="${esc(d.mac)}"` : ''}
            ${d.hostname ? `data-hostname="${esc(d.hostname)}"` : ''}>
      <span class="floor-pill-icon" data-type="${esc(d.type || 'generic')}">${getDeviceIcon(d.type)}</span>
      <span class="floor-pill-text">
        <strong>${esc(primary)}</strong>
        <small>${esc(sub)}</small>
      </span>
      ${portChip}
    </button>`;
}

// Drag-en-drop binnen de canvas. Wordt opgezet door bindFloorplanInteractions.
export function bindFloorplanInteractions() {
  const canvas = document.getElementById('floor-canvas');
  const editBtn = document.getElementById('floor-edit-btn');
  const refreshBtn = document.getElementById('floor-refresh-btn');
  const settingsBtn = document.getElementById('floor-settings-btn');
  const list = document.getElementById('floor-edit-list');
  const modal = document.getElementById('floor-modal');
  const modalClose = document.getElementById('floor-modal-close');

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const next = !state.editing;
      setEditing(next);
      if (next && listeners.onRefreshDiscover) listeners.onRefreshDiscover();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (listeners.onRefreshDiscover) listeners.onRefreshDiscover();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (listeners.onOpenSettings) listeners.onOpenSettings();
    });
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      modal.hidden = true;
      state.selectedDevice = null;
    });
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.hidden = true;
        state.selectedDevice = null;
      }
    });
  }

  if (canvas) {
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dragover', (e) => {
      if (!state.editing) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    canvas.addEventListener('drop', onCanvasDrop);
    bindIconDragging(canvas);
    bindIconPress(canvas);
  }

  if (list) {
    list.addEventListener('dragstart', onPillDragStart);
    list.addEventListener('click', onListClick);
    list.addEventListener('keydown', onListKeydown);
  }
}

function onCanvasClick(e) {
  const removeBtn = e.target.closest('[data-action="remove"]');
  if (removeBtn && state.editing) {
    const icon = removeBtn.closest('.floor-icon');
    const id = icon?.dataset.id;
    if (id && listeners.onRemove) listeners.onRemove(id);
    return;
  }
  // Tikken op iconen in normale mode wordt door bindIconPress afgehandeld:
  // korte tik = standaardactie, langer = popup.
}

function bindIconPress(canvas) {
  let pressTimer = null;
  let pressedIcon = null;
  let longPressed = false;
  let startX = 0;
  let startY = 0;

  function clearPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    pressedIcon = null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state.editing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const icon = e.target.closest('.floor-icon');
    if (!icon) return;
    if (e.target.closest('[data-action]')) return; // bv. remove-knop
    pressedIcon = icon;
    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    pressTimer = setTimeout(() => {
      longPressed = true;
      pressTimer = null;
      const id = pressedIcon?.dataset.id;
      const dev = state.devices.find((d) => d.id === id);
      if (dev) openDeviceModal(dev);
    }, LONG_PRESS_MS);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pressedIcon) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > PRESS_MOVE_TOLERANCE) clearPress();
  });

  canvas.addEventListener('pointerup', async () => {
    if (state.editing) { clearPress(); return; }
    if (!pressedIcon) return;
    const icon = pressedIcon;
    if (longPressed) {
      // Modal werd geopend in pressTimer; vang de bijbehorende
      // synthetische click op zodat de overlay niet direct weer sluit.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, true), 200);
      clearPress();
      return;
    }
    clearPress();
    const id = icon.dataset.id;
    const dev = state.devices.find((d) => d.id === id);
    if (dev) await runDefaultAction(dev);
  });

  canvas.addEventListener('pointercancel', clearPress);
  canvas.addEventListener('pointerleave', clearPress);
}

async function runDefaultAction(device) {
  // Schakelbare apparaten: aan/uit togglen met optimistische UI-update.
  if (controllableDriver(device.driver) && listeners.onAction) {
    const prev = statusById.get(device.id);
    if (prev && typeof prev.on === 'boolean') {
      statusById.set(device.id, { ...prev, on: !prev.on });
      updateIconState(device.id);
    }
    try {
      await listeners.onAction(device.id, { type: 'toggle' });
    } catch (err) {
      console.warn('[floorplan] toggle fout:', err);
    } finally {
      await pollOne(device.id);
    }
    return;
  }
  // Niet-schakelbare apparaten: popup openen als alternatief.
  openDeviceModal(device);
}

function onListClick(e) {
  const startBtn = e.target.closest('[data-rename-start]');
  if (startBtn) {
    state.renaming = startBtn.getAttribute('data-rename-start');
    renderEditList();
    requestAnimationFrame(() => {
      const input = document.querySelector(
        `[data-rename="${CSS.escape(state.renaming)}"]`
      );
      if (input) {
        input.focus();
        input.select();
      }
    });
    return;
  }
  const cancelBtn = e.target.closest('[data-rename-cancel]');
  if (cancelBtn) {
    state.renaming = null;
    renderEditList();
    return;
  }
  const saveBtn = e.target.closest('[data-rename-save]');
  if (saveBtn) {
    const id = saveBtn.getAttribute('data-rename-save');
    submitRename(id);
  }
}

function onListKeydown(e) {
  if (e.key !== 'Enter' && e.key !== 'Escape') return;
  const input = e.target.closest('[data-rename]');
  if (!input) return;
  const id = input.getAttribute('data-rename');
  if (e.key === 'Escape') {
    state.renaming = null;
    renderEditList();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submitRename(id);
  }
}

async function submitRename(id) {
  const input = document.querySelector(`[data-rename="${CSS.escape(id)}"]`);
  if (!input) return;
  const dev = state.devices.find((d) => d.id === id);
  if (!dev) return;
  const next = { ...dev, customLabel: input.value.trim() || null };
  state.renaming = null;
  if (listeners.onSave) await listeners.onSave(next);
  // Re-render gebeurt via setFloorplanDevices nadat de save terugkomt;
  // voor de zekerheid alvast lokaal:
  renderEditList();
}

function onPillDragStart(e) {
  const pill = e.target.closest('[data-discovered]');
  if (!pill) return;
  const payload = {
    kind: 'discovered',
    id: pill.dataset.discovered,
    source: pill.dataset.source,
    type: pill.dataset.type,
    label: pill.dataset.label,
    vendor: pill.dataset.vendor || null,
    driver: pill.dataset.driver || 'generic',
    local_endpoint: pill.dataset.localEndpoint || null,
    ip: pill.dataset.ip || null,
    mac: pill.dataset.mac || null,
    hostname: pill.dataset.hostname || null,
  };
  e.dataTransfer.setData('application/json', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

async function onCanvasDrop(e) {
  if (!state.editing) return;
  e.preventDefault();
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  let payload = null;
  try {
    const raw = e.dataTransfer.getData('application/json');
    if (raw) payload = JSON.parse(raw);
  } catch {}
  if (!payload) return;

  if (payload.kind === 'reposition') {
    const dev = state.devices.find((d) => d.id === payload.id);
    if (!dev) return;
    const updated = { ...dev, x, y };
    if (listeners.onSave) await listeners.onSave(updated);
    return;
  }

  if (payload.kind === 'discovered') {
    const device = {
      id: payload.id,
      label: payload.label || '',
      type: payload.type || 'generic',
      x,
      y,
      ip: payload.ip || null,
      mac: payload.mac || null,
      hostname: payload.hostname || null,
      vendor: payload.vendor || null,
      driver: payload.driver || 'generic',
      local_endpoint: payload.local_endpoint || (payload.ip ? `http://${payload.ip}` : null),
    };
    if (listeners.onSave) await listeners.onSave(device);
  }
}

function bindIconDragging(canvas) {
  canvas.addEventListener('dragstart', (e) => {
    if (!state.editing) return;
    const icon = e.target.closest('.floor-icon');
    if (!icon) return;
    const payload = { kind: 'reposition', id: icon.dataset.id };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!state.editing) return;
    const icon = e.target.closest('.floor-icon');
    if (icon) icon.draggable = true;
  });
}

// Mireds ↔ Kelvin. Hue-lampen lopen typisch 153 (~6500K, koud) tot 500 (2000K, warm).
function miredsToKelvin(mireds) {
  if (!Number.isFinite(mireds) || mireds <= 0) return null;
  return Math.round(1_000_000 / mireds / 100) * 100;
}

function briToPercent(bri) {
  if (!Number.isFinite(bri)) return null;
  return Math.round((Math.max(1, Math.min(254, bri)) / 254) * 100);
}

async function openDeviceModal(device) {
  state.selectedDevice = device;
  const modal = document.getElementById('floor-modal');
  const body = document.getElementById('floor-modal-body');
  if (!modal || !body) return;
  modal.hidden = false;
  body.innerHTML = renderPopupShell(device);
  // Direct status ophalen (vult de live regio in)
  let status = null;
  try {
    if (listeners.onStatus) status = await listeners.onStatus(device.id);
  } catch (err) {
    status = { online: false, error: err.message };
  }
  if (state.selectedDevice?.id !== device.id) return;
  statusById.set(device.id, status || null);
  updateIconState(device.id);
  renderStatus(device, status);
}

function renderPopupShell(device) {
  const name = esc(deviceDisplayName(device));
  const sub = esc(
    [deviceTypeLabel(device.type), device.vendor].filter(Boolean).join(' · ')
  );
  return `
    <header class="device-popup-header">
      <span class="device-popup-icon" data-type="${esc(device.type)}" id="device-popup-icon">
        ${getDeviceIcon(device.type)}
      </span>
      <div class="device-popup-title-block">
        <strong class="device-popup-name">${name}</strong>
        <span class="device-popup-sub">${sub}</span>
      </div>
    </header>

    <div class="device-popup-status-row" id="device-popup-status">
      <div class="state-msg">Status ophalen…</div>
    </div>

    <section class="device-popup-controls" id="device-popup-controls" hidden></section>

    <section class="device-popup-info">
      ${renderInfoGrid(device)}
    </section>`;
}

function renderInfoGrid(device) {
  const rows = [];
  if (device.ip) rows.push(['IP', esc(device.ip)]);
  if (device.mac) rows.push(['MAC', esc(device.mac)]);
  if (device.hostname) rows.push(['Hostname', esc(device.hostname)]);
  if (device.driver && device.driver !== 'generic') {
    rows.push(['Driver', esc(device.driver)]);
  }
  if (rows.length === 0) return '';
  return `
    <dl class="device-popup-info-grid">
      ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
    </dl>`;
}

function renderStatus(device, status) {
  const statusSlot = document.getElementById('device-popup-status');
  const controlsSlot = document.getElementById('device-popup-controls');
  const iconSlot = document.getElementById('device-popup-icon');
  if (!statusSlot || !controlsSlot) return;

  if (!status) {
    statusSlot.innerHTML = '<div class="state-msg">Geen status</div>';
    controlsSlot.hidden = true;
    return;
  }

  // Status-regel met online dot + extra context
  const online = !!status.online;
  const dot = `<span class="status-dot ${online ? 'online' : 'offline'}"></span>`;
  const labelBits = [online ? 'Online' : 'Offline'];
  if (online && status.reachable === false) labelBits.push('niet bereikbaar');
  if (online && status.swversion) labelBits.push(`fw ${esc(status.swversion)}`);
  const errorHtml = status.error
    ? `<div class="floor-status-error">${esc(status.error)}</div>`
    : '';
  statusSlot.innerHTML = `
    <span class="device-popup-status-line">${dot}<span>${labelBits.join(' · ')}</span></span>
    ${errorHtml}`;

  // Pas icoon-state aan: groen-glow als 'aan' bekend en true
  if (iconSlot) {
    if (status.on === true) iconSlot.dataset.on = 'true';
    else iconSlot.removeAttribute('data-on');
  }

  // Driver-specifieke bediening renderen
  const controlsHtml = renderControls(device, status);
  if (controlsHtml) {
    controlsSlot.innerHTML = controlsHtml;
    controlsSlot.hidden = false;
    bindControlHandlers(device, status);
  } else {
    controlsSlot.innerHTML = '';
    controlsSlot.hidden = true;
  }
}

function renderControls(device, status) {
  const driver = device.driver || 'generic';
  const sections = [];

  // On/Off toggle (Hue light + Shelly)
  if ((driver === 'hue_light' || driver === 'shelly') && typeof status.on === 'boolean') {
    sections.push(`
      <div class="device-popup-control-row">
        <span class="device-popup-control-label">Aan / uit</span>
        <button type="button"
                class="device-toggle ${status.on ? 'on' : 'off'}"
                data-act="toggle"
                aria-pressed="${status.on ? 'true' : 'false'}">
          <span class="device-toggle-knob"></span>
        </button>
      </div>`);
  }

  // Helderheid (Hue light)
  if (driver === 'hue_light' && status.supports?.brightness && Number.isFinite(status.brightness)) {
    const pct = briToPercent(status.brightness);
    sections.push(`
      <div class="device-popup-slider">
        <div class="device-popup-slider-head">
          <span>Helderheid</span>
          <strong data-slider-value="brightness">${pct}%</strong>
        </div>
        <input type="range" min="1" max="254" step="1"
               value="${status.brightness}"
               data-slider="brightness"
               aria-label="Helderheid" />
      </div>`);
  }

  // Kleurtemperatuur (Hue light)
  if (driver === 'hue_light' && status.supports?.color_temp && Number.isFinite(status.color_temp)) {
    const k = miredsToKelvin(status.color_temp);
    sections.push(`
      <div class="device-popup-slider">
        <div class="device-popup-slider-head">
          <span>Kleurtemperatuur</span>
          <strong data-slider-value="color_temp">${k} K</strong>
        </div>
        <input type="range" min="153" max="500" step="1"
               value="${status.color_temp}"
               data-slider="color_temp"
               class="ct-slider"
               aria-label="Kleurtemperatuur" />
      </div>`);
  }

  // Vermogen (Shelly)
  if (driver === 'shelly' && Number.isFinite(status.power_w)) {
    sections.push(`
      <div class="device-popup-meter">
        <span>Vermogen</span>
        <strong>${Math.round(status.power_w)} W</strong>
      </div>`);
  }

  // Hue Bridge: alleen extra info — geen bediening
  if (driver === 'hue_bridge') {
    const rows = [];
    if (status.model) rows.push(['Model', esc(status.model)]);
    if (status.bridgeid) rows.push(['Bridge-id', esc(status.bridgeid)]);
    if (rows.length > 0) {
      sections.push(`
        <dl class="device-popup-info-grid">
          ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
        </dl>`);
    }
  }

  // Hue Light extra metadata
  if (driver === 'hue_light') {
    const rows = [];
    if (status.product) rows.push(['Product', esc(status.product)]);
    if (status.model) rows.push(['Model', esc(status.model)]);
    if (rows.length > 0) {
      sections.push(`
        <dl class="device-popup-info-grid">
          ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
        </dl>`);
    }
  }

  return sections.length > 0 ? sections.join('') : '';
}

function bindControlHandlers(device, status) {
  const slot = document.getElementById('device-popup-controls');
  if (!slot) return;

  // Toggle-knop
  const toggle = slot.querySelector('[data-act="toggle"]');
  if (toggle) {
    toggle.addEventListener('click', async () => {
      if (!listeners.onAction) return;
      toggle.disabled = true;
      try {
        // Direct optimistisch flippen voor snelle feedback
        const wasOn = toggle.classList.contains('on');
        toggle.classList.toggle('on', !wasOn);
        toggle.classList.toggle('off', wasOn);
        toggle.setAttribute('aria-pressed', !wasOn ? 'true' : 'false');
        await listeners.onAction(device.id, { type: 'toggle' });
        const next = listeners.onStatus ? await listeners.onStatus(device.id) : null;
        statusById.set(device.id, next || null);
        updateIconState(device.id);
        renderStatus(device, next);
      } catch (err) {
        showError(err);
      } finally {
        toggle.disabled = false;
      }
    });
  }

  // Sliders — live label-update; serverupdate op 'change' (release)
  slot.querySelectorAll('[data-slider]').forEach((slider) => {
    const kind = slider.getAttribute('data-slider');
    const valueLabel = slot.querySelector(`[data-slider-value="${kind}"]`);
    slider.addEventListener('input', () => {
      if (!valueLabel) return;
      const v = Number(slider.value);
      if (kind === 'brightness') valueLabel.textContent = `${briToPercent(v)}%`;
      if (kind === 'color_temp') valueLabel.textContent = `${miredsToKelvin(v)} K`;
    });
    slider.addEventListener('change', async () => {
      if (!listeners.onAction) return;
      slider.disabled = true;
      try {
        await listeners.onAction(device.id, { type: kind, value: Number(slider.value) });
        const next = listeners.onStatus ? await listeners.onStatus(device.id) : null;
        statusById.set(device.id, next || null);
        updateIconState(device.id);
        renderStatus(device, next);
      } catch (err) {
        showError(err);
      } finally {
        slider.disabled = false;
      }
    });
  });
}

function showError(err) {
  const slot = document.getElementById('device-popup-status');
  if (!slot) return;
  slot.insertAdjacentHTML(
    'beforeend',
    `<div class="floor-status-error">${esc(err.message || String(err))}</div>`
  );
}
