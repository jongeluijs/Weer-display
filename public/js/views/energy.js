// Energie-dashboard view. Live vermogen + vandaag + 14 dagen historie.
// Wordt zichtbaar via right-edge swipe (zie app.js), niet via tabs.

import { esc } from '../util/dom.js';

// Fallback-tarieven als de live-tarievenfetch (Greenchoice via overstappen.nl)
// nog geen waarde heeft. NL gemiddeld 2026.
const FALLBACK_PRICE_KWH = 0.32;
const FALLBACK_PRICE_M3 = 1.35;

// Verbruiks-bandkleuren (W).
function powerBandColor(w) {
  if (!Number.isFinite(w)) return 'rgba(255,255,255,0.25)';
  if (w < 100) return '#6fd598';   // groen, idle
  if (w < 500) return '#9bd178';   // licht-groen
  if (w < 1500) return '#e0c34e';  // geel
  if (w < 3500) return '#ffb454';  // oranje
  return '#ff5a5f';                // rood, hoog
}

// Gas-rate bandkleuren (m³/h). Een CV op vol vermogen pakt ~2 m³/h, een
// combiketel + tappunt + kookplaat samen ~4 m³/h. Boven 5 m³/h is uitzonderlijk.
const GAS_GAUGE_MAX = 5;

function gasBandColor(rate) {
  if (!Number.isFinite(rate) || rate <= 0.02) return 'rgba(122,168,255,0.4)';
  if (rate < 0.5) return '#6fd598';
  if (rate < 1.5) return '#7aa8ff';
  if (rate < 3) return '#ffb454';
  return '#ff5a5f';
}

function formatGasRate(rate) {
  if (!Number.isFinite(rate)) return '— m³/h';
  if (rate < 0.05) return '0 m³/h';
  if (rate < 1) return `${rate.toFixed(2)} m³/h`;
  return `${rate.toFixed(1)} m³/h`;
}

// W → leesbare string. Onder 1000 W → hele watts. Daarboven → kW met 2 decimalen.
function formatPower(w) {
  if (!Number.isFinite(w)) return '—';
  if (w < 1000) return `${Math.round(w)} W`;
  return `${(w / 1000).toFixed(2)} kW`;
}

function formatKwh(v) {
  if (!Number.isFinite(v)) return '—';
  if (v < 10) return `${v.toFixed(2)} kWh`;
  return `${v.toFixed(1)} kWh`;
}

function formatM3(v) {
  if (!Number.isFinite(v) || v === 0) return '—';
  return `${v.toFixed(2)} m³`;
}

function formatEuro(v) {
  if (!Number.isFinite(v)) return '—';
  if (v < 10) return `€ ${v.toFixed(2)}`;
  return `€ ${v.toFixed(1)}`;
}

function formatRate(value) {
  if (!Number.isFinite(value)) return '—';
  return `€ ${value.toFixed(4).replace('.', ',')}`;
}

function dayShortLabel(dateStr) {
  // "YYYY-MM-DD" → "ma 26"
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  return `${days[date.getDay()]} ${d}`;
}

