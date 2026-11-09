import type { Frame } from './types';

/** Synthetische Testbilder (Tests + Demo-Quelle). Reine Pixelarbeit, kein Canvas nötig. */

export function createFrame(width: number, height: number, gray = 255): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

export function setGray(f: Frame, x: number, y: number, gray: number): void {
  if (x < 0 || y < 0 || x >= f.width || y >= f.height) return;
  const i = (y * f.width + x) * 4;
  f.data[i] = f.data[i + 1] = f.data[i + 2] = gray;
}

export function fillRect(f: Frame, x: number, y: number, w: number, h: number, gray: number): void {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) setGray(f, xx, yy, gray);
}

export function drawLine(
  f: Frame, x0: number, y0: number, x1: number, y1: number, thickness: number, gray: number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len * 2));
  const r = thickness / 2;
  for (let s = 0; s <= steps; s++) {
    const cx = x0 + ((x1 - x0) * s) / steps;
    const cy = y0 + ((y1 - y0) * s) / steps;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
        if (dx * dx + dy * dy <= r * r) setGray(f, Math.round(cx + dx), Math.round(cy + dy), gray);
  }
}

export function fillDisc(f: Frame, cx: number, cy: number, r: number, gray: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setGray(f, x, y, gray);
}

/** Zeigerinstrument: Skalenstriche, Nabe und Zeiger im Winkel `theta` (Bildkoordinaten, y nach unten). */
export function drawAnalogDial(
  f: Frame, cx: number, cy: number, radius: number, theta: number,
  opts: { ticks?: { from: number; to: number; count: number }; pointerGray?: number } = {},
): void {
  const pg = opts.pointerGray ?? 20;
  if (opts.ticks) {
    const { from, to, count } = opts.ticks;
    for (let i = 0; i <= count; i++) {
      const a = from + ((to - from) * i) / count;
      drawLine(f, cx + Math.cos(a) * radius * 0.9, cy + Math.sin(a) * radius * 0.9,
        cx + Math.cos(a) * radius * 1.05, cy + Math.sin(a) * radius * 1.05, 2, 40);
    }
  }
  drawLine(f, cx, cy, cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius, 3, pg);
  fillDisc(f, cx, cy, 6, pg);
}

/** Segmentgeometrie (Anteile der Ziffernzelle) – gemeinsam mit dem Digital-Reader genutzt. */
export const SEGMENT_BOXES: Record<string, [number, number, number, number]> = {
  a: [0.2, 0.02, 0.8, 0.14],
  b: [0.76, 0.18, 0.96, 0.46],
  c: [0.76, 0.54, 0.96, 0.82],
  d: [0.2, 0.86, 0.8, 0.98],
  e: [0.04, 0.54, 0.24, 0.82],
  f: [0.04, 0.18, 0.24, 0.46],
  g: [0.2, 0.44, 0.8, 0.56],
};
export const DP_BOX: [number, number, number, number] = [0.84, 0.88, 0.98, 0.99];

export const DIGIT_SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': '',
};

/** Zeichnet Text wie "-12.30" als 7-Segment in n gleich breite Zellen (Punkte belegen keine Zelle). */
export function drawSevenSegment(
  f: Frame, x: number, y: number, w: number, h: number, text: string, cells: number,
  opts: { fg?: number; bg?: number } = {},
): void {
  const fg = opts.fg ?? 20;
  const bg = opts.bg ?? 235;
  fillRect(f, x, y, w, h, bg);
  const chars: { ch: string; dp: boolean }[] = [];
  for (const ch of text) {
    if (ch === '.') {
      if (chars.length) chars[chars.length - 1].dp = true;
    } else chars.push({ ch, dp: false });
  }
  while (chars.length < cells) chars.unshift({ ch: ' ', dp: false });
  const cw = w / cells;
  chars.slice(-cells).forEach(({ ch, dp }, i) => {
    const cx = x + i * cw;
    for (const s of DIGIT_SEGMENTS[ch] ?? '') {
      const [x0, y0, x1, y1] = SEGMENT_BOXES[s];
      fillRect(f, cx + x0 * cw, y + y0 * h, (x1 - x0) * cw, (y1 - y0) * h, fg);
    }
    if (dp) {
      const [x0, y0, x1, y1] = DP_BOX;
      fillRect(f, cx + x0 * cw, y + y0 * h, (x1 - x0) * cw, (y1 - y0) * h, fg);
    }
  });
}

/** 5×7-Punktmatrix wie bei gängigen Text-LCDs (HD44780-Zeichensatz, nur Zeichen für Zahlen). */
export const DOT_FONT: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Zeichnet Text als Punktmatrix: ein Zeichen je Zelle (der Punkt belegt eine eigene Zelle).
 * Punktabstand rechts 1 Spalte Lücke; `dotScale` skaliert den Punktdurchmesser (0,76 = runde Punkte mit Luft).
 */
export function drawDotMatrix(
  f: Frame, x: number, y: number, w: number, h: number, text: string, cells: number,
  opts: { fg?: number; bg?: number; dotScale?: number } = {},
): void {
  const fg = opts.fg ?? 20, bg = opts.bg ?? 235, r0 = (opts.dotScale ?? 0.76) / 2;
  fillRect(f, x, y, w, h, bg);
  const chars = [...text.padStart(cells, ' ')].slice(-cells);
  const cw = w / cells, px = cw / 6, py = h / 7;
  const r = r0 * Math.min(px, py);
  chars.forEach((ch, i) => {
    const rows = DOT_FONT[ch] ?? DOT_FONT[' '];
    rows.forEach((row, ry) => {
      for (let cx = 0; cx < 5; cx++) {
        if (row[cx] === '1') fillDisc(f, x + i * cw + (cx + 0.5) * px, y + (ry + 0.5) * py, r, fg);
      }
    });
  });
}

/** Schert einen Bildausschnitt waagerecht (schräge LCD-Schrift): oben nach rechts, um `shear` × Breite einer Zelle. */
export function shearRegion(f: Frame, x: number, y: number, w: number, h: number, shear: number, cellWidth: number, bg: number): void {
  for (let yy = 0; yy < h; yy++) {
    const shift = Math.round(shear * (0.5 - yy / h) * cellWidth);
    const row: number[] = [];
    for (let xx = 0; xx < w; xx++) row.push(f.data[((y + yy) * f.width + x + xx) * 4]);
    for (let xx = 0; xx < w; xx++) {
      const src = xx - shift;
      setGray(f, x + xx, y + yy, src >= 0 && src < w ? row[src] : bg);
    }
  }
}

/** Waagerechter Helligkeitsverlauf über dem Ausschnitt (ungleichmäßiges Licht): links −amount/2, rechts +amount/2. */
export function addGradient(f: Frame, x: number, y: number, w: number, h: number, amount: number): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const g = f.data[(yy * f.width + xx) * 4] + amount * ((xx - x) / w - 0.5);
      setGray(f, xx, yy, Math.max(0, Math.min(255, g)));
    }
}
