import type { Frame, ReadResult } from '../core/types';
import { DIGIT_SEGMENTS, DOT_FONT, SEGMENT_BOXES } from '../core/synth';
import { NO_READING, extractRoi, foregroundIsDark, otsu, textToValue, type DigitalCalibration, type LearnedGlyph } from './shared';

/**
 * Zeichenvergleich für Digitalanzeigen, die die Segmentabtastung nicht sicher liest:
 * LCD mit schwachem Kontrast oder schräger Schrift, Punktmatrix-Anzeigen (5×7), eigene Schriften.
 *
 * Ablauf: Bild → lokale Schwelle (verträgt ungleichmäßiges Licht) → je Ziffernzelle ein 12×14-Raster
 * mit Füllgraden → Abstand zu Vorlagen (eingebaut, dazu die vom Nutzer angelernten) → bestes Zeichen.
 * Kein Netz, keine Schriftdateien, keine Bibliothek: die Vorlagen entstehen beim ersten Aufruf im Speicher.
 */

export const GRID_W = 12;
export const GRID_H = 14;

/** Dezimalpunkt innerhalb der Ziffernzelle (rechts unten): beim Vergleich ausgeklammert, getrennt geprüft. */
const isDpCell = (gx: number, gy: number): boolean => (gx + 0.5) / GRID_W >= 0.8 && (gy + 0.5) / GRID_H >= 0.84;

/** Bis zu diesem Abstand (0 = gleich, 1 = nichts gemeinsam) gilt eine Zelle als lesbar. */
const MAX_DISTANCE = 0.65;
/** Mittlerer Füllgrad einer Zelle, unter dem sie als leer gilt (Bildrauschen). */
const EMPTY_BELOW = 0.015;
/** Mindestkontrast (Helligkeitsstufen zwischen hellen und dunklen Bildpunkten) für eine Ablesung. */
const MIN_CONTRAST = 15;
/** Füllgrad der Punktecke, ab dem ein Dezimalpunkt in der Zelle gilt. */
const DP_FILL = 0.3;

/* ----------------------------- Vorlagen ----------------------------- */

type Family = 'seg' | 'dot' | 'learned';
interface Template {
  ch: string;
  grid: Float32Array;
  family: Family;
}

const SUPERSAMPLE = 4;

function renderTemplate(inside: (u: number, v: number) => boolean): Float32Array {
  const g = new Float32Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      let n = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++)
        for (let sx = 0; sx < SUPERSAMPLE; sx++)
          if (inside((gx + (sx + 0.5) / SUPERSAMPLE) / GRID_W, (gy + (sy + 0.5) / SUPERSAMPLE) / GRID_H)) n++;
      g[gy * GRID_W + gx] = n / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }
  return g;
}

function segmentTemplate(ch: string, shear: number): Float32Array {
  const segs = DIGIT_SEGMENTS[ch] ?? '';
  return renderTemplate((u, v) => {
    const uu = u - shear * (0.5 - v); // schräge Schrift: oben nach rechts versetzt
    return [...segs].some((s) => {
      const [x0, y0, x1, y1] = SEGMENT_BOXES[s];
      return uu >= x0 && uu <= x1 && v >= y0 && v <= y1;
    });
  });
}

/** Form eines Punktes: Halbmesser in Punktabständen und ob rund (sonst quadratisch). */
const DOT_SHAPES: { r: number; round: boolean }[] = [
  { r: 0.45, round: true }, { r: 0.3, round: true }, { r: 0.45, round: false },
];

function dotTemplate(ch: string, gapped: boolean, shape: { r: number; round: boolean }): Float32Array {
  const rows = DOT_FONT[ch];
  const cols = gapped ? 6 : 5;
  return renderTemplate((u, v) => {
    const px = u * cols, py = v * 7;
    const c = Math.floor(px), r = Math.floor(py);
    if (c > 4 || r > 6 || rows[r][c] !== '1') return false;
    const dx = px - c - 0.5, dy = py - r - 0.5;
    return shape.round ? dx * dx + dy * dy <= shape.r * shape.r : Math.abs(dx) <= shape.r && Math.abs(dy) <= shape.r;
  });
}

