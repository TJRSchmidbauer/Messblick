import type { Frame, Point, ReadResult } from '../core/types';
import { luminance } from '../core/types';

export interface AnalogCalibration {
  type: 'analog';
  pivot: Point;
  /** Länge des Zeigers in Pixeln (Abtastradius). */
  radius: number;
  /** Winkel (rad, Bildkoordinaten) und Wert der beiden Referenzstriche. */
  a1: number;
  v1: number;
  a2: number;
  v2: number;
  /** Vorzeichenbehafteter Überstreichwinkel von a1 nach a2 (rad). */
  sweep: number;
  /** true: Zeiger dunkler als Hintergrund (Standard). */
  pointerDark: boolean;
}

export interface AnalogRaw {
  pivot: Point;
  /** Dritter Skalenpunkt, nur bei verdecktem Drehpunkt (der Drehpunkt wird dann daraus berechnet). */
  p3?: Point;
  p1: Point;
  v1: number;
  p2: Point;
  v2: number;
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => {
  const m = ((a % TAU) + TAU) % TAU;
  return m > Math.PI ? m - TAU : m;
};

export const angleOf = (pivot: Point, p: Point): number => Math.atan2(p.y - pivot.y, p.x - pivot.x);

/**
 * Drehpunkt aus drei Punkten auf der Skala (Mittelpunkt des Kreises durch sie). Für Geräte, bei denen der Drehpunkt
 * hinter dem Gehäuse liegt (z. B. Demo-Multimeter). null, wenn die Punkte fast auf einer Geraden liegen.
 */
export function pivotFromScale(a: Point, b: Point, c: Point): Point | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const span = Math.max(Math.hypot(a.x - c.x, a.y - c.y), Math.hypot(a.x - b.x, a.y - b.y), 1);
  if (Math.abs(d) < 1e-3 * span * span) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const p = { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d };
  // ein „Drehpunkt“ weit außerhalb (fast gerade Punkte) ist unbrauchbar
  return Math.hypot(p.x - a.x, p.y - a.y) > 20 * span ? null : p;
}

/**
 * Passt der angeklickte Drehpunkt zu den Skalenstrichen? Beide Striche liegen auf demselben Kreis um den Drehpunkt;
 * weichen ihre Abstände deutlich voneinander ab, ist der Drehpunkt vermutlich falsch gesetzt (oft: verdeckt).
 * Liefert die relative Abweichung (0 = perfekt).
 */
export function pivotMismatch(raw: AnalogRaw): number {
  const d1 = Math.hypot(raw.p1.x - raw.pivot.x, raw.p1.y - raw.pivot.y), d2 = Math.hypot(raw.p2.x - raw.pivot.x, raw.p2.y - raw.pivot.y);
  return Math.abs(d1 - d2) / Math.max(d1, d2, 1);
}

/** Baut die Kalibrierung aus drei Klicks. `bigArc`: Skala überstreicht mehr als 180°. */
export function buildAnalogCalibration(raw: AnalogRaw, bigArc: boolean, pointerDark = true): AnalogCalibration {
  const a1 = angleOf(raw.pivot, raw.p1);
  const a2 = angleOf(raw.pivot, raw.p2);
  let sweep = wrap(a2 - a1);
  if (bigArc) sweep = sweep > 0 ? sweep - TAU : sweep + TAU;
  const radius = Math.min(
    Math.hypot(raw.p1.x - raw.pivot.x, raw.p1.y - raw.pivot.y),
    Math.hypot(raw.p2.x - raw.pivot.x, raw.p2.y - raw.pivot.y),
  );
  return { type: 'analog', pivot: raw.pivot, radius, a1, v1: raw.v1, a2, v2: raw.v2, sweep, pointerDark };
}

/** Linearer Zusammenhang Winkel → Wert; Winkel außerhalb der Skala werden fortgesetzt. */
export function angleToValue(cal: AnalogCalibration, theta: number): number {
  const mid = cal.a1 + cal.sweep / 2;
  const t = 0.5 + wrap(theta - mid) / cal.sweep;
  return cal.v1 + (cal.v2 - cal.v1) * t;
}

