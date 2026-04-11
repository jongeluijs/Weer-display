import { esc } from '../util/dom.js';
import { getIcon } from '../components/icons.js';
import { renderWindArrowCompact } from '../components/windArrow.js';
import { parseWeerliveDate, formatDayShort, formatDateShort } from '../util/format.js';

// Zoek de dag met de hoogste (of laagste) waarde voor een gegeven veld.
// Returnt { day, value } of null als er geen geldige waarden zijn.
function findExtreme(days, field, mode = 'max') {
  let best = null;
  for (const d of days) {
    const v = Number(d[field]);
    if (!Number.isFinite(v)) continue;
    if (
      !best ||
      (mode === 'max' && v > best.value) ||
      (mode === 'min' && v < best.value)
    ) {
      best = { day: d, value: v };
    }
  }
  return best;
}

// Inline mini-bar (horizontale voortgang 0..100) voor binnen een forecast-kaart.
// De fill-breedte via inline style is veilig: value wordt tot een getal gedwongen.
function miniBar(value, type, icon) {
  const v = Number(value);
  const pct = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  const label = Number.isFinite(v) ? `${Math.round(v)}%` : '—';
  return `
  <div class="mini-bar ${type}" role="img" aria-label="${esc(type)} ${esc(label)}">
    <div class="mini-bar-fill" style="width: ${pct.toFixed(0)}%"></div>
    <span class="mini-bar-label">${icon} ${esc(label)}</span>
  </div>`;
}

function dayCard(d) {
  const date = parseWeerliveDate(d.dag);
  const dayLabel = date ? formatDayShort(date) : esc(d.dag || '');
  const dateLabel = date ? formatDateShort(date) : '';
  const icon = getIcon(d.image);
  const tmax = Number.isFinite(Number(d.max_temp)) ? `${Math.round(Number(d.max_temp))}°` : '—';
  const tmin = Number.isFinite(Number(d.min_temp)) ? `${Math.round(Number(d.min_temp))}°` : '—';
  const windArrow = renderWindArrowCompact(d.windrgr, 22);
  const bft = Number.isFinite(Number(d.windbft)) ? `${d.windbft}` : '';
  const dir = d.windr || '';
  // Temperatuurtint: warm (>22°), koud (<8°), neutraal
  const maxT = Number(d.max_temp);
  const tempClass = Number.isFinite(maxT) ? (maxT >= 22 ? 'warm' : maxT <= 8 ? 'cold' : 'neutral') : 'neutral';

  return `
  <div class="forecast-day" data-temp-class="${tempClass}">
    <div class="day-head">
      <span class="day-name">${esc(dayLabel)}</span>
      <span class="day-date">${esc(dateLabel)}</span>
    </div>
    <span class="day-icon">${icon}</span>
    <div class="day-temps">
      <span class="tmax">${esc(tmax)}</span>
      <span class="tsep">/</span>
      <span class="tmin">${esc(tmin)}</span>
    </div>
    <div class="day-wind">
      <span class="day-wind-arrow">${windArrow}</span>
      <span class="day-wind-label">${esc(dir)} ${esc(bft)}</span>
    </div>
    ${miniBar(d.neersl_perc_dag, 'rain', '☂')}
    ${miniBar(d.zond_perc_dag, 'sun', '☀')}
  </div>`;
}

