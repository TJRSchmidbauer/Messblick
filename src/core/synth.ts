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