const STEP = Math.PI / 720; // 0,25° Raster
const INNER = 0.2;
const OUTER = 0.85;
/** Halbe Breite des Fensters für den örtlichen Hintergrund (rad): breiter als ein Zeiger, schmaler als Gehäuse oder Schatten. */
const BASE_HALF = (8 * Math.PI) / 180;

/**
 * Sucht den Zeiger und liefert seinen Winkel samt Sicherheit. Robust gegen echte Geräte:
 * - gesucht wird nur im kalibrierten Skalenbereich (mit Rand), nicht im ganzen Kreis: Gehäuse, Drehpunkt-Abdeckung
 *   und Beschriftung außerhalb der Skala können den Zeiger nicht mehr verdrängen;
 * - jede Kreisbahn wird gegen ihren örtlichen Hintergrund (±8°) verglichen: breite dunkle Flächen, Lichtverläufe und
 *   der Skalenbogen selbst fallen heraus, ein dünner Zeiger bleibt;
 * - je Winkel zählt der Median über alle Radien: Ein Zeiger ist auf ganzer Länge dunkel, eine Ziffer oder ein Schild
 *   nur auf einem Teil davon.
 */
export function findNeedle(frame: Frame, cal: Pick<AnalogCalibration, 'pivot' | 'radius' | 'a1' | 'sweep' | 'pointerDark'>): { theta: number; confidence: number } | null {
  const { pivot, radius } = cal;
  if (!(radius > 8)) return null;
  const r0 = Math.max(4, radius * INNER), r1 = radius * OUTER;
  const margin = Math.max((5 * Math.PI) / 180, Math.abs(cal.sweep) * 0.12);
  const dir = Math.sign(cal.sweep) || 1;
  const start = cal.a1 - dir * margin;
  const span = Math.abs(cal.sweep) + 2 * margin;
  const half = Math.round(BASE_HALF / STEP);
  // Winkel des Suchfensters plus Rand für den Hintergrund
  const nWin = Math.round(span / STEP) + 1;
  const nAll = nWin + 2 * half;
  const angle = (k: number): number => start + dir * (k - half) * STEP;
  const radii: number[] = [];
  for (let r = r0; r <= r1; r += 1) radii.push(r);
  const nr = radii.length;
  if (nr < 4) return null;
  // Helligkeit je (Radius, Winkel); außerhalb des Bildes NaN
  const lum = new Float32Array(nr * nAll);
  const cs = Array.from({ length: nAll }, (_, k) => [Math.cos(angle(k)), Math.sin(angle(k))]);
  let inside = 0;
  for (let j = 0; j < nr; j++) {
    const r = radii[j];
    for (let k = 0; k < nAll; k++) {
      const x = Math.round(pivot.x + cs[k][0] * r), y = Math.round(pivot.y + cs[k][1] * r);
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) { lum[j * nAll + k] = NaN; continue; }
      lum[j * nAll + k] = luminance(frame, x, y);
      inside++;
    }
  }
  if (inside < (nr * nAll) / 2) return null;
  const sign = cal.pointerDark ? -1 : 1;
  // Kontrast gegen den örtlichen Hintergrund je Kreisbahn (gleitender Mittelwert über ±8° per Präfixsumme)
  const score = new Float64Array(nWin);
  const col = new Float64Array(nr);
  const pre = new Float64Array(nAll + 1), cnt = new Float64Array(nAll + 1);
  const contrast = new Float32Array(nr * nWin);
  for (let j = 0; j < nr; j++) {
    for (let k = 0; k < nAll; k++) {
      const v = lum[j * nAll + k];
      pre[k + 1] = pre[k] + (Number.isNaN(v) ? 0 : v);
      cnt[k + 1] = cnt[k] + (Number.isNaN(v) ? 0 : 1);
    }
    for (let w = 0; w < nWin; w++) {
      const k = w + half, v = lum[j * nAll + k];
      const n = cnt[k + half + 1] - cnt[k - half];
      contrast[j * nWin + w] = Number.isNaN(v) || n < half ? 0 : (sign * (v - (pre[k + half + 1] - pre[k - half]) / n)) / 255;
    }
  }
  for (let w = 0; w < nWin; w++) {
    for (let j = 0; j < nr; j++) col[j] = contrast[j * nWin + w];
    col.sort();
    score[w] = col[nr >> 1]; // Median über die Radien
  }
  // leichte Glättung (Zeiger sind ein bis wenige Zehntelgrad breit)
  const sm = Float64Array.from(score, (_, w) => (score[Math.max(0, w - 1)] + 2 * score[w] + score[Math.min(nWin - 1, w + 1)]) / 4);
  let p = 0;
  for (let w = 1; w < nWin; w++) if (sm[w] > sm[p]) p = w;
  const peak = sm[p];
  if (!(peak > 0)) return { theta: angle(p + half), confidence: 0 };
  let wSum = 0, aSum = 0;
  for (let d = -8; d <= 8; d++) {
    const q = p + d;
    if (q < 0 || q >= nWin) continue;
    const wt = Math.max(0, sm[q] - peak * 0.5);
    wSum += wt; aSum += wt * d;
  }
  const kRef = p + (wSum > 0 ? aSum / wSum : 0);
  const theta = start + dir * kRef * STEP;
  // Sicherheit: Abstand zum zweitbesten Kandidaten außerhalb von ±4°, bezogen auf einen deutlichen Zeigerkontrast
  let second = 0;
  const excl = Math.round((4 * Math.PI) / 180 / STEP);
  for (let w = 0; w < nWin; w++) if (Math.abs(w - p) > excl && sm[w] > second) second = sm[w];
  const strength = Math.min(1, peak / 0.15);
  const separation = Math.min(1, (peak - second) / Math.max(1e-6, peak) * 2);
  return { theta, confidence: Math.max(0, Math.min(1, strength * (0.4 + 0.6 * separation))) };
}

