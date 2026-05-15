// Maanfase berekening. Gebaseerd op een vereenvoudigd lunair algoritme
// (synodische maand = 29.53059 dagen).

// Bekende nieuwe maan referentiepunt: 6 jan 2000 18:14 UTC
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
const SYNODIC_MONTH = 29.53059;

export function moonPhase(date = new Date()) {
  const diffMs = date.getTime() - KNOWN_NEW_MOON;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const cycles = diffDays / SYNODIC_MONTH;
  return cycles - Math.floor(cycles);
}

export function moonPhaseName(phase) {
  if (phase < 0.0625 || phase >= 0.9375) return 'nieuwe maan';
  if (phase < 0.1875) return 'jonge maan';
  if (phase < 0.3125) return 'eerste kwartier';
  if (phase < 0.4375) return 'wassende maan';
  if (phase < 0.5625) return 'volle maan';
  if (phase < 0.6875) return 'afnemende maan';
  if (phase < 0.8125) return 'laatste kwartier';
  return 'oude maan';
}
