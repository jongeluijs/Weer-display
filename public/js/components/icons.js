// Inline SVG iconen voor de weertypes van Weerlive. Alle SVG's gebruiken
// `currentColor` zodat de kleur via CSS geregeld kan worden.

const I = {};

I.zonnig = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <circle cx="50" cy="50" r="16" fill="currentColor" stroke="none"/>
  <g>
    <line x1="50" y1="14" x2="50" y2="24"/>
    <line x1="50" y1="76" x2="50" y2="86"/>
    <line x1="14" y1="50" x2="24" y2="50"/>
    <line x1="76" y1="50" x2="86" y2="50"/>
    <line x1="24" y1="24" x2="31" y2="31"/>
    <line x1="69" y1="69" x2="76" y2="76"/>
    <line x1="24" y1="76" x2="31" y2="69"/>
    <line x1="69" y1="31" x2="76" y2="24"/>
  </g>
</svg>`;

I.halfbewolkt = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="35" cy="35" r="13" fill="currentColor" stroke="none"/>
  <g stroke="currentColor">
    <line x1="35" y1="10" x2="35" y2="17"/>
    <line x1="10" y1="35" x2="17" y2="35"/>
    <line x1="17" y1="17" x2="22" y2="22"/>
    <line x1="53" y1="17" x2="48" y2="22"/>
  </g>
  <path d="M30 65 Q30 52 43 52 Q50 40 62 45 Q78 44 80 60 Q90 62 88 74 Q86 82 75 82 L35 82 Q22 82 22 72 Q22 64 30 65 Z" fill="currentColor" stroke="none" opacity="0.9"/>
</svg>`;

I.bewolkt = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
  <path d="M25 68 Q25 52 42 52 Q50 38 65 44 Q82 42 84 60 Q94 62 92 74 Q90 84 78 84 L30 84 Q15 84 15 72 Q15 64 25 68 Z"/>
</svg>`;

I.regen = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M25 52 Q25 36 42 36 Q50 22 65 28 Q82 26 84 44 Q94 46 92 58 Q90 68 78 68 L30 68 Q15 68 15 56 Q15 48 25 52 Z" fill="currentColor"/>
  <g stroke="#7aa8ff">
    <line x1="32" y1="76" x2="28" y2="88"/>
    <line x1="48" y1="76" x2="44" y2="88"/>
    <line x1="64" y1="76" x2="60" y2="88"/>
    <line x1="78" y1="76" x2="74" y2="88"/>
  </g>
</svg>`;

I.buien = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="28" cy="26" r="9" fill="currentColor" stroke="none"/>
  <path d="M28 52 Q28 38 44 38 Q52 26 66 32 Q82 30 84 48 Q94 50 92 62 Q90 72 78 72 L34 72 Q18 72 18 60 Q18 50 28 52 Z" fill="currentColor"/>
  <g stroke="#7aa8ff">
    <line x1="36" y1="78" x2="30" y2="92"/>
    <line x1="56" y1="78" x2="50" y2="92"/>
    <line x1="76" y1="78" x2="70" y2="92"/>
  </g>
</svg>`;

I.onweer = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M25 48 Q25 32 42 32 Q50 18 65 24 Q82 22 84 40 Q94 42 92 54 Q90 64 78 64 L30 64 Q15 64 15 52 Q15 44 25 48 Z" fill="currentColor"/>
  <polygon points="52,66 42,86 52,86 46,98 66,76 56,76 62,66" fill="#ffd24d" stroke="none"/>
</svg>`;

I.sneeuw = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M25 52 Q25 36 42 36 Q50 22 65 28 Q82 26 84 44 Q94 46 92 58 Q90 68 78 68 L30 68 Q15 68 15 56 Q15 48 25 52 Z" fill="currentColor"/>
  <g stroke="#dbe6ff" stroke-width="2">
    <line x1="30" y1="80" x2="30" y2="92"/>
    <line x1="24" y1="86" x2="36" y2="86"/>
    <line x1="50" y1="80" x2="50" y2="92"/>
    <line x1="44" y1="86" x2="56" y2="86"/>
    <line x1="70" y1="80" x2="70" y2="92"/>
    <line x1="64" y1="86" x2="76" y2="86"/>
  </g>
</svg>`;

I.mist = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
  <line x1="18" y1="35" x2="82" y2="35"/>
  <line x1="12" y1="50" x2="76" y2="50"/>
  <line x1="22" y1="65" x2="88" y2="65"/>
  <line x1="16" y1="80" x2="70" y2="80"/>
</svg>`;

I.nachtmist = I.mist;

I.wolkennacht = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M34 18 A14 14 0 1 0 46 36 A11 11 0 0 1 34 18 Z" fill="currentColor" stroke="none"/>
  <path d="M28 68 Q28 52 44 52 Q52 40 66 46 Q82 44 84 62 Q94 64 92 74 Q90 84 78 84 L32 84 Q18 84 18 72 Q18 64 28 68 Z" fill="currentColor" stroke="none" opacity="0.85"/>
</svg>`;

I.heldernacht = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
  <path d="M58 16 A34 34 0 1 0 84 58 A26 26 0 0 1 58 16 Z"/>
  <circle cx="30" cy="30" r="1.5" fill="#fff"/>
  <circle cx="22" cy="55" r="1" fill="#fff"/>
  <circle cx="40" cy="78" r="1.5" fill="#fff"/>
</svg>`;

// aliassen zoals die soms in Weerlive voorkomen
const ALIASES = {
  zon: 'zonnig',
  zonw: 'zonnig',
  halfbew: 'halfbewolkt',
  lichtbewolkt: 'halfbewolkt',
  bewolkt_bv: 'bewolkt',
  zwaarbewolkt: 'bewolkt',
  regen_bv: 'regen',
  lichtregen: 'regen',
  hagel: 'sneeuw',
  licht_sneeuw: 'sneeuw',
  nachtbew: 'wolkennacht',
  nachtmist: 'mist',
};

export function getIcon(code) {
  if (!code) return I.bewolkt;
  const key = String(code).toLowerCase();
  if (I[key]) return I[key];
  if (ALIASES[key] && I[ALIASES[key]]) return I[ALIASES[key]];
  // heuristieken op substrings
  if (key.includes('onweer')) return I.onweer;
  if (key.includes('bui')) return I.buien;
  if (key.includes('regen')) return I.regen;
  if (key.includes('sneeuw')) return I.sneeuw;
  if (key.includes('mist')) return I.mist;
  if (key.includes('nacht') && key.includes('helder')) return I.heldernacht;
  if (key.includes('nacht')) return I.wolkennacht;
  if (key.includes('half')) return I.halfbewolkt;
  if (key.includes('zon')) return I.zonnig;
  if (key.includes('bew') || key.includes('wolk')) return I.bewolkt;
  return I.bewolkt;
}
