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

// Bereken positie op een halve cirkel met straal r, gecentreerd op (cx, cy).
// angle loopt van PI (links) naar 0 (rechts) naarmate t van 0 naar 1 gaat.
export function arcPoint(cx, cy, r, t) {
  const angle = Math.PI * (1 - t);
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

// Benadering van UV-index uit globale straling (gr in W/m²).
// De Weerlive v2 API levert geen expliciete UV-index, dus schatten we
// op basis van gr. Empirisch geldt voor Nederlandse omstandigheden:
// UVI ≈ gr / 100 (piek gr ~800 W/m² → UVI ~8 in zomermaanden).
// Retourneert null als gr ontbreekt of negatief is.
export function uvFromGr(gr) {
  const v = Number(gr);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.max(0, Math.round(v / 100));
}