// Compacte visualisatie van de temperatuurband per dag:
// verticale staafjes die met hun positie op de Y-as aangeven waar het dagbereik
// (min..max) ligt tov. de hele week. Zo zie je in één oogopslag welke dag
// warmer/kouder is dan de andere.
function renderTempRibbon(days) {
  const valid = days.filter(
    (d) => Number.isFinite(Number(d.min_temp)) && Number.isFinite(Number(d.max_temp))
  );
  if (valid.length === 0) return '';

  const allValues = valid.flatMap((d) => [Number(d.min_temp), Number(d.max_temp)]);
  let lo = Math.min(...allValues);
  let hi = Math.max(...allValues);
  if (lo === hi) {
    lo -= 2;
    hi += 2;
  }
  const span = hi - lo;

  const width = 420;
  const height = 110;
  const padX = 22;
  const padY = 22;
  const innerH = height - padY * 2;
  const barW = 18;
  const cols = valid.length;
  const step = (width - padX * 2) / Math.max(cols - 1, 1);

  const yOf = (v) => padY + innerH - ((v - lo) / span) * innerH;

  const bars = valid
    .map((d, i) => {
      const cx = padX + i * step;
      const yMax = yOf(Number(d.max_temp));
      const yMin = yOf(Number(d.min_temp));
      const date = parseWeerliveDate(d.dag);
      const label = date ? formatDayShort(date) : '';
      return `
      <g>
        <rect x="${(cx - barW / 2).toFixed(1)}" y="${yMax.toFixed(1)}"
              width="${barW}" height="${(yMin - yMax).toFixed(1)}"
              rx="${(barW / 2).toFixed(1)}"
              fill="url(#rangeGrad)" opacity="0.9"/>
        <circle cx="${cx.toFixed(1)}" cy="${yMax.toFixed(1)}" r="3.5" fill="#ffb454"/>
        <circle cx="${cx.toFixed(1)}" cy="${yMin.toFixed(1)}" r="3.5" fill="#7aa8ff"/>
        <text x="${cx.toFixed(1)}" y="${(yMax - 6).toFixed(1)}"
              fill="#ffb454" font-size="10" text-anchor="middle"
              font-family="sans-serif" font-weight="500">${Math.round(Number(d.max_temp))}°</text>
        <text x="${cx.toFixed(1)}" y="${(yMin + 12).toFixed(1)}"
              fill="#7aa8ff" font-size="9" text-anchor="middle"
              font-family="sans-serif">${Math.round(Number(d.min_temp))}°</text>
        <text x="${cx.toFixed(1)}" y="${(height - 3).toFixed(1)}"
              fill="#8a93a6" font-size="9" text-anchor="middle"
              font-family="sans-serif">${esc(label)}</text>
      </g>`;
    })
    .join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="temp-ribbon">
    <defs>
      <linearGradient id="rangeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffb454" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#7aa8ff" stop-opacity="0.7"/>
      </linearGradient>
    </defs>
    ${bars}
  </svg>`;
}

export function renderForecast(data) {
  const days = Array.isArray(data?.dagverwachting) ? data.dagverwachting.slice(0, 5) : [];
  if (days.length === 0) {
    return `<div class="state-msg">Geen verwachting beschikbaar</div>`;
  }

  const cards = days.map(dayCard).join('');

  // Week-highlights: warmste dag, natste dag, zonnigste dag.
  // Zo voegen we informatie toe die niet al één-op-één in de kaarten staat.
  const warmest = findExtreme(days, 'max_temp', 'max');
  const coldest = findExtreme(days, 'min_temp', 'min');
  const wettest = findExtreme(days, 'neersl_perc_dag', 'max');
  const sunniest = findExtreme(days, 'zond_perc_dag', 'max');

  const highlightCell = (label, entry, unit, icon) => {
    if (!entry) return '';
    const date = parseWeerliveDate(entry.day.dag);
    const when = date ? formatDayShort(date) : '';
    const val = `${Math.round(entry.value)}${unit}`;
    return `
    <div class="highlight">
      <span class="h-icon">${icon}</span>
      <span class="h-label">${esc(label)}</span>
      <span class="h-value">${esc(when)} · ${esc(val)}</span>
    </div>`;
  };

  const highlights = `
  <div class="week-highlights">
    ${highlightCell('Warmste', warmest, '°', '🔥')}
    ${highlightCell('Koudste nacht', coldest, '°', '❄')}
    ${highlightCell('Natste', wettest, '%', '☂')}
    ${highlightCell('Zonnigste', sunniest, '%', '☀')}
  </div>`;

  const ribbon = renderTempRibbon(days);

  return `
  <div class="forecast-main">
    <div class="temp-ribbon-wrap">${ribbon}</div>
    <div class="forecast-days">${cards}</div>
    ${highlights}
  </div>`;
}
