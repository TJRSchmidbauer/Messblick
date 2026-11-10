import type { Frame, Point } from '../core/types';
import { luminance } from '../core/types';

/**
 * Markerverfolgung: ein Bildausschnitt (Vorlage) wird von Bild zu Bild wiedergefunden.
 * Verfahren: normierte Kreuzkorrelation (NCC, unempfindlich gegen Helligkeit und Kontrast) in einem Suchfenster um die
 * vorhergesagte Position, ganzzahlig grob (jeder zweite Bildpunkt), dann fein und mit Parabel-Interpolation unter einem Pixel.
 * Reine Pixelarbeit ohne DOM, deshalb in Node testbar.
 */
export interface TrackTemplate {
  /** Größe der Vorlage in Bildpunkten. */
  w: number;
  h: number;
  /** Helligkeit 0..255, zeilenweise. */
  data: number[];
  /** Obere linke Ecke der Vorlage im Bild, in dem sie aufgenommen wurde. */
  x: number;
  y: number;
}

export interface TrackConfig {
  template: TrackTemplate;
  /** Ab diesem Zeitpunkt (s) wird verfolgt; davor keine Werte. Bei Livequellen 0. */
  t0: number;
  /** Meter je Bildpunkt; null = Ergebnis in Bildpunkten. */
  scale: number | null;
}

export interface TrackResult {
  /** Position in m (oder px) relativ zur Startposition, x nach rechts, y nach oben; null, wenn nicht gefunden. */
  x: number | null;
  y: number | null;
  /** Bildposition der Mitte des Markers (Bildpunkte), null, wenn nicht gefunden. */
  px: number | null;
  py: number | null;
  /** 0..1: Güte der Übereinstimmung (NCC). */
  confidence: number;
}

/** Unter dieser Übereinstimmung gilt der Marker als verloren. */
export const MIN_NCC = 0.6;
const MAX_TEMPLATE = 64;

/** Schneidet aus dem Bild eine Vorlage. null, wenn der Ausschnitt zu klein, zu groß oder ohne Kontrast ist. */
export function makeTemplate(frame: Frame, r: { x: number; y: number; w: number; h: number }): { template: TrackTemplate } | { error: string } {
  const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
  const w = Math.min(frame.width - x, Math.round(r.w)), h = Math.min(frame.height - y, Math.round(r.h));
  if (w < 8 || h < 8) return { error: 'Der Marker ist zu klein. Ziehe ein größeres Rechteck (mindestens 8 × 8 Bildpunkte).' };
  if (w > MAX_TEMPLATE || h > MAX_TEMPLATE) return { error: `Der Marker ist zu groß (höchstens ${MAX_TEMPLATE} × ${MAX_TEMPLATE} Bildpunkte). Ziehe das Rechteck enger um den Marker.` };
  const data: number[] = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) data.push(Math.round(luminance(frame, x + xx, y + yy)));
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
  if (std < 8) return { error: 'Der Marker hebt sich kaum vom Hintergrund ab. Wähle einen Marker mit mehr Kontrast (z. B. dunkle Kugel mit hellem Punkt, farbiger Klebepunkt).' };
  return { template: { w, h, data, x, y } };
}

export class Tracker {
  private last: Point | null = null; // Mitte des Markers im letzten gefundenen Bild
  private prev: Point | null = null;
  private lastT = 0;
  private origin: Point | null = null;
  private lostFrames = 0;
  private readonly sub: { dx: number[]; dy: number[]; v: number[]; n: number; norm: number };

  constructor(private readonly cfg: TrackConfig) {
    const { w, h, data } = cfg.template;
    const dx: number[] = [], dy: number[] = [], v: number[] = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { dx.push(x); dy.push(y); v.push(data[y * w + x]); }
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const zv = v.map((a) => a - mean);
    this.sub = { dx, dy, v: zv, n: zv.length, norm: Math.sqrt(zv.reduce((a, b) => a + b * b, 0)) };
    this.reset();
  }

  /** Zuletzt gefundene Mitte des Markers (Bildpunkte). */
  get position(): Point | null {
    return this.last ? { ...this.last } : null;
  }

  /** Zurück zum Start: die Suche beginnt wieder an der Stelle, an der der Marker gewählt wurde. */
  reset(): void {
    const t = this.cfg.template;
    this.last = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
    this.prev = null;
    this.origin = null;
    this.lostFrames = 0;
    this.lastT = this.cfg.t0;
  }