function dayLongLabel(dateStr) {
  // "YYYY-MM-DD" → "ma 28 apr"
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[date.getDay()]} ${d} ${months[m - 1]}`;
}

// Bouwt het skelet — wordt eenmalig geïnjecteerd. De live waarden worden
// daarna via JS geüpdatet (zie updateEnergyHero/Live in app.js).
export function renderEnergyShell() {
  return `
  <div class="energy-main">
    <header class="energy-head">
      <span class="energy-status" id="energy-status">
        <span class="live-dot"></span>
        <span id="energy-status-text">verbinden…</span>
      </span>
      <span class="energy-title">Energie</span>
      <span class="energy-clock" id="energy-clock">--:--</span>
    </header>

    <nav class="energy-tabs" role="tablist">
      <button type="button" class="energy-tab" data-energy-view="historie" role="tab">Historie</button>
      <button type="button" class="energy-tab active" data-energy-view="live" role="tab">Live</button>
    </nav>

    <section class="energy-pane active" data-pane="live" role="tabpanel">
      <section class="energy-gauges" id="energy-gauges">
        ${renderGauge({
          kind: 'power',
          label: 'Stroom',
          accent: '#ffb454',
          glow: 'rgba(255,180,84,0.18)',
          placeholder: '— W',
        })}
        ${renderGauge({
          kind: 'gas',
          label: 'Gas',
          accent: '#7aa8ff',
          glow: 'rgba(122,168,255,0.18)',
          placeholder: '— m³/h',
        })}
      </section>

      <section class="energy-cost" id="energy-cost"></section>

      <section class="energy-hourly-block">
        <div class="energy-block-head">
          <span>Per uur · vandaag</span>
          <span class="energy-hourly-legend">
            <span class="legend-dot" style="background:#ffb454"></span>kWh
            <span class="legend-dot" style="background:#7aa8ff"></span>m³
          </span>
        </div>
        <div class="energy-hourly" id="energy-hourly"></div>
      </section>

      <div class="energy-diagnose" id="energy-diagnose" hidden></div>
    </section>

    <section class="energy-pane" data-pane="historie" role="tabpanel">
      <section class="energy-block">
        <div class="energy-block-head">
          <span>Laatste 14 dagen</span>
          <span class="energy-block-sub" id="energy-daily-sub">tap voor uurprofiel</span>
        </div>
        <div class="energy-daily" id="energy-daily"></div>
      </section>

      <section class="energy-hourly-block" id="energy-day-hourly-block" hidden>
        <div class="energy-block-head">
          <span id="energy-day-hourly-title">Per uur</span>
          <span class="energy-hourly-legend">
            <span class="legend-dot" style="background:#ffb454"></span>kWh
            <span class="legend-dot" style="background:#7aa8ff"></span>m³
          </span>
        </div>
        <div class="energy-hourly" id="energy-day-hourly"></div>
      </section>
    </section>
  </div>`;
}

// Eén ringgauge (power of gas). Toont label, live waarde (groot) en het
// dagtotaal (kleiner, eronder) — alles binnen de cirkel.
function renderGauge({ kind, label, accent, glow, placeholder }) {
  const arcId = `energy-${kind}-arc`;
  const glowId = `energy-${kind}-glow`;
  const valueId = `energy-${kind}-value`;
  const totalId = `energy-${kind}-total`;
  return `
  <div class="energy-gauge" data-kind="${kind}">
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="energy-ring-svg">
      <defs>
        <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="${glow}"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="90" fill="url(#${glowId})"/>
      <circle cx="100" cy="100" r="86" fill="none"
              stroke="rgba(255,255,255,0.06)" stroke-width="6"/>
      <circle cx="100" cy="100" r="86" fill="none"
              id="${arcId}"
              stroke="${accent}" stroke-width="6" stroke-linecap="round"
              pathLength="100" stroke-dasharray="0 100"
              transform="rotate(-90 100 100)"
              style="transition: stroke-dasharray 0.6s ease, stroke 0.6s ease;"/>
      <g stroke="rgba(255,255,255,0.18)" stroke-width="1.2">
        ${renderRingTicks()}
      </g>
    </svg>
    <div class="energy-gauge-text">
      <div class="energy-gauge-label">${label}</div>
      <div class="energy-gauge-value" id="${valueId}">${placeholder}</div>
      <div class="energy-gauge-total" id="${totalId}">—</div>
    </div>
  </div>`;
}

// 12 ticks rondom de ring (elke 30°). Markant op kW-grenzen.
function renderRingTicks() {
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x1 = 100 + Math.cos(angle) * 92;
    const y1 = 100 + Math.sin(angle) * 92;
    const x2 = 100 + Math.cos(angle) * 96;
    const y2 = 100 + Math.sin(angle) * 96;
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return ticks.join('');
}

// Update power-gauge. Wordt aangeroepen bij elke power-event en bij snapshot.
// `today.kwh` (optioneel) → dagtotaal in de gauge.
export function updateEnergyHero(snapshot, today) {
  const powerW = Number.isFinite(snapshot.power_kw) ? snapshot.power_kw * 1000 : null;
  const valueEl = document.getElementById('energy-power-value');
  const totalEl = document.getElementById('energy-power-total');
  const arcEl = document.getElementById('energy-power-arc');
  const statusText = document.getElementById('energy-status-text');

  if (valueEl) valueEl.textContent = formatPower(powerW);

  if (arcEl && Number.isFinite(powerW)) {
    const pct = Math.max(0, Math.min(100, (powerW / 5000) * 100));
    const color = powerBandColor(powerW);
    arcEl.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
    arcEl.setAttribute('stroke', color);
    if (valueEl) valueEl.style.color = color;
  }

  if (totalEl) {
    const kwhToday = Number(today?.kwh);
    totalEl.textContent = Number.isFinite(kwhToday)
      ? `${formatKwh(kwhToday)} vandaag`
      : '— vandaag';
  }

  if (statusText) {
    statusText.textContent = snapshot.connected ? 'live' : 'offline';
  }
}

// Update gas-gauge op basis van actuele m³/uur (afgeleid uit gas-meterstand
// over een 6-min venster, server-side berekend).
export function updateEnergyGas(snapshot, today) {
  const rate = Number(snapshot?.gas_rate_m3_h);
  const valueEl = document.getElementById('energy-gas-value');
  const totalEl = document.getElementById('energy-gas-total');
  const arcEl = document.getElementById('energy-gas-arc');

  const valid = Number.isFinite(rate);
  if (valueEl) valueEl.textContent = formatGasRate(rate);

  if (arcEl) {
    const pct = valid ? Math.max(0, Math.min(100, (rate / GAS_GAUGE_MAX) * 100)) : 0;
    const color = gasBandColor(valid ? rate : NaN);
    arcEl.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
    arcEl.setAttribute('stroke', color);
    if (valueEl) valueEl.style.color = color;
  }

  if (totalEl) {
    const m3Today = Number(today?.m3);
    totalEl.textContent = Number.isFinite(m3Today)
      ? `${formatM3(m3Today)} vandaag`
      : '— vandaag';
  }
}

// Compacte uptime-string: kiest grootste twee eenheden (d/u/m).
function formatUptime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}u`;
  if (h > 0) return `${h}u ${m}m`;
  return `${m}m`;
}