let library: Template[] | null = null;
export function builtIn(): Template[] {
  if (library) return library;
  const out: Template[] = [];
  for (const ch of Object.keys(DIGIT_SEGMENTS)) {
    for (const shear of [0, 0.1, 0.2]) out.push({ ch, grid: segmentTemplate(ch, shear), family: 'seg' });
  }
  for (const ch of Object.keys(DOT_FONT)) {
    for (const gapped of [true, false]) {
      for (const shape of DOT_SHAPES) out.push({ ch, grid: dotTemplate(ch, gapped, shape), family: 'dot' });
    }
  }
  library = out;
  return out;
}

/** Angelernte Zeichen als Vorlagen; wirft nie (kaputte Einträge werden übersprungen). */
function learnedTemplates(list: LearnedGlyph[] | undefined): Template[] {
  const out: Template[] = [];
  for (const l of list ?? []) {
    if (typeof l?.ch !== 'string' || typeof l.grid !== 'string' || l.grid.length !== GRID_W * GRID_H) continue;
    const g = new Float32Array(GRID_W * GRID_H);
    let ok = true;
    for (let i = 0; i < g.length; i++) {
      const d = l.grid.charCodeAt(i) - 48;
      if (d < 0 || d > 9) { ok = false; break; }
      g[i] = d / 9;
    }
    if (ok) out.push({ ch: l.ch, grid: g, family: 'learned' });
  }
  return out;
}

/* ----------------------------- Bild → Raster ----------------------------- */

/** Vordergrundmaske mit lokaler Schwelle (Mittelwert im Fenster), damit Verlauf und Reflexe nicht stören. */
export function foregroundMask(lum: Uint8Array, w: number, h: number, fgDark: boolean): Uint8Array | null {
  // Kontrast: Abstand der Mittelwerte oberhalb und unterhalb der Otsu-Schwelle (unabhängig davon, wie viel Fläche die Zeichen füllen)
  const thr = otsu(lum);
  let hiSum = 0, hiN = 0, loSum = 0, loN = 0;
  for (const v of lum) { if (v > thr) { hiSum += v; hiN++; } else { loSum += v; loN++; } }
  const range = hiN && loN ? hiSum / hiN - loSum / loN : 0;
  if (range < MIN_CONTRAST) return null;
  const gap = Math.max(8, 0.12 * range);

  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += lum[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row;
    }
  }
  const r = Math.max(4, Math.round(h * 0.4));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const sum = integral[yb * iw + xb] - integral[ya * iw + xb] - integral[yb * iw + xa] + integral[ya * iw + xa];
      const mean = sum / ((xb - xa) * (yb - ya));
      const d = fgDark ? mean - lum[y * w + x] : lum[y * w + x] - mean;
      if (d > gap) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/**
 * Rahmen des Anzeigefensters entfernen: Eine Zeile mit einem durchgehenden Strich, der länger ist als eine Ziffer breit
 * (mehr als 1,3 Zellbreiten), und eine Spalte mit einem durchgehenden Strich über fast die ganze Höhe sind Rahmen, keine Ziffern
 * (einzelne Balken der Ziffern sind kürzer und durch Lücken getrennt).
 */
export function dropBorders(mask: Uint8Array, w: number, h: number, digits: number): Uint8Array {
  const out = Uint8Array.from(mask);
  const maxRun = 1.3 * (w / digits);
  for (let y = 0; y < h; y++) {
    let run = 0, longest = 0;
    for (let x = 0; x < w; x++) { run = mask[y * w + x] ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest > maxRun) for (let x = 0; x < w; x++) out[y * w + x] = 0;
  }
  for (let x = 0; x < w; x++) {
    let run = 0, longest = 0;
    for (let y = 0; y < h; y++) { run = mask[y * w + x] ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest >= 0.9 * h) for (let y = 0; y < h; y++) out[y * w + x] = 0;
  }
  return out;
}

