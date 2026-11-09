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

const N_ANGLES = 720; // 0,5° Raster
const INNER = 0.2;
const OUTER = 0.85;

export function readAnalog(frame: Frame, cal: AnalogCalibration): ReadResult {
  const { pivot, radius } = cal;
  if (!(radius > 8)) return { value: null, confidence: 0 };
  const r0 = Math.max(4, radius * INNER);
  const r1 = radius * OUTER;
  const mean = new Float64Array(N_ANGLES);
  const all: number[] = [];
  for (let k = 0; k < N_ANGLES; k++) {
    const a = (k / N_ANGLES) * TAU - Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    let sum = 0, n = 0;
    for (let r = r0; r <= r1; r += 1) {
      const x = Math.round(pivot.x + c * r), y = Math.round(pivot.y + s * r);
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
      sum += luminance(frame, x, y);
      n++;
    }
    mean[k] = n > 0 ? sum / n : NaN;
    if (n > 0) all.push(mean[k]);
  }
  if (all.length < N_ANGLES / 2) return { value: null, confidence: 0 };
  const sorted = [...all].sort((a, b) => a - b);
  const bg = sorted[sorted.length >> 1];
  const sign = cal.pointerDark ? -1 : 1;
  const raw = Array.from(mean, (m) => (Number.isNaN(m) ? 0 : (sign * (m - bg)) / 255));
  // 3-Punkt-Glättung (zyklisch)
  const score = raw.map((_, k) => (raw[(k + N_ANGLES - 1) % N_ANGLES] + raw[k] + raw[(k + 1) % N_ANGLES]) / 3);
  let p = 0;
  for (let k = 1; k < N_ANGLES; k++) if (score[k] > score[p]) p = k;
  const peak = score[p];
  // Schwerpunkt um den Peak (±3°)
  let wSum = 0, aSum = 0;
  for (let d = -6; d <= 6; d++) {
    const w = Math.max(0, score[(p + d + N_ANGLES) % N_ANGLES] - peak * 0.5);
    wSum += w;
    aSum += w * d;
  }
  const kRef = p + (wSum > 0 ? aSum / wSum : 0);
  const theta = (kRef / N_ANGLES) * TAU - Math.PI;
  const med = [...score].sort((a, b) => a - b)[N_ANGLES >> 1];
  let confidence = Math.max(0, Math.min(1, (peak - med) / 0.3));
  // auf 1/1000 der Skalenspanne runden (Ablesegenauigkeit, vermeidet Pseudo-Genauigkeit im Export)
  const decimals = Math.max(0, 3 - Math.ceil(Math.log10(Math.abs(cal.v2 - cal.v1) || 1)));
  const value = Number(angleToValue(cal, theta).toFixed(Math.min(decimals, 8)));
  // außerhalb des Skalenbereichs (+15 %) → unsicherer
  const t = (value - cal.v1) / (cal.v2 - cal.v1);
  if (t < -0.15 || t > 1.15) confidence *= 0.5;
  return { value, confidence };
}
