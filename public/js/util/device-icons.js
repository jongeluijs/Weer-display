// SVG-iconen per apparaattype voor de BeganeGrond-plattegrond. Alle iconen
// gebruiken `currentColor` zodat de kleur via CSS bepaald wordt (bv. groen
// voor 'aan', grijs voor offline). 24x24 viewBox; ze worden via CSS geschaald.

const ICONS = {
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 18h6"/>
    <path d="M10 21h4"/>
    <path d="M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.6 1 2.5v0h6v0c0-.9.3-1.7 1-2.5A6 6 0 0 0 12 3z"/>
  </svg>`,

  switch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="7" width="18" height="10" rx="5"/>
    <circle cx="16" cy="12" r="3" fill="currentColor"/>
  </svg>`,

  plug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 3v5"/>
    <path d="M15 3v5"/>
    <rect x="6" y="8" width="12" height="8" rx="2"/>
    <path d="M12 16v5"/>
  </svg>`,

  sensor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <path d="M5 12a7 7 0 0 1 14 0"/>
    <path d="M2 12a10 10 0 0 1 20 0"/>
  </svg>`,

  binary_sensor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="4" fill="currentColor"/>
  </svg>`,

  climate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3v12"/>
    <circle cx="12" cy="17" r="3" fill="currentColor"/>
    <path d="M9 6h6"/>
    <path d="M9 9h6"/>
  </svg>`,

  speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="3" width="12" height="18" rx="2"/>
    <circle cx="12" cy="9" r="2"/>
    <circle cx="12" cy="15" r="3" fill="currentColor"/>
  </svg>`,

  cover: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="16" height="16" rx="1"/>
    <path d="M4 8h16"/>
    <path d="M4 12h16"/>
    <path d="M4 16h16"/>
  </svg>`,

  fan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
    <path d="M12 10c0-4 2-7 4-7s2 4-2 7"/>
    <path d="M14 14c4 0 7 2 7 4s-4 2-7-2"/>
    <path d="M12 14c0 4-2 7-4 7s-2-4 2-7"/>
    <path d="M10 10c-4 0-7-2-7-4s4-2 7 2"/>
  </svg>`,

  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="11" width="14" height="10" rx="2"/>
    <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
  </svg>`,

  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="7" width="18" height="12" rx="2"/>
    <circle cx="12" cy="13" r="3.5"/>
    <path d="M9 7l1.5-2h3L15 7"/>
  </svg>`,

  hub: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <path d="M12 4v3"/>
    <path d="M12 17v3"/>
    <path d="M4 12h3"/>
    <path d="M17 12h3"/>
    <path d="M6.5 6.5l2 2"/>
    <path d="M15.5 15.5l2 2"/>
    <path d="M17.5 6.5l-2 2"/>
    <path d="M8.5 15.5l-2 2"/>
  </svg>`,

  router: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="13" width="18" height="7" rx="2"/>
    <circle cx="7" cy="16.5" r="1" fill="currentColor"/>
    <circle cx="11" cy="16.5" r="1" fill="currentColor"/>
    <path d="M7 13V9a5 5 0 0 1 10 0v4"/>
    <path d="M12 4v2"/>
  </svg>`,

  printer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="4" width="12" height="6"/>
    <rect x="4" y="10" width="16" height="8" rx="1"/>
    <rect x="7" y="14" width="10" height="6"/>
    <circle cx="17" cy="13" r="0.8" fill="currentColor"/>
  </svg>`,

  tv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="5" width="18" height="12" rx="1"/>
    <path d="M8 21h8"/>
    <path d="M12 17v4"/>
  </svg>`,

  nas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="16" height="5" rx="1"/>
    <rect x="4" y="11" width="16" height="5" rx="1"/>
    <rect x="4" y="18" width="16" height="2" rx="1"/>
    <circle cx="17" cy="6.5" r="0.8" fill="currentColor"/>
    <circle cx="17" cy="13.5" r="0.8" fill="currentColor"/>
  </svg>`,

  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="2" width="10" height="20" rx="2"/>
    <path d="M11 18h2"/>
  </svg>`,

  tablet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <path d="M11 18h2"/>
  </svg>`,

  computer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="5" width="18" height="11" rx="1"/>
    <path d="M2 19h20"/>
    <path d="M10 16l-1 3"/>
    <path d="M14 16l1 3"/>
  </svg>`,

  generic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="16" height="16" rx="3"/>
    <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
  </svg>`,
};

export function getDeviceIcon(type) {
  if (!type) return ICONS.generic;
  if (ICONS[type]) return ICONS[type];
  return ICONS.generic;
}

export function deviceTypeLabel(type) {
  const labels = {
    light: 'Lamp',
    switch: 'Schakelaar',
    plug: 'Stopcontact',
    sensor: 'Sensor',
    binary_sensor: 'Sensor',
    climate: 'Thermostaat',
    speaker: 'Speaker',
    cover: 'Rolluik',
    fan: 'Ventilator',
    lock: 'Slot',
    camera: 'Camera',
    hub: 'Hub',
    router: 'Router',
    printer: 'Printer',
    tv: 'TV',
    nas: 'NAS',
    phone: 'Telefoon',
    tablet: 'Tablet',
    computer: 'Computer',
    generic: 'Apparaat',
  };
  return labels[type] || labels.generic;
}