/**
 * Verdrehte Anzeige geradeziehen (das Gerät liegt leicht schief im Bild): Die waagerechten Striche stehen dann in einer Zeile.
 * Gesucht wird die Steigung der Grundlinie, bei der die Zeilensummen am spitzesten sind; danach wird jede Spalte verschoben.
 */
export function deskew(mask: Uint8Array, w: number, h: number): Uint8Array {
  const half = w / 2;
  let best = 0, bestScore = -1;
  const row = new Float64Array(h);
  for (let k = -16; k <= 16; k++) {
    const s = k * 0.01; // 0,01 ≈ 0,6°
    row.fill(0);
    for (let x = 0; x < w; x++) {
      const dy = Math.round(s * (x - half));
      for (let y = 0; y < h; y++) { const yo = y + dy; if (yo >= 0 && yo < h && mask[yo * w + x]) row[y]++; }
    }
    let score = 0;
    for (let y = 0; y < h; y++) score += row[y] * row[y];
    score *= 1 - 0.0005 * Math.abs(k);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (best === 0) return mask;
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const dy = Math.round(best * (x - half));
    for (let y = 0; y < h; y++) { const yo = y + dy; if (yo >= 0 && yo < h) out[y * w + x] = mask[yo * w + x]; }
  }
  return out;
}

/**
 * Schräge Schrift (Kursivziffern vieler LCD-Multimeter) aufrichten: Die senkrechten Striche stehen dann in einer Spalte.
 * Gesucht wird die Scherung mit den spitzesten Spaltensummen; danach wird jede Zeile zurückgeschoben.
 */
export function deslant(mask: Uint8Array, w: number, h: number): Uint8Array {
  const half = h / 2;
  let best = 0, bestScore = -1;
  const col = new Float64Array(w);
  for (let k = -20; k <= 20; k++) {
    const s = k * 0.02;
    col.fill(0);
    for (let y = 0; y < h; y++) {
      const dx = Math.round(s * (half - y));
      for (let x = 0; x < w; x++) { const xo = x + dx; if (xo >= 0 && xo < w && mask[y * w + xo]) col[x]++; }
    }
    let score = 0;
    for (let x = 0; x < w; x++) score += col[x] * col[x];
    score *= 1 - 0.0005 * Math.abs(k);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (best === 0) return mask;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const dx = Math.round(best * (half - y));
    for (let x = 0; x < w; x++) { const xo = x + dx; if (xo >= 0 && xo < w) out[y * w + x] = mask[y * w + xo]; }
  }
  return out;
}

/**
 * Senkrechter Bereich, in dem die Ziffern stehen, unabhängig davon, wie weit der Ausschnitt ist. Zählt nur Spalten mit
 * langen senkrechten Strichen (Ziffern), damit Beschriftungen wie „Auto“ oder „DC“ über den Ziffern nicht mitzählen.
 */
export function inkRows(mask: Uint8Array, w: number, h: number): { top: number; bottom: number } | null {
  const col = new Uint16Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) col[x]++;
  let colMax = 0;
  for (const c of col) if (c > colMax) colMax = c;
  const strong = new Uint8Array(w);
  for (let x = 0; x < w; x++) strong[x] = col[x] >= 0.5 * colMax ? 1 : 0;
  const row = new Uint16Array(h);
  let max = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (strong[x] && mask[y * w + x]) n++;
    row[y] = n; if (n > max) max = n;
  }
  if (max < 4) return null;
  const lim = Math.max(2, max * 0.3);
  // Die Ziffern sind der zusammenhängende Zeilenblock mit der meisten Tinte; Rahmenreste oben und unten sind durch Lücken getrennt
  let top = 0, bottom = -1, bestSum = -1, y = 0;
  while (y < h) {
    if (row[y] < lim) { y++; continue; }
    let y1 = y, gap = 0, sum = 0;
    for (let k = y; k < h; k++) { if (row[k] >= lim) { y1 = k; gap = 0; sum += row[k]; } else if (++gap >= 3) break; }
    if (sum > bestSum) { bestSum = sum; top = y; bottom = y1; }
    y = y1 + 1;
  }
  if (bottom < 0) return null;
  const span = bottom + 1 - top;
  if (span < h * 0.2) return null;
  // Die senkrechten Striche (b, c, e, f) füllen etwa 18 % bis 82 % der Ziffernhöhe; die waagerechten Balken oben und unten kommen dazu
  return { top: Math.max(0, Math.round(top - 0.25 * span)), bottom: Math.min(h, Math.round(bottom + 1 + 0.25 * span)) };
}

