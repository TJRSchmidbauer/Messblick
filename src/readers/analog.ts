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
  /** true: roter Zeiger (Farbe statt Helligkeit): schwarze Beschriftung, Skalenstriche und Schrauben stören dann nicht. Hat Vorrang vor pointerDark. */
  pointerRed?: boolean;
  /** Drehpunkt verdeckt: Der Zeiger ist nur im äußeren Teil sichtbar (der innere liegt hinter der Frontplatte), die Suche beschränkt sich darauf. */
  hidden?: boolean;
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
export function buildAnalogCalibration(raw: AnalogRaw, bigArc: boolean, pointerDark = true, pointerRed = false, hidden = false): AnalogCalibration {
  const a1 = angleOf(raw.pivot, raw.p1);
  const a2 = angleOf(raw.pivot, raw.p2);
  let sweep = wrap(a2 - a1);
  if (bigArc) sweep = sweep > 0 ? sweep - TAU : sweep + TAU;
  const radius = Math.min(
    Math.hypot(raw.p1.x - raw.pivot.x, raw.p1.y - raw.pivot.y),
    Math.hypot(raw.p2.x - raw.pivot.x, raw.p2.y - raw.pivot.y),
  );
  return { type: 'analog', pivot: raw.pivot, radius, a1, v1: raw.v1, a2, v2: raw.v2, sweep, pointerDark, ...(pointerRed ? { pointerRed: true } : {}), ...(hidden ? { hidden: true } : {}) };
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
/** Rotanteil eines Bildpunkts (0 bis 255): Rot über dem Mittel von Grün und Blau. Schwarz, Weiß und Grau ergeben 0. */
const redness = (f: Frame, x: number, y: number): number => {
  const i = (y * f.width + x) * 4;
  return Math.max(0, f.data[i] - 0.5 * (f.data[i + 1] + f.data[i + 2]));
};

export function findNeedle(frame: Frame, cal: Pick<AnalogCalibration, 'pivot' | 'radius' | 'a1' | 'sweep' | 'pointerDark' | 'pointerRed' | 'hidden'>): { theta: number; confidence: number } | null {
  const { pivot, radius } = cal;
  if (!(radius > 8)) return null;
  // Oft ist nur der äußere Teil des Zeigers zu sehen (Drehpunkt verdeckt, Linse oder Frontplatte vor der Nabe): Dann nur dort suchen.
  // Rote Zeiger dürfen bis an die Skala reichen (Skalenstriche sind nicht rot) und werden ab halber Länge gesucht.
  const r0 = Math.max(4, radius * (cal.pointerRed ? 0.5 : cal.hidden ? 0.55 : INNER)), r1 = radius * (cal.pointerRed ? 0.98 : OUTER);
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
      lum[j * nAll + k] = cal.pointerRed ? redness(frame, x, y) : luminance(frame, x, y);
      inside++;
    }
  }
  if (inside < (nr * nAll) / 2) return null;
  const sign = cal.pointerRed || !cal.pointerDark ? 1 : -1;
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
export function guessBigArc(frame: Frame, raw: AnalogRaw, pointerDark = true, pointerRed = false, hidden = false): boolean {
  const small = buildAnalogCalibration(raw, false, pointerDark, pointerRed, hidden), big = buildAnalogCalibration(raw, true, pointerDark, pointerRed, hidden);
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

/**
 * Hat das Instrument einen roten Zeiger? Dann liest die App nach Farbe: Sie sucht den Zeiger im Skalenbereich nur nach Rot
 * (schwarze Buchstaben wie „A“ oder „V“ auf dem Skalenblatt, Skalenstriche und Schrauben haben kein Rot). Ein roter, dünner,
 * von der Umgebung klar abgesetzter Strich im Skalenbereich spricht dafür.
 */
export function guessRedPointer(frame: Frame, cal: AnalogCalibration): boolean {
  const n = findNeedle(frame, { ...cal, pointerRed: true });
  return !!n && n.confidence >= 0.6;
}

/* ------------------------- Drehpunkt aus den Zeigerlinien im Video ------------------------- */

export interface NeedleLine {
  /** Ein Punkt der Geraden (Mittelwert der roten Bildpunkte) und ihre Richtung (Einheitsvektor, nach oben zeigend). */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  /** Anzahl der roten Bildpunkte auf der Geraden. */
  n: number;
}

/**
 * Gerade durch den roten Zeiger im Bildausschnitt `box`. Rote Bildpunkte werden zu zusammenhängenden Flächen gruppiert; der
 * Zeiger ist die längste dünne Fläche (Länge zu Breite mindestens 6, Breite höchstens 3 Bildpunkte): Hände, Kabel und
 * Spiegelungen sind breiter oder kürzer. null, wenn es keine solche Fläche gibt.
 */
export function needleLineRed(frame: Frame, box: { x: number; y: number; w: number; h: number }): NeedleLine | null {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(frame.width, Math.ceil(box.x + box.w)), y1 = Math.min(frame.height, Math.ceil(box.y + box.h));
  const w = x1 - x0, h = y1 - y0;
  if (w < 5 || h < 5) return null;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (redness(frame, x0 + x, y0 + y) > 35) on[y * w + x] = 1;
  const seen = new Uint8Array(w * h);
  let best: NeedleLine | null = null, bestLen = 0;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!on[start] || seen[start]) continue;
    const px: number[] = [], py: number[] = [];
    stack.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w;
      px.push(x); py.push(y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (on[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (px.length < 15) continue;
    const cx = px.reduce((a, b) => a + b, 0) / px.length, cy = py.reduce((a, b) => a + b, 0) / py.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < px.length; i++) { const u = px[i] - cx, v = py[i] - cy; sxx += u * u; syy += v * v; sxy += u * v; }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(1e-9, tr / 2 - disc);
    const length = Math.sqrt(l1 / px.length) * 3.46, width = Math.sqrt(l2 / px.length) * 3.46; // Seitenlängen eines gleich verteilten Streifens
    if (length / Math.max(width, 0.5) < 5 || width > 8 || length < 20 || length <= bestLen) continue;
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    if (Math.abs(Math.sin(ang)) < 0.5) continue; // Zeiger steht nicht waagrecht (Arme, Kabel, Tischkanten)
    let dx = Math.cos(ang), dy = Math.sin(ang);
    if (dy > 0) { dx = -dx; dy = -dy; }
    best = { cx: x0 + cx, cy: y0 + cy, dx, dy, n: px.length };
    bestLen = length;
  }
  return best;
}

/**
 * Drehpunkt als Schnittpunkt der Zeigergeraden (kleinste Quadrate). Dazu muss der Zeiger über einen Winkelbereich laufen:
 * `spread` ist der Winkelbereich der Geraden in Grad; unter etwa 3° ist der Schnittpunkt unbrauchbar (fast parallele Geraden).
 */
export function pivotFromLines(lines: NeedleLine[]): { pivot: Point; spread: number; residual: number; used: number } | null {
  let use = lines;
  let out: { pivot: Point; spread: number; residual: number; used: number } | null = null;
  // Kleinste Quadrate, danach Geraden mit großem Abstand zum Schnittpunkt (Haut, Kabel, Spiegelungen) verwerfen und wiederholen
  for (let pass = 0; pass < 4 && use.length >= 3; pass++) {
    let a = 0, b = 0, c = 0, e = 0, f = 0;
    const angles: number[] = [];
    for (const l of use) {
      const nx = -l.dy, ny = l.dx, r = nx * l.cx + ny * l.cy;
      a += nx * nx; b += nx * ny; c += ny * ny; e += nx * r; f += ny * r;
      angles.push((Math.atan2(l.dy, l.dx) * 180) / Math.PI);
    }
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-9) return out;
    const pivot = { x: (c * e - b * f) / det, y: (a * f - b * e) / det };
    const dist = use.map((l) => Math.abs(-l.dy * (pivot.x - l.cx) + l.dx * (pivot.y - l.cy)));
    out = { pivot, spread: Math.max(...angles) - Math.min(...angles), residual: dist.reduce((x, y) => x + y, 0) / dist.length, used: use.length };
    const med = [...dist].sort((x, y) => x - y)[dist.length >> 1];
    const lim = Math.max(3, 2.5 * med);
    const keep = use.filter((_, i) => dist[i] <= lim);
    if (keep.length === use.length || keep.length < 3) break;
    use = keep;
  }
  return out;
}
