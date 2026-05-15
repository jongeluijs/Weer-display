// Datum/tijd/eenheid formatters voor weergave in lokale tijd.

const DAYS_NL = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatClock(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDayShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  return DAYS_NL[d.getDay()];
}

export function formatDateShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getDate()} ${MONTHS_NL[d.getMonth()]}`;
}

export function formatTemp(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}°`;
}

export function formatNumber(value, digits = 0, unit = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}${unit}`;
}

export function formatRelative(iso) {
  if (!iso) return '—';
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  if (diff < 60_000) return 'net bijgewerkt';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return `${days} dag${days === 1 ? '' : 'en'} geleden`;
}

// Parse een Weerlive uurverwachting 'uur' string: "08-04-2026 14:00"
export function parseWeerliveHour(s) {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi));
}

// Parse een Weerlive dagverwachting 'dag' string: "08-04-2026"
export function parseWeerliveDate(s) {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