/**
 * Ziffernzellen aus der Maske bestimmen statt den Ausschnitt starr zu teilen. 7-Segment-Ziffern haben senkrechte Striche
 * links (f, e) und rechts (b, c) in der Zelle und dazwischen Lücken an den Zellgrenzen. Gesucht werden Zellbreite und Lage
 * der rechten Kante, bei denen viel Tinte an den Strichspalten und wenig an den Grenzen liegt. Das verträgt Einheiten, Rand und
 * Dezimalpunkte neben den Ziffern, ohne dass man den Ausschnitt genau treffen muss. null, wenn nichts Passendes gefunden wird.
 */
export function digitCells(mask: Uint8Array, w: number, h: number, digits: number, rank = 0): { right: number; pitch: number } | null {
  const col = new Float64Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) col[x]++;
  const at = (x: number): number => { const i = Math.round(x); return i >= 0 && i < w ? col[i] : 0; };
  const nominal = w / digits;
  const all: { right: number; pitch: number; score: number }[] = [];
  for (let pitch = 0.55 * nominal; pitch <= 1.45 * nominal; pitch += 0.5) {
    for (let right = 0.55 * w; right <= w + 0.3 * pitch; right += 1) {
      let strokes = 0, bounds = 0;
      for (let k = 0; k < digits; k++) {
        const x0 = right - (digits - k) * pitch;
        strokes += Math.max(at(x0 + 0.14 * pitch), at(x0 + 0.17 * pitch)) + Math.max(at(x0 + 0.83 * pitch), at(x0 + 0.86 * pitch));
      }
      for (let k = 0; k <= digits; k++) {
        const xb = right - (digits - k) * pitch;
        bounds += Math.min(at(xb - 1.5), at(xb), at(xb + 1.5));
      }
      all.push({ right, pitch, score: strokes - 2 * bounds });
    }
  }
  all.sort((a, b) => b.score - a.score);
  // die besten, deutlich verschiedenen Annahmen; `rank` wählt die (rank+1)-beste
  const picks: typeof all = [];
  for (const c of all) {
    if (picks.length > rank) break;
    if (picks.every((p) => Math.abs(p.right - c.right) > 0.12 * c.pitch || Math.abs(p.pitch - c.pitch) > 0.05 * c.pitch)) picks.push(c);
  }
  const best = picks[rank];
  if (!best || best.score < digits * h * 0.25) return null;
  return { right: best.right, pitch: best.pitch };
}

/**
 * Dezimalpunkt als kleine, für sich stehende Fläche unten zwischen zwei Ziffern finden (Zusammenhangskomponenten der Maske).
 * Liefert die Mitte (x, y) oder null.
 */
export function findDot(mask: Uint8Array, w: number, h: number, y0: number, hh: number, pitch: number): { x: number; y: number }[] {
  const seen = new Uint8Array(w * h);
  const out: { x: number; y: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let minX = w, maxX = 0, minY = h, maxY = 0, n = 0;
    stack.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w;
      n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || !mask[q]) continue;
        const qx = q % w;
        if (Math.abs(qx - x) > 1) continue; // nicht über den Zeilenrand springen
        seen[q] = 1; stack.push(q);
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bh >= 0.05 * hh && bh <= 0.25 * hh && bw >= 0.05 * pitch && bw <= 0.35 * pitch && minY >= y0 + 0.78 * hh && n >= 0.4 * bw * bh) out.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  }
  return out;
}

export type CellMode = 'roi' | 'ink';

