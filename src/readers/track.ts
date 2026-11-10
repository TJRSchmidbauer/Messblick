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
/** Unter dieser Übereinstimmung im kleinen Fenster wird sofort mit großem Fenster nachgesucht. */
const RETRY_BELOW = 0.75;
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

  /** stationary: ruhendes Ziel (Bildanker) – keine Geschwindigkeitsvorhersage, Suche immer um die Ausgangslage. */
  constructor(private readonly cfg: TrackConfig, private readonly stationary = false) {
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

  // Helligkeit nur im Suchfenster (nicht im ganzen Bild), Puffer wird wiederverwendet
  private gray = new Float32Array(0);
  private gx0 = 0; private gy0 = 0; private gx1 = 0; private gy1 = 0;

  private prepare(frame: Frame, x0: number, y0: number, x1: number, y1: number): void {
    this.gx0 = Math.max(0, x0); this.gy0 = Math.max(0, y0);
    this.gx1 = Math.min(frame.width, x1); this.gy1 = Math.min(frame.height, y1);
    const gw = Math.max(0, this.gx1 - this.gx0), gh = Math.max(0, this.gy1 - this.gy0);
    if (this.gray.length < gw * gh) this.gray = new Float32Array(gw * gh);
    const d = frame.data;
    for (let y = 0; y < gh; y++) {
      let j = ((this.gy0 + y) * frame.width + this.gx0) * 4, o = y * gw;
      for (let x = 0; x < gw; x++, j += 4) this.gray[o + x] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }
  }

  /** NCC der Vorlage mit dem Bild, Vorlagen-Ecke bei (x, y); `step` 2 = jeder zweite Punkt (grob), 1 = alle (fein). */
  private ncc(x: number, y: number, step: 1 | 2): number {
    const { w, h, data } = this.cfg.template;
    if (x < this.gx0 || y < this.gy0 || x + w > this.gx1 || y + h > this.gy1) return -1;
    const gw = this.gx1 - this.gx0, g = this.gray;
    let n = 0, sg = 0, sgg = 0, st = 0, stt = 0, sgt = 0;
    for (let yy = 0; yy < h; yy += step) {
      const gRow = (y + yy - this.gy0) * gw + (x - this.gx0), tRow = yy * w;
      for (let xx = 0; xx < w; xx += step) {
        const gv = g[gRow + xx], t = data[tRow + xx];
        n++; sg += gv; sgg += gv * gv; st += t; stt += t * t; sgt += gv * t;
      }
    }
    const vg = sgg - (sg * sg) / n, vt = stt - (st * st) / n;
    if (vg <= 1e-6 || vt <= 1e-6) return 0;
    return (sgt - (sg * st) / n) / Math.sqrt(vg * vt);
  }

  /** Suche in einem Fenster vom Radius R um (cx, cy): grob (jeder zweite Punkt), dann fein mit Unterpixel-Interpolation. */
  private search(frame: Frame, cx: number, cy: number, R: number): { fx: number; fy: number; score: number; sx: number; sy: number } {
    const { w, h } = this.cfg.template;
    this.prepare(frame, cx - R - 3, cy - R - 3, cx + R + w + 3, cy + R + h + 3);
    let best = -2, bx = cx, by = cy;
    for (let y = cy - R; y <= cy + R; y += 2) {
      for (let x = cx - R; x <= cx + R; x += 2) {
        const c = this.ncc(x, y, 2);
        if (c > best) { best = c; bx = x; by = y; }
      }
    }
    // fein: alle Punkte, ±2 um das grobe Maximum (5 × 5 Werte)
    const grid = new Float32Array(25);
    let fb = -2, fx = bx, fy = by;
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 5; i++) {
        const c = this.ncc(bx - 2 + i, by - 2 + j, 1);
        grid[j * 5 + i] = c;
        if (c > fb) { fb = c; fx = bx - 2 + i; fy = by - 2 + j; }
      }
    }
    // Parabel-Interpolation je Achse (nur wenn die Nachbarn im 5 × 5-Feld liegen und das Maximum echt ist)
    const parab = (m: number, c: number, p: number): number => {
      const d = m - 2 * c + p;
      return d < -1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / d)) : 0;
    };
    const i = fx - (bx - 2), j = fy - (by - 2);
    const sx = i > 0 && i < 4 ? parab(grid[j * 5 + i - 1], fb, grid[j * 5 + i + 1]) : 0;
    const sy = j > 0 && j < 4 ? parab(grid[(j - 1) * 5 + i], fb, grid[(j + 1) * 5 + i]) : 0;
    return { fx, fy, score: fb, sx, sy };
  }

  update(frame: Frame, t: number): TrackResult {
    const lost = (c: number): TrackResult => ({ x: null, y: null, px: null, py: null, confidence: Math.max(0, c) });
    if (t + 1e-9 < this.cfg.t0 || !this.last) return lost(0);
    const { w, h } = this.cfg.template;
    const size = Math.max(w, h);
    // Zeit rückwärts (Video zurückgespult): Suche neu am Startort beginnen
    if (t < this.lastT - 1e-6) this.reset();
    // Vorhersage mit konstanter Geschwindigkeit (Bildpunkte je Sekunde aus den letzten beiden Funden)
    const dt = Math.max(1e-6, t - this.lastT);
    let pred = { ...this.last }, speed = 0;
    if (!this.stationary && this.prev && this.lostFrames === 0 && t > this.lastT) {
      const span = Math.max(1e-6, this.lastT - this.prevT);
      const k = Math.min(3, dt / span);
      pred = { x: this.last.x + (this.last.x - this.prev.x) * k, y: this.last.y + (this.last.y - this.prev.y) * k };
      speed = Math.hypot(this.last.x - this.prev.x, this.last.y - this.prev.y) / span;
    }
    // Kleiner Suchradius, solange der Marker sicher verfolgt wird (rechnet etwa 20-mal weniger als die volle Suche);
    // bei Misserfolg gleich noch einmal mit großem Radius; nach Verlust wächst der Radius
    const small = Math.round(Math.max(10, 0.5 * size) + 0.15 * speed * dt);
    const big = Math.round(Math.max(32, 2 * size) * Math.pow(1.6, Math.min(this.lostFrames, 4)));
    if (this.stationary) { const t0 = this.cfg.template; pred = { x: t0.x + t0.w / 2, y: t0.y + t0.h / 2 }; }
    const cx = Math.round(pred.x - w / 2), cy = Math.round(pred.y - h / 2);
    let r = this.lostFrames === 0 ? this.search(frame, cx, cy, small) : this.search(frame, cx, cy, big);
    if (this.lostFrames === 0 && r.score < RETRY_BELOW) {
      const wide = this.search(frame, Math.round(this.last.x - w / 2), Math.round(this.last.y - h / 2), big);
      if (wide.score > r.score) r = wide;
    }
    this.lostFrames = r.score < MIN_NCC ? this.lostFrames + 1 : 0;
    if (r.score < MIN_NCC) return lost(r.score);

    const px = r.fx + r.sx + w / 2, py = r.fy + r.sy + h / 2;
    this.prev = this.last; this.prevT = this.lastT;
    this.last = { x: px, y: py }; this.lastT = t;
    if (!this.origin) this.origin = { x: px, y: py };
    const s = this.cfg.scale ?? 1;
    return { x: (px - this.origin.x) * s, y: -(py - this.origin.y) * s, px, py, confidence: Math.min(1, r.score) };
  }

  private prevT = 0;
}
