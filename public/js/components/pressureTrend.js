// Druktrend-indicator. Berekent de drukverschil over de laatste 3 uur
// uit history data.

export function computePressureTrend(currentPressure, hourlyEntries = []) {
  const now = Date.now();
  const threeHoursAgo = now - 3 * 60 * 60 * 1000;

  // Zoek de meest recente entry van ~3 uur geleden
  const current = Number(currentPressure);
  if (!Number.isFinite(current)) {
    return { delta: 0, direction: 'stable', color: '#8a93a6', arrow: '→', label: 'stabiel' };
  }

  // Zoek entries van rond 3 uur geleden
  let oldPressure = null;
  let closestDiff = Infinity;

  for (const entry of hourlyEntries) {
    const ts = new Date(entry.ts).getTime();
    if (Number.isNaN(ts)) continue;
    const luchtd = Number(entry.luchtd);
    if (!Number.isFinite(luchtd)) continue;

    const diff = Math.abs(ts - threeHoursAgo);
    if (diff < closestDiff && ts < now) {
      closestDiff = diff;
      oldPressure = luchtd;
    }
  }

  if (oldPressure == null) {
    return { delta: 0, direction: 'stable', color: '#8a93a6', arrow: '→', label: 'stabiel' };
  }

  const delta = current - oldPressure;

  if (delta > 1) {
    return { delta, direction: 'rising', color: '#6fd598', arrow: '↗', label: 'stijgend' };
  }
  if (delta < -1) {
    return { delta, direction: 'falling', color: '#ff8c42', arrow: '↘', label: 'dalend' };
  }
  return { delta, direction: 'stable', color: '#8a93a6', arrow: '→', label: 'stabiel' };
}