export interface Cells {
  /** Je Ziffernzelle ein 12×14-Raster mit Füllgraden. */
  grids: Float32Array[];
  /** Je Ziffernzelle: Füllgrad der Ecke rechts unten (Dezimalpunkt in der Zelle), aus den Bildpunkten. */
  dp: number[];
}

/** Zerlegt den Ausschnitt in Ziffernzellen. null, wenn er nicht lesbar ist (zu klein, zu wenig Kontrast). */
export function cellGrids(frame: Frame, cal: DigitalCalibration, mode: CellMode = 'roi', rank = 0): Cells | null {
  const px = extractRoi(frame, cal.roi, cal.digits);
  if (!px) return null;
  const { w, h, lum } = px;
  const fgDark = foregroundIsDark(lum, otsu(lum), cal.polarity);
  const raw = foregroundMask(lum, w, h, fgDark);
  if (!raw) return null;
  // 'ink': verdrehte und schräge Anzeigen aufrichten und Zellen aus den Ziffern selbst bestimmen (Ausschnitt darf großzügig sein)
  const mask = mode === 'ink' ? deslant(dropBorders(deskew(raw, w, h), w, h, cal.digits), w, h) : raw;
  const cells = mode === 'ink' ? digitCells(mask, w, h, cal.digits, rank) : null;
  if (mode === 'ink' && !cells) return null;
  const rows = mode === 'ink' ? inkRows(mask, w, h) : null;
  if (mode === 'ink' && !rows) return null;
  const cw = cells ? cells.pitch : w / cal.digits;
  const x0 = cells ? cells.right - cal.digits * cw : 0;
  const y0 = rows ? rows.top : 0, hh = rows ? rows.bottom - rows.top : h;
  const grids: Float32Array[] = [];
  const dp: number[] = [];
  let dotPositions: { x: number; y: number }[] | null = null;
  for (let i = 0; i < cal.digits; i++) {
    const g = new Float32Array(GRID_W * GRID_H);
    {
      if (mode === 'ink') {
        // Dezimalpunkt: eigene kleine Fläche unten, rechts neben einer Ziffernzelle (nicht hinter der letzten: dort steht die Einheit)
        const dots = dotPositions ??= findDot(mask, w, h, y0, hh, cw);
        const hit = dots.some((d) => i < cal.digits - 1 && d.x >= x0 + (i + 0.85) * cw && d.x <= x0 + (i + 1.3) * cw);
        dp.push(hit ? 1 : 0);
      } else {
        // Punktecke [0,80..1,0) × [0,84..1,0) der Zelle
        const xa = Math.floor(i * cw + 0.8 * cw), xb = Math.max(xa + 1, Math.floor((i + 1) * cw));
        const ya = Math.floor(0.84 * h), yb = h;
        let n = 0, c = 0;
        for (let y = ya; y < yb; y++) for (let x = xa; x < Math.min(w, xb); x++) { c++; n += mask[y * w + x]; }
        dp.push(c ? n / c : 0);
      }
    }
    for (let gy = 0; gy < GRID_H; gy++) {
      const ya = Math.floor(y0 + (gy * hh) / GRID_H), yb = Math.max(ya + 1, Math.ceil(y0 + ((gy + 1) * hh) / GRID_H));
      for (let gx = 0; gx < GRID_W; gx++) {
        const xa = Math.floor(x0 + i * cw + (gx * cw) / GRID_W);
        const xb = Math.max(xa + 1, Math.ceil(x0 + i * cw + ((gx + 1) * cw) / GRID_W));
        let n = 0, c = 0;
        for (let y = ya; y < Math.min(h, yb); y++)
          for (let x = Math.max(0, xa); x < Math.min(w, xb); x++) { c++; n += mask[y * w + x]; }
        g[gy * GRID_W + gx] = c ? n / c : 0;
      }
    }
    grids.push(g);
  }
  return { grids, dp };
}

/* ----------------------------- Vergleich ----------------------------- */