// Diagnose-strip: drie pillen onder elkaar — verbindingsstatus, hoe lang we
// online zijn sinds laatste reconnect, en stroomstoringen. Alle data zit in
// de SSE-snapshot, geen extra meter-belasting.
export function updateEnergyDiagnostics(snapshot) {
  const target = document.getElementById('energy-diagnose');
  if (!target || !snapshot) return;

  const conn = !!snapshot.connected;

  // Online sinds: server-side timestamp van laatste reconnect. Bij offline
  // valt 'ie op null en tonen we een streep.
  let onlineStr = '—';
  const since = snapshot.online_since_at ? new Date(snapshot.online_since_at) : null;
  if (conn && since && !Number.isNaN(since.getTime())) {
    const sec = Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000));
    onlineStr = formatUptime(sec) || '0m';
  }

  // Stroomstoringen sinds server-start (lifetime-totalen uit de meter zijn
  // niet actionable). 0/0 = stabiel. Bij toename → warn-styling + tijdstip.
  const dShort = Number.isFinite(Number(snapshot.failures_since_start))
    ? Number(snapshot.failures_since_start)
    : 0;
  const dLong = Number.isFinite(Number(snapshot.failures_long_since_start))
    ? Number(snapshot.failures_long_since_start)
    : 0;
  const failTotal = dShort + dLong;
  const failClass = failTotal === 0 ? 'ok' : 'warn';
  const failText = failTotal === 0 ? 'geen storingen' : `${failTotal} storing${failTotal === 1 ? '' : 'en'}`;

  target.hidden = false;
  target.innerHTML = `
    <div class="diag-pill diag-pill--${conn ? 'live' : 'off'}" title="SSE-verbinding met meter">
      <span class="diag-pill-icon">
        <span class="diag-pill-dot"></span>
      </span>
      <div class="diag-pill-text">
        <div class="diag-pill-label">Status</div>
        <div class="diag-pill-value">${conn ? 'Live' : 'Offline'}</div>
      </div>
    </div>
    <div class="diag-pill" title="Tijd sinds we voor het laatst online kwamen">
      <span class="diag-pill-icon">${diagIcon('clock')}</span>
      <div class="diag-pill-text">
        <div class="diag-pill-label">Online sinds</div>
        <div class="diag-pill-value">${esc(onlineStr)}</div>
      </div>
    </div>
    <div class="diag-pill diag-pill--${failClass}" title="Stroomstoringen sinds server-start">
      <span class="diag-pill-icon">${diagIcon('bolt')}</span>
      <div class="diag-pill-text">
        <div class="diag-pill-label">Stroomstoring</div>
        <div class="diag-pill-value">${esc(failText)}</div>
      </div>
    </div>`;
}

