/** Eigene SVG-Icons (24er Raster, 1.75 Strich, eine Strichstärke für alle). */
const PATHS: Record<string, string> = {
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  film: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4"/>',
  flask: '<path d="M10 4h4M11 4v5L5.5 18.5A1.5 1.5 0 0 0 6.8 21h10.4a1.5 1.5 0 0 0 1.3-2.5L13 9V4"/><path d="M8.5 15h7"/>',
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 14l4-5"/><circle cx="12" cy="14" r="1.2"/>',
  digits: '<path d="M7 8h3M7 12h3M7 16h3M7 8v8M10 8v8M14 8h3M14 12h3M14 16h3M14 8v8M17 8v8"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  record: '<circle cx="12" cy="12" r="6"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a4.5 4.5 0 0 1 0 9h-3"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  keyboard: '<rect x="3" y="7" width="18" height="11" rx="1.5"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 15h10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  layers: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
  mic: '<rect x="9" y="4" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

export function icon(name: keyof typeof PATHS | string, size = 20): string {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

/** Kanalsymbol (Form unterscheidet Geräte auch ohne Farbe). */
export const SYMBOLS = ['circle', 'triangle', 'rect', 'rectRot'] as const;
export function symbol(slot: number, size = 14): string {
  const s = SYMBOLS[slot % SYMBOLS.length];
  const shape = {
    circle: '<circle cx="8" cy="8" r="6"/>',
    triangle: '<path d="M8 1.5L15 14H1z"/>',
    rect: '<rect x="2" y="2" width="12" height="12"/>',
    rectRot: '<path d="M8 1l7 7-7 7-7-7z"/>',
  }[s];
  return `<svg class="sym" width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${shape}</svg>`;
}