/** 0 = gleich, 1 = nichts gemeinsam. Waagerechter Versatz bis ±1 Rasterspalte wird ausgeglichen. */
function distance(a: Float32Array, b: Float32Array): number {
  let best = 1;
  for (const shift of [0, -1, 1]) {
    let diff = 0, union = 0;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (isDpCell(gx, gy)) continue;
        const sx = gx + shift;
        const va = sx >= 0 && sx < GRID_W ? a[gy * GRID_W + sx] : 0;
        const vb = b[gy * GRID_W + gx];
        diff += Math.abs(va - vb);
        union += Math.max(va, vb);
      }
    }
    const d = union === 0 ? 0 : diff / union;
    if (d < best) best = d;
  }
  return best;
}

function coverage(g: Float32Array): number {
  let s = 0, n = 0;
  for (let gy = 0; gy < GRID_H; gy++)
    for (let gx = 0; gx < GRID_W; gx++) if (!isDpCell(gx, gy)) { s += g[gy * GRID_W + gx]; n++; }
  return s / n;
}

interface CellMatch {
  ch: string;
  family: Family;
  distance: number;
  /** 0..1: Abstand zum besten Treffer und zum besten anderen Zeichen. */
  confidence: number;
}

export function matchCell(g: Float32Array, templates: Template[]): CellMatch {
  if (coverage(g) < EMPTY_BELOW) return { ch: ' ', family: 'seg', distance: 0, confidence: 1 };
  let best: Template | null = null, d1 = Infinity;
  const perChar = new Map<string, number>();
  for (const t of templates) {
    const d = distance(g, t.grid);
    if (d < (perChar.get(t.ch) ?? Infinity)) perChar.set(t.ch, d);
    if (d < d1) { d1 = d; best = t; }
  }
  if (!best || d1 > MAX_DISTANCE) return { ch: '?', family: 'seg', distance: d1, confidence: 0 };
  let d2 = 1;
  for (const [ch, d] of perChar) if (ch !== best.ch && d < d2) d2 = d;
  // Eingebaute Vorlagen treffen reale Anzeigen nur ungefähr (Abstand ~0,25); angelernte Zeichen kommen auf ~0,05
  const quality = Math.max(0, Math.min(1, 1 - d1 / 0.9));
  const margin = Math.max(0.6, Math.min(1, 0.6 + (d2 - d1) / 0.1));
  return { ch: best.ch, family: best.family, distance: d1, confidence: quality * margin };
}

function readCells(found: Cells, cal: DigitalCalibration): ReadResult {
  const cells = found.grids;
  const templates = [...learnedTemplates(cal.learned), ...builtIn()];
  let text = '';
  let dpCount = 0;
  let sum = 0, min = 1;
  for (const [i, g] of cells.entries()) {
    const m = matchCell(g, templates);
    if (m.ch === '?') return NO_READING;
    text += m.ch;
    if (m.ch === '.') dpCount++;
    // Punkt in der Zelle nur bei 7-Segment-Schrift: bei Punktmatrix läge er sonst in jeder Ziffer mit unterer Linie
    else if (m.family === 'seg' && m.ch !== ' ' && found.dp[i] > DP_FILL) { text += '.'; dpCount++; }
    sum += m.confidence;
    min = Math.min(min, m.confidence);
  }
  const value = textToValue(text, dpCount, cal.decimals);
  if (value === null) return NO_READING;
  return { value, confidence: Math.max(0, Math.min(1, 0.5 * (sum / cells.length) + 0.5 * min)) };
}

/**
 * Liest die Anzeige auf zwei Arten und nimmt das bessere Ergebnis: Ausschnitt starr in Zellen geteilt (passt, wenn der
 * Ausschnitt eng und gerade sitzt) oder aufgerichtet nach den Ziffern selbst (verdrehtes Gerät, Kursivschrift, weiter Ausschnitt).
 */
