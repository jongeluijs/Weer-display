// Compact windpijl-icoon zonder kompas (voor forecast kaarten).
export function renderWindArrowCompact(windrgr, size = 24) {
  const deg = Number(windrgr);
  const hasWind = Number.isFinite(deg);
  const rotation = hasWind ? deg + 180 : 0;
  if (!hasWind) {
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="4" fill="#8a93a6"/></svg>`;
  }
  return `
  <svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${rotation.toFixed(1)} 50 50)">
      <path d="M 50 12 L 62 38 L 54 35 L 54 82 L 46 82 L 46 35 L 38 38 Z"
            fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
    </g>
  </svg>`;
}
