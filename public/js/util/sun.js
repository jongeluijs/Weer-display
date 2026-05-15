// Zonpositie berekeningen. Input: "HH:MM" strings uit liveweer.sup / liveweer.sunder.

function parseHM(s) {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export function sunProgress(supStr, sunderStr, now = new Date()) {
  const rise = parseHM(supStr);
  const set = parseHM(sunderStr);
  if (!rise || !set) return { rise: null, set: null, t: 0, isDay: false };

  const total = set.getTime() - rise.getTime();
  if (total <= 0) return { rise, set, t: 0, isDay: false };

  const elapsed = now.getTime() - rise.getTime();
  const t = Math.max(0, Math.min(1, elapsed / total));
  const isDay = now >= rise && now <= set;
  return { rise, set, t, isDay };
}