export function readGlyph(frame: Frame, cal: DigitalCalibration): ReadResult {
  // 1. 7-Segment-Schrift: aufgerichtet und nach Segmenten gelesen. Bei Misserfolg die nächstbesten Annahmen zur Zellaufteilung versuchen.
  const inks: Cells[] = [];
  for (let rank = 0; rank < 3; rank++) {
    const ink = cellGrids(frame, cal, 'ink', rank);
    if (!ink) break;
    inks.push(ink);
    const r = readCellSegments(ink, cal);
    if (r.value !== null && r.confidence >= SEGMENT_MIN_CONFIDENCE) return r;
  }
  // 2. Vorlagenvergleich (Punktmatrix, eigene Schriften, angelernte Zeichen): starr geteilter Ausschnitt oder aufgerichtete Zellen
  let best: ReadResult = NO_READING;
  const roi = cellGrids(frame, cal, 'roi');
  for (const cells of roi ? [roi, ...inks.slice(0, 1)] : inks.slice(0, 1)) {
    const r = readCells(cells, cal);
    if (r.value !== null && (best.value === null || r.confidence > best.confidence)) best = r;
  }
  return best;
}

/* ----------------------------- Segmente im aufgerichteten Raster ----------------------------- */

/** Füllgrad, ab dem ein Segment als an gilt (die Suche im Fenster füllt auch Nachbarstriche etwas auf). */
const SEG_ON = 0.55;
/** Waagerechte Segmente (a, d, g): Ein senkrechter Strich, der durch das Fenster läuft, füllt es bis etwa 0,6; echte Balken füllen über 0,8. */
const SEG_ON_HORIZONTAL = 0.62;
/** Mindestsicherheit für eine Ablesung nach Segmenten im aufgerichteten Raster (darunter: Vorlagenvergleich). */
const SEGMENT_MIN_CONFIDENCE = 0.3;
const SEGMENT_PATTERNS = new Map<string, string>(Object.entries(DIGIT_SEGMENTS).map(([ch, segs]) => [[...segs].sort().join(''), ch]));
// gängige Varianten (6/7/9 mit oder ohne Zusatzsegment)
for (const [segs, ch] of [['abcdfg', '9'], ['bcdfg', '9'], ['abcf', '7'], ['cdefg', '6']] as const) SEGMENT_PATTERNS.set([...segs].sort().join(''), ch);

/**
 * Füllgrad eines Segments im 12×14-Raster, tolerant gegen kleine Verschiebungen der Zelle: Bei waagerechten Segmenten (a, d, g)
 * zählt die beste Zeile im Fenster ±1,5 Rasterzeilen, bei senkrechten (b, c, e, f) die beste Spalte ±1,5 Rasterspalten.
 * Entlang des Segments wird nur der mittlere Teil ausgewertet (Ecken gehören den Nachbarsegmenten).
 */
function boxFill(g: Float32Array, box: [number, number, number, number]): number {
  const horizontal = box[2] - box[0] > box[3] - box[1];
  const cx = ((box[0] + box[2]) / 2) * GRID_W, cy = ((box[1] + box[3]) / 2) * GRID_H;
  let best = 0;
  if (horizontal) {
    const xa = Math.max(0, Math.round(cx - 0.25 * (box[2] - box[0]) * GRID_W)), xb = Math.min(GRID_W, Math.round(cx + 0.25 * (box[2] - box[0]) * GRID_W) + 1);
    for (let y = Math.max(0, Math.floor(cy - 1.5)); y <= Math.min(GRID_H - 1, Math.ceil(cy + 1.5)); y++) {
      let s = 0, n = 0;
      for (let x = xa; x < xb; x++) { s += g[y * GRID_W + x]; n++; }
      if (n && s / n > best) best = s / n;
    }
  } else {
    const ya = Math.max(0, Math.round(cy - 0.25 * (box[3] - box[1]) * GRID_H)), yb = Math.min(GRID_H, Math.round(cy + 0.25 * (box[3] - box[1]) * GRID_H) + 1);
    for (let x = Math.max(0, Math.floor(cx - 1.5)); x <= Math.min(GRID_W - 1, Math.ceil(cx + 1.5)); x++) {
      let s = 0, n = 0;
      for (let y = ya; y < yb; y++) { s += g[y * GRID_W + x]; n++; }
      if (n && s / n > best) best = s / n;
    }
  }
  return best;
}

