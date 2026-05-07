// Maan-positie berekeningen voor Eindhoven (51.4416°N, 5.4697°O).
// Vereenvoudigde Meeus-algoritmes, ~1-2 min nauwkeurig — voldoende voor UI.

const LAT = 51.4416;
const LON = 5.4697;
const DEG = Math.PI / 180;

function daysSinceJ2000(date) {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
}

function moonEquatorial(d) {
  const L = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.229350 * d) * DEG;
  const lon = L + 6.289 * DEG * Math.sin(M);
  const lat = 5.128 * DEG * Math.sin(F);
  const eps = 23.4397 * DEG;
  const ra = Math.atan2(
    Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps),
    Math.cos(lon),
  );
  const dec = Math.asin(
    Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon),
  );
  return { ra, dec };
}

function siderealTime(d, lonDeg) {
  return (280.16 + 360.9856235 * d) * DEG + lonDeg * DEG;
}

export function moonAltitude(date, lat = LAT, lon = LON) {
  const d = daysSinceJ2000(date);
  const { ra, dec } = moonEquatorial(d);
  const ha = siderealTime(d, lon) - ra;
  const latR = lat * DEG;
  return Math.asin(
    Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha),
  );
}

// Zoek nul-doorgangen van de maan-altitude in een venster van -24u..+24u rond now.
// Levert de relevante rise/set en een progress t (0..1) als de maan nu boven horizon is.
export function moonProgress(now = new Date(), lat = LAT, lon = LON) {
  const currentAlt = moonAltitude(now, lat, lon);
  const isUp = currentAlt > 0;

  const stepMs = 10 * 60 * 1000;
  const steps = (48 * 60) / 10;
  const startMs = now.getTime() - 24 * 60 * 60 * 1000;

  const crossings = [];
  let prevAlt = moonAltitude(new Date(startMs), lat, lon);
  for (let i = 1; i <= steps; i++) {
    const tMs = startMs + i * stepMs;
    const alt = moonAltitude(new Date(tMs), lat, lon);
    if (prevAlt < 0 && alt >= 0) {
      const frac = -prevAlt / (alt - prevAlt);
      crossings.push({ time: new Date(tMs - stepMs + frac * stepMs), type: 'rise' });
    } else if (prevAlt >= 0 && alt < 0) {
      const frac = prevAlt / (prevAlt - alt);
      crossings.push({ time: new Date(tMs - stepMs + frac * stepMs), type: 'set' });
    }
    prevAlt = alt;
  }

  let rise = null;
  let set = null;
  if (isUp) {
    for (const c of crossings) {
      if (c.type === 'rise' && c.time <= now && (!rise || c.time > rise)) rise = c.time;
    }
    for (const c of crossings) {
      if (c.type === 'set' && c.time >= now && (!set || c.time < set)) set = c.time;
    }
  } else {
    const nextRise = crossings.find((c) => c.type === 'rise' && c.time >= now);
    if (nextRise) {
      rise = nextRise.time;
      const nextSet = crossings.find((c) => c.type === 'set' && c.time > rise);
      if (nextSet) set = nextSet.time;
    }
  }

  let t = 0;
  if (isUp && rise && set && set > rise) {
    t = (now.getTime() - rise.getTime()) / (set.getTime() - rise.getTime());
    t = Math.max(0, Math.min(1, t));
  }

  return { rise, set, t, isUp, altitude: currentAlt };
}