// Kleine inline-icoontjes voor de diagnose-pillen.
function diagIcon(name) {
  if (name === 'clock') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  }
  if (name === 'bolt') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 L13 2 Z"/></svg>`;
  }
  return '';
}

// Histogram: kWh + m³ per uur vandaag. Twee bars per uur (links kWh, rechts m³),
// elk genormaliseerd naar zijn eigen max zodat beide reeksen leesbaar zijn.
export function updateEnergyHourly(entries) {
  const target = document.getElementById('energy-hourly');
  if (!target) return;
  if (!Array.isArray(entries) || entries.length === 0) {
    target.innerHTML = '<div class="energy-empty">verzamelt data…</div>';
    return;
  }
  target.innerHTML = renderHourlyHistogram(entries);
}

// Compacte numerieke notatie voor staaflabels. < 0.1 → 2 dec, < 10 → 1 dec,
// daarboven afgerond. 0/null → lege string zodat label wegvalt.
function formatBarValue(v) {
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v < 0.1) return v.toFixed(2);
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toString();
}

function renderHourlyHistogram(entries) {
  const width = 520;
  const height = 110;
  const padX = 16;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2 - 10; // ruimte voor x-labels
  const n = entries.length;
  const slot = innerW / n;
  // Smalle staven, krap binnen-uur gat — overige slot-ruimte → duidelijk
  // zichtbaar tussen-uur gat zodat elk uur als groep leesbaar blijft.
  const barW = Math.max(2, slot * 0.18);
  const intraGap = 1;
  const groupW = barW * 2 + intraGap;

  // Vaste y-schalen: 1 kWh en 1 m³ per uur. Hogere waarden vullen de hele
  // staaf, het label boven blijft de echte waarde tonen.
  const kwhMax = 1;
  const m3Max = 1;
  const baseY = padY + innerH;
  const labelFont = 7;

  const bars = entries
    .map((e, i) => {
      const xKwh = padX + i * slot + (slot - groupW) / 2;
      const xM3 = xKwh + barW + intraGap;
      const kwh = Number(e.kwh);
      const m3 = Number(e.m3);
      const hKwh = Number.isFinite(kwh) && kwh > 0
        ? Math.min(1, kwh / kwhMax) * innerH
        : 0;
      const hM3 = Number.isFinite(m3) && m3 > 0
        ? Math.min(1, m3 / m3Max) * innerH
        : 0;
      const rectK = hKwh > 0
        ? `<rect x="${xKwh.toFixed(1)}" y="${(baseY - hKwh).toFixed(1)}" width="${barW.toFixed(1)}" height="${hKwh.toFixed(1)}" rx="1.2" fill="#ffb454" opacity="0.88"/>`
        : '';
      const rectM = hM3 > 0
        ? `<rect x="${xM3.toFixed(1)}" y="${(baseY - hM3).toFixed(1)}" width="${barW.toFixed(1)}" height="${hM3.toFixed(1)}" rx="1.2" fill="#7aa8ff" opacity="0.88"/>`
        : '';
      const kwhLabel = formatBarValue(kwh);
      const m3Label = formatBarValue(m3);
      const labK = kwhLabel
        ? `<text x="${(xKwh + barW / 2).toFixed(1)}" y="${(baseY - hKwh - 2).toFixed(1)}" fill="#ffb454" font-size="${labelFont}" text-anchor="middle" font-family="sans-serif" font-variant-numeric="tabular-nums" opacity="0.95">${esc(kwhLabel)}</text>`
        : '';
      const labM = m3Label
        ? `<text x="${(xM3 + barW / 2).toFixed(1)}" y="${(baseY - hM3 - 2).toFixed(1)}" fill="#7aa8ff" font-size="${labelFont}" text-anchor="middle" font-family="sans-serif" font-variant-numeric="tabular-nums" opacity="0.95">${esc(m3Label)}</text>`
        : '';
      return rectK + rectM + labK + labM;
    })
    .join('');

  const xLabels = entries
    .map((e, i) => {
      if (e.hour % 3 !== 0) return '';
      const x = padX + i * slot + slot / 2;
      return `<text x="${x.toFixed(1)}" y="${(height - 2).toFixed(1)}" fill="#8a93a6" font-size="9" text-anchor="middle" font-family="sans-serif">${e.hour}u</text>`;
    })
    .join('');

  const baseline = `<line x1="${padX}" y1="${baseY.toFixed(1)}" x2="${(width - padX).toFixed(1)}" y2="${baseY.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${baseline}${bars}${xLabels}</svg>`;
}

