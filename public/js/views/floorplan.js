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
  return `
    <div class="floor-icon" data-id="${esc(d.id)}" style="left:${xPct}%;top:${yPct}%">
      <span class="floor-icon-svg" data-type="${esc(d.type)}">${getDeviceIcon(d.type)}</span>
      <span class="floor-icon-label">${label}</span>
      <button type="button" class="floor-icon-remove" data-action="remove" aria-label="Verwijder ${label}">&times;</button>
    </div>`;
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
  if (state.editing) return; // in edit-mode opent geen modal
  const icon = e.target.closest('.floor-icon');
  if (!icon) return;
  const id = icon.dataset.id;
  const dev = state.devices.find((d) => d.id === id);
  if (dev) openDeviceModal(dev);
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

async function openDeviceModal(device) {
  state.selectedDevice = device;
  const modal = document.getElementById('floor-modal');
  const body = document.getElementById('floor-modal-body');
  if (!modal || !body) return;
  modal.hidden = false;
  body.innerHTML = `
    <strong class="floor-modal-title">${esc(deviceDisplayName(device))}</strong>
    <div class="floor-modal-meta">
      <span class="floor-modal-type">${esc(deviceTypeLabel(device.type))}</span>
      ${device.vendor ? `<span>${esc(device.vendor)}</span>` : ''}
      ${device.ip ? `<span>${esc(device.ip)}</span>` : ''}
      ${device.hostname ? `<span>${esc(device.hostname)}</span>` : ''}
    </div>
    <div class="floor-modal-status" id="floor-modal-status">
      <div class="state-msg">Status ophalen…</div>
    </div>`;

  let status = null;
  try {
    if (listeners.onStatus) status = await listeners.onStatus(device.id);
  } catch (err) {
    status = { online: false, error: err.message };
  }
  if (state.selectedDevice?.id !== device.id) return;
  renderStatus(device, status);
}

function renderStatus(device, status) {
  const slot = document.getElementById('floor-modal-status');
  if (!slot) return;
  if (!status) {
    slot.innerHTML = '<div class="state-msg">Geen status</div>';
    return;
  }
  const online = status.online;
  const dot = `<span class="status-dot ${online ? 'online' : 'offline'}"></span>`;
  const lines = [`<div class="floor-status-row">${dot}${online ? 'Online' : 'Offline'}</div>`];

  if (status.error) {
    lines.push(`<div class="floor-status-error">${esc(status.error)}</div>`);
  }
  if (typeof status.on === 'boolean') {
    lines.push(`<div class="floor-status-row">Aan: <strong>${status.on ? 'ja' : 'nee'}</strong></div>`);
  }
  if (Number.isFinite(status.power_w)) {
    lines.push(`<div class="floor-status-row">Vermogen: <strong>${Math.round(status.power_w)} W</strong></div>`);
  }

  // Bediening: alleen voor drivers die acties ondersteunen
  if (device.driver === 'shelly') {
    lines.push(`
      <div class="floor-status-actions">
        <button type="button" class="floor-action-btn" data-act="on">Aan</button>
        <button type="button" class="floor-action-btn" data-act="off">Uit</button>
        <button type="button" class="floor-action-btn" data-act="toggle">Schakel</button>
      </div>`);
  }

  slot.innerHTML = lines.join('');

  slot.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (!listeners.onAction) return;
      btn.disabled = true;
      try {
        await listeners.onAction(device.id, { type: act });
        const next = listeners.onStatus ? await listeners.onStatus(device.id) : null;
        renderStatus(device, next);
      } catch (err) {
        slot.insertAdjacentHTML(
          'beforeend',
          `<div class="floor-status-error">${esc(err.message || String(err))}</div>`
        );
      } finally {
        btn.disabled = false;
      }
    });
  });
}