export function readAnalog(frame: Frame, cal: AnalogCalibration): ReadResult {
  const n = findNeedle(frame, cal);
  if (!n) return { value: null, confidence: 0 };
  let confidence = n.confidence;
  // auf 1/1000 der Skalenspanne runden (Ablesegenauigkeit, vermeidet Pseudo-Genauigkeit im Export)
  const decimals = Math.max(0, 3 - Math.ceil(Math.log10(Math.abs(cal.v2 - cal.v1) || 1)));
  const value = Number(angleToValue(cal, n.theta).toFixed(Math.min(decimals, 8)));
  // knapp außerhalb des Skalenbereichs → unsicherer
  const t = (value - cal.v1) / (cal.v2 - cal.v1);
  if (t < -0.05 || t > 1.05) confidence *= 0.5;
  return { value, confidence };
}

/**
 * Welcher Bogen ist die Skala? Mit zwei Skalenpunkten ist das nicht eindeutig (kurzer oder langer Weg herum).
 * Entscheidet nach dem Zeiger im aktuellen Bild: Liegt er deutlich nur auf dem langen Bogen, ist die Skala größer als 180°.
 * Sonst (auch wenn der Zeiger auf einem Skalenpunkt ruht) gilt der kurze Bogen, wie bei den meisten Messgeräten.
 */
export function guessBigArc(frame: Frame, raw: AnalogRaw, pointerDark = true): boolean {
  const small = buildAnalogCalibration(raw, false, pointerDark), big = buildAnalogCalibration(raw, true, pointerDark);
  const nS = findNeedle(frame, small), nB = findNeedle(frame, big);
  if (!nB || nB.confidence < 0.3) return false;
  // Zeiger im Inneren des langen Bogens (nicht im Randbereich nahe den Skalenpunkten)?
  const t = (angleToValue(big, nB.theta) - big.v1) / (big.v2 - big.v1);
  const insideBig = t > 0.03 && t < 0.97;
  const tS = nS ? (angleToValue(small, nS.theta) - small.v1) / (small.v2 - small.v1) : -1;
  const insideSmall = !!nS && nS.confidence >= 0.3 && tS > 0.03 && tS < 0.97;
  if (insideBig && !insideSmall) return true;
  if (insideBig && insideSmall) return nB.confidence > nS!.confidence * 1.3;
  return false;
}