// Geformatteerd "DD mmm" voor tarief-fetch-datum (NL maandafkortingen).
function formatPriceDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// Kosten-paneel: één breed kaartje onder de gauges. Toont totaal vandaag in
// groot formaat naast de actuele kWh- en m³-tarieven (met fallback-? indien
// niet live), plus de fetch-datum van de tarieven onderaan.
// today = { kwh, m3 } | null. pricesInfo = /api/energy/prices payload.
export function updateEnergyToday(today, _yesterday, pricesInfo) {
  const target = document.getElementById('energy-cost');
  if (!target) return;

  const livePrices = pricesInfo?.prices;
  const haveLive =
    livePrices &&
    Number.isFinite(livePrices.kwh_enkel) &&
    Number.isFinite(livePrices.m3);

  const rateKwh = haveLive ? livePrices.kwh_enkel : FALLBACK_PRICE_KWH;
  const rateM3 = haveLive ? livePrices.m3 : FALLBACK_PRICE_M3;
  const uncertain = haveLive ? '' : '<span class="kpi-rate-uncertain">?</span>';

  const kwh = Number(today?.kwh);
  const m3 = Number(today?.m3);

  const costStroom = Number.isFinite(kwh) ? kwh * rateKwh : 0;
  const costGas = Number.isFinite(m3) ? m3 * rateM3 : 0;
  const costTotal = costStroom + costGas;

  const fetchDate = haveLive ? formatPriceDate(pricesInfo?.fetchedAt) : '';
  const supplier = haveLive
    ? `${esc(pricesInfo?.supplier || 'Greenchoice')} ${esc(pricesInfo?.contractType || 'variabel')}`
    : 'Schatting';
  const meta = haveLive
    ? `Tarieven · ${esc(supplier)}${fetchDate ? ` · bijgewerkt ${esc(fetchDate)}` : ''}`
    : 'Tarieven niet opgehaald · schatting';

  target.innerHTML = `
    <div class="cost-head">
      <div class="cost-icon">${kpiIcon('euro')}</div>
      <div class="cost-head-text">
        <div class="cost-label">Kosten vandaag</div>
        <div class="cost-total">${costTotal > 0 ? formatEuro(costTotal) : '—'}</div>
      </div>
    </div>
    <div class="cost-rates">
      <div class="cost-rate">
        <span class="cost-rate-icon" style="color:#ffb454">${kpiIcon('bolt')}</span>
        <div class="cost-rate-text">
          <div class="cost-rate-value"><strong>${formatRate(rateKwh)}</strong>${uncertain}<span class="cost-rate-unit">/kWh</span></div>
          <div class="cost-rate-sub">stroom · ${formatEuro(costStroom)} vandaag</div>
        </div>
      </div>
      <div class="cost-rate">
        <span class="cost-rate-icon" style="color:#7aa8ff">${kpiIcon('flame')}</span>
        <div class="cost-rate-text">
          <div class="cost-rate-value"><strong>${formatRate(rateM3)}</strong>${uncertain}<span class="cost-rate-unit">/m³</span></div>
          <div class="cost-rate-sub">gas · ${formatEuro(costGas)} vandaag</div>
        </div>
      </div>
    </div>
    <div class="cost-meta">${meta}</div>`;
}

