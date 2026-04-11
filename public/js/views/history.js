import { esc } from '../util/dom.js';
import { getIcon } from '../components/icons.js';
import { renderLineChart } from '../components/lineChart.js';
import { renderBarChart } from '../components/barChart.js';
import { getHistory } from '../api.js';
import { formatDateShort } from '../util/format.js';

export async function renderHistory() {
  let payload;
  try {
    payload = await getHistory('daily');
  } catch (err) {
    return `<div class="state-msg error">Historie niet beschikbaar: ${esc(err.message)}</div>`;
  }

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length === 0) {
    return `
    <div class="history-empty">
      <div>Historie wordt nog opgebouwd.</div>
      <div style="font-size:0.8em; margin-top:0.5em;">Kom later terug — de eerste dag verschijnt na middernacht.</div>
    </div>`;
  }

  // laatste 14 dagen voor de grafieken
  const last14 = entries.slice(-14);

  const tempPoints = last14.map((d) => ({
    label: formatDateShort(d.date + 'T12:00:00').replace(/\s\w+$/, (m) => m), // "5 apr"
    value: Number.isFinite(Number(d.tavg)) ? Number(d.tavg) : null,
  }));

  const rainBars = last14.map((d) => ({
    label: formatDateShort(d.date + 'T12:00:00'),
    value: Number.isFinite(Number(d.neersl_total)) ? Number(d.neersl_total) : 0,
  }));

  const tempChart = renderLineChart(tempPoints, {
    width: 400,
    height: 90,
    stroke: '#ffb454',
    fill: 'rgba(255,180,84,0.18)',
    unit: '°',
    showLabels: last14.length <= 10,
  });

  const rainChart = renderBarChart(rainBars, {
    width: 400,
    height: 90,
    color: '#7aa8ff',
    unit: 'mm',
    showLabels: last14.length <= 10,
  });

  // lijst in omgekeerde volgorde (nieuwste eerst) — max 14 zichtbaar
  const rows = entries
    .slice(-14)
    .reverse()
    .map((d) => {
      const icon = getIcon(d.image_dominant || '');
      const label = formatDateShort(d.date + 'T12:00:00');
      const tmax = Number.isFinite(Number(d.tmax)) ? `${Math.round(Number(d.tmax))}°` : '—';
      const tmin = Number.isFinite(Number(d.tmin)) ? `${Math.round(Number(d.tmin))}°` : '—';
      const rain = Number.isFinite(Number(d.neersl_total))
        ? `${Number(d.neersl_total).toFixed(1)} mm`
        : '—';
      return `
      <div class="history-row">
        <span class="h-date">${esc(label)}</span>
        <span class="h-icon">${icon}</span>
        <span class="h-samenv">${esc(d.samenv_dominant || '')}</span>
        <span class="h-temps"><span class="tmax">${esc(tmax)}</span>/<span class="tmin">${esc(tmin)}</span></span>
        <span class="h-rain">${esc(rain)}</span>
      </div>`;
    })
    .join('');

  return `
  <div class="chart-block">
    <h3>Gemiddelde temperatuur</h3>
    ${tempChart}
  </div>
  <div class="chart-block">
    <h3>Neerslag per dag</h3>
    ${rainChart}
  </div>
  <div class="history-list">${rows}</div>`;
}