  /** NCC der Vorlage mit dem Bild, Vorlagen-Ecke bei (x, y); `step` 2 = jeder zweite Punkt (grob), 1 = alle (fein). */
  private ncc(g: Float32Array, fw: number, fh: number, x: number, y: number, step: 1 | 2): number {
    const { w, h, data } = this.cfg.template;
    if (x < 0 || y < 0 || x + w > fw || y + h > fh) return -1;
    let n = 0, sg = 0, sgg = 0, st = 0, stt = 0, sgt = 0;
    for (let yy = 0; yy < h; yy += step) {
      for (let xx = 0; xx < w; xx += step) {
        const gv = g[(y + yy) * fw + x + xx], t = data[yy * w + xx];
        n++; sg += gv; sgg += gv * gv; st += t; stt += t * t; sgt += gv * t;
      }
    }
    const vg = sgg - (sg * sg) / n, vt = stt - (st * st) / n;
    if (vg <= 1e-6 || vt <= 1e-6) return 0;
    return (sgt - (sg * st) / n) / Math.sqrt(vg * vt);
  }

  update(frame: Frame, t: number): TrackResult {
    const lost = (c: number): TrackResult => ({ x: null, y: null, px: null, py: null, confidence: Math.max(0, c) });
    if (t + 1e-9 < this.cfg.t0 || !this.last) return lost(0);
    const { w, h } = this.cfg.template;
    // Vorhersage mit konstanter Geschwindigkeit; Suchradius wächst, solange der Marker fehlt
    const dt = Math.max(1e-6, t - this.lastT);
    let pred = { ...this.last };
    if (this.prev && this.lostFrames === 0 && t > this.lastT) {
      const span = Math.max(1e-6, this.lastT - this.prevT);
      const k = Math.min(2, dt / span);
      pred = { x: this.last.x + (this.last.x - this.prev.x) * k, y: this.last.y + (this.last.y - this.prev.y) * k };
    }
    const R = Math.round(Math.max(32, 2 * Math.max(w, h)) * Math.pow(1.6, Math.min(this.lostFrames, 4)));
    const cx = Math.round(pred.x - w / 2), cy = Math.round(pred.y - h / 2);

    // Helligkeit einmal je Bild berechnen (die Suche liest jeden Bildpunkt mehrfach)
    const gray = new Float32Array(frame.width * frame.height);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = 0.299 * frame.data[j] + 0.587 * frame.data[j + 1] + 0.114 * frame.data[j + 2];
    const fw = frame.width, fh = frame.height;
    let best = -2, bx = cx, by = cy;
    for (let y = cy - R; y <= cy + R; y += 2) {
      for (let x = cx - R; x <= cx + R; x += 2) {
        const c = this.ncc(gray, fw, fh, x, y, 2);
        if (c > best) { best = c; bx = x; by = y; }
      }
    }
    // fein: alle Punkte, ±2 um das grobe Maximum
    let fb = -2, fx = bx, fy = by;
    const grid: Record<string, number> = {};
    for (let y = by - 2; y <= by + 2; y++) {
      for (let x = bx - 2; x <= bx + 2; x++) {
        const c = this.ncc(gray, fw, fh, x, y, 1);
        grid[`${x},${y}`] = c;
        if (c > fb) { fb = c; fx = x; fy = y; }
      }
    }
    this.lostFrames = fb < MIN_NCC ? this.lostFrames + 1 : 0;
    if (fb < MIN_NCC) return lost(fb);

    // Parabel-Interpolation je Achse (nur wenn die Nachbarn bekannt und das Maximum echt ist)
    const parab = (m: number, c: number, p: number): number => {
      const d = m - 2 * c + p;
      return d < -1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / d)) : 0;
    };
    const gx0 = grid[`${fx - 1},${fy}`], gx1 = grid[`${fx + 1},${fy}`], gy0 = grid[`${fx},${fy - 1}`], gy1 = grid[`${fx},${fy + 1}`];
    const sx = gx0 !== undefined && gx1 !== undefined ? parab(gx0, fb, gx1) : 0;
    const sy = gy0 !== undefined && gy1 !== undefined ? parab(gy0, fb, gy1) : 0;
    const px = fx + sx + w / 2, py = fy + sy + h / 2;

    this.prev = this.last; this.prevT = this.lastT;
    this.last = { x: px, y: py }; this.lastT = t;
    if (!this.origin) this.origin = { x: px, y: py };
    const s = this.cfg.scale ?? 1;
    return { x: (px - this.origin.x) * s, y: -(py - this.origin.y) * s, px, py, confidence: Math.min(1, fb) };
  }

  private prevT = 0;
}