// Eenvoudige inline SVG iconen voor de KPI-kaartjes.
function kpiIcon(name) {
  if (name === 'bolt') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 L13 2 Z"/></svg>`;
  }
  if (name === 'euro') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 7a7 7 0 1 0 0 10"/><path d="M4 11h10"/><path d="M4 14h10"/></svg>`;
  }
  if (name === 'flame') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3c2 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4-1 3 1 5 3 4-2-3 0-6 0-10z"/></svg>`;
  }
  return '';
}

// Bar chart over de laatste 14 dagen. Twee staven per dag: kWh (oranje) + m³
// (blauw), elk genormaliseerd naar zijn eigen max zodat beide reeksen zichtbaar
// blijven ondanks de wisselende schaal. entries = [{ date, kwh, m3 }]
export function updateEnergyDaily(entries, selectedDate = null) {
  const target = document.getElementById('energy-daily');
  const sub = document.getElementById('energy-daily-sub');
  if (!target) return;
  if (!Array.isArray(entries) || entries.length === 0) {
    target.innerHTML = '<div class="energy-empty">nog geen dagdata</div>';
    return;
  }
  const today = new Date();
  const padded = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const found = entries.find((e) => e.date === key);
    padded.push({
      date: key,
      kwh: found && Number.isFinite(found.kwh) ? found.kwh : 0,
      m3: found && Number.isFinite(found.m3) ? found.m3 : 0,
    });
  }

  if (sub) {
    const kwhVals = padded.map((p) => p.kwh).filter((v) => v > 0);
    const m3Vals = padded.map((p) => p.m3).filter((v) => v > 0);
    const parts = [];
    if (kwhVals.length) {
      const avg = kwhVals.reduce((a, b) => a + b, 0) / kwhVals.length;
      parts.push(
        `<span class="legend-dot" style="background:#ffb454"></span>gem <strong>${avg.toFixed(1)} kWh</strong>`
      );
    }
    if (m3Vals.length) {
      const avg = m3Vals.reduce((a, b) => a + b, 0) / m3Vals.length;
      parts.push(
        `<span class="legend-dot" style="background:#7aa8ff"></span>gem <strong>${avg.toFixed(1)} m³</strong>`
      );
    }
    sub.innerHTML = parts.join(' · ') || 'tap voor uurprofiel';
  }

  target.innerHTML = renderDailyDualHistogram(padded, selectedDate);
}

// Update de inline uurgrafiek onder de 14-dagen view. `entries` heeft dezelfde
// vorm als de Live-uurgrafiek: [{ hour, kwh, m3 }].
export function updateEnergyDayHourly(entries, date) {
  const block = document.getElementById('energy-day-hourly-block');
  const target = document.getElementById('energy-day-hourly');
  const title = document.getElementById('energy-day-hourly-title');
  if (!block || !target) return;
  block.hidden = false;
  if (title) title.textContent = date ? `Per uur · ${dayLongLabel(date)}` : 'Per uur';
  if (!Array.isArray(entries) || entries.length === 0) {
    target.innerHTML = '<div class="energy-empty">geen uurdata voor deze dag</div>';
    return;
  }
  target.innerHTML = renderHourlyHistogram(entries);
}

export function setEnergyDayHourlyLoading(date) {
  const block = document.getElementById('energy-day-hourly-block');
  const target = document.getElementById('energy-day-hourly');
  const title = document.getElementById('energy-day-hourly-title');
  if (!block || !target) return;
  block.hidden = false;
  if (title) title.textContent = date ? `Per uur · ${dayLongLabel(date)}` : 'Per uur';
  target.innerHTML = '<div class="energy-empty">uurprofiel laden…</div>';
}