/**
 * Liest die aufgerichteten Zellen nach Segmenten (7 Boxen je Ziffer) statt nach Vorlagen: unabhängig von der genauen
 * Schriftform, solange die Zelle stimmt. null, wenn eine Zelle kein bekanntes Segmentmuster ergibt.
 */
function readCellSegments(found: Cells, cal: DigitalCalibration): ReadResult {
  let text = '', dpCount = 0, marginSum = 0, marginMin = 1, n = 0;
  for (const [i, g] of found.grids.entries()) {
    if (coverage(g) < EMPTY_BELOW) { text += ' '; continue; }
    let key = '';
    for (const sg of 'abcdefg') {
      const f = boxFill(g, SEGMENT_BOXES[sg]);
      const on = sg === 'a' || sg === 'd' || sg === 'g' ? SEG_ON_HORIZONTAL : SEG_ON;
      const m = Math.min(1, Math.abs(f - on) / on);
      marginSum += m; marginMin = Math.min(marginMin, m); n++;
      if (f > on) key += sg;
    }
    const ch = SEGMENT_PATTERNS.get([...key].sort().join(''));
    if (ch === undefined) return NO_READING;
    text += ch;
    if (found.dp[i] > DP_FILL) { text += '.'; dpCount++; }
  }
  const value = textToValue(text, dpCount, cal.decimals);
  if (value === null || n === 0) return NO_READING;
  return { value, confidence: Math.max(0, Math.min(1, 0.5 * (marginSum / n) + 0.5 * marginMin)) };
}


/* ----------------------------- Anlernen ----------------------------- */

const MAX_LEARNED_PER_CHAR = 4;

export type LearnOutcome = { ok: true; learned: LearnedGlyph[]; added: number } | { ok: false; error: string };

/**
 * Lernt die Zeichen des aktuellen Bildes an. `shown` ist der Text, den das Gerät jetzt anzeigt, z. B. "12.34" oder "  7.8".
 * Passt die Zeichenzahl zur Ziffernzahl, steht jedes Zeichen für eine Zelle (auch '.' bei Punktmatrix).
 * Steht ein Punkt in der Zelle (7-Segment), zählen die Zeichen ohne Punkte; der Punkt selbst wird nicht angelernt.
 */
export function learnGlyphs(frame: Frame, cal: DigitalCalibration, shown: string): LearnOutcome {
  const text = shown.replace(/,/g, '.').replace(/[^0-9.\- ]/g, '');
  if (text.trim() === '') return { ok: false, error: 'Bitte eintippen, was das Gerät gerade anzeigt, z. B. 12,34.' };
  let chars: string[];
  if (text.length === cal.digits) chars = [...text];
  else {
    const without = text.replace(/\./g, '');
    if (without.length > cal.digits) return { ok: false, error: `Das sind mehr Zeichen als Ziffern (${cal.digits}). Ziffernzahl prüfen.` };
    chars = [...without.padStart(cal.digits, ' ')];
  }
  const cells = cellGrids(frame, cal)?.grids;
  if (!cells) return { ok: false, error: 'Der Ausschnitt ist nicht lesbar (zu klein oder zu wenig Kontrast).' };
  const learned = [...(cal.learned ?? [])];
  let added = 0;
  chars.forEach((ch, i) => {
    if (ch === ' ' || !(ch in DOT_FONT)) return;
    let grid = '';
    for (const v of cells[i]) grid += String(Math.max(0, Math.min(9, Math.round(v * 9))));
    learned.push({ ch, grid });
    added++;
    const same = learned.filter((l) => l.ch === ch);
    if (same.length > MAX_LEARNED_PER_CHAR) learned.splice(learned.indexOf(same[0]), 1);
  });
  if (added === 0) return { ok: false, error: 'Kein Zeichen zum Anlernen gefunden.' };
  return { ok: true, learned, added };
}