function renderDailyDualHistogram(entries, selectedDate = null) {
  const width = 520;
  const height = 140;
  const padX = 18;
  const padY = 18;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2 - 12; // ruimte voor x-labels onderaan
  const n = entries.length;
  const slot = innerW / n;
  // Smalle staven, krap binnen-dag gat — overige slot-ruimte → duidelijk
  // zichtbaar tussen-dag gat zodat elke dag als groep leesbaar blijft.
  const barW = Math.max(3, slot * 0.18);
  const intraGap = 2;
  const groupW = barW * 2 + intraGap;

  // Vaste y-schalen: 10 kWh en 10 m³ per dag. Hogere waarden vullen de hele
  // staaf, het label boven blijft de echte waarde tonen.
  const kwhMax = 10;
  const m3Max = 10;
  const baseY = padY + innerH;
  const labelFont = 9;

  const bars = entries
    .map((e, i) => {
      const xKwh = padX + i * slot + (slot - groupW) / 2;
      const xM3 = xKwh + barW + intraGap;
      const hKwh = e.kwh > 0 ? Math.min(1, e.kwh / kwhMax) * innerH : 0;
      const hM3 = e.m3 > 0 ? Math.min(1, e.m3 / m3Max) * innerH : 0;
      const k = hKwh > 0
        ? `<rect x="${xKwh.toFixed(1)}" y="${(baseY - hKwh).toFixed(1)}" width="${barW.toFixed(1)}" height="${hKwh.toFixed(1)}" rx="1.5" fill="#ffb454" opacity="0.9"/>`
        : '';
      const m = hM3 > 0
        ? `<rect x="${xM3.toFixed(1)}" y="${(baseY - hM3).toFixed(1)}" width="${barW.toFixed(1)}" height="${hM3.toFixed(1)}" rx="1.5" fill="#7aa8ff" opacity="0.9"/>`
        : '';
      const kwhLabel = formatBarValue(e.kwh);
      const m3Label = formatBarValue(e.m3);
      const labK = kwhLabel
        ? `<text x="${(xKwh + barW / 2).toFixed(1)}" y="${(baseY - hKwh - 3).toFixed(1)}" fill="#ffb454" font-size="${labelFont}" text-anchor="middle" font-family="sans-serif" font-variant-numeric="tabular-nums" opacity="0.95">${esc(kwhLabel)}</text>`
        : '';
      const labM = m3Label
        ? `<text x="${(xM3 + barW / 2).toFixed(1)}" y="${(baseY - hM3 - 3).toFixed(1)}" fill="#7aa8ff" font-size="${labelFont}" text-anchor="middle" font-family="sans-serif" font-variant-numeric="tabular-nums" opacity="0.95">${esc(m3Label)}</text>`
        : '';
      return k + m + labK + labM;
    })
    .join('');

  const xLabels = entries
    .map((e, i) => {
      const x = padX + i * slot + slot / 2;
      return `<text x="${x.toFixed(1)}" y="${(height - 2).toFixed(1)}" fill="#8a93a6" font-size="9" text-anchor="middle" font-family="sans-serif">${esc(dayShortLabel(e.date))}</text>`;
    })
    .join('');

  const baseline = `<line x1="${padX}" y1="${baseY.toFixed(1)}" x2="${(width - padX).toFixed(1)}" y2="${baseY.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;

  const selectedIdx = selectedDate
    ? entries.findIndex((e) => e.date === selectedDate)
    : -1;
  const selected = selectedIdx >= 0
    ? `<rect x="${(padX + selectedIdx * slot).toFixed(1)}" y="${padY.toFixed(1)}" width="${slot.toFixed(1)}" height="${innerH.toFixed(1)}" fill="rgba(255,255,255,0.07)" rx="3"/>`
    : '';

  const hits = entries
    .map((e, i) => {
      const x = padX + i * slot;
      return `<rect x="${x.toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${height}"
                fill="transparent" data-energy-day="${esc(e.date)}"
                style="cursor:pointer"/>`;
    })
    .join('');

  return `
    <div class="energy-bar-wrap">
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${baseline}${selected}${bars}${xLabels}
      </svg>
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="energy-bar-hits">
        ${hits}
      </svg>
    </div>`;
}
