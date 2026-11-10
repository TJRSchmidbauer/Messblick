import type { Frame } from '../core/types';
import { Tracker, type TrackConfig } from './track';

/**
 * Bildstabilisierung über einen Bildanker: Ein ruhender, kontrastreicher Punkt im Bild (Aufkleber, Gerätekante) wird
 * verfolgt. Verrutscht die Kamera, wird jedes Bild um die Verschiebung des Ankers zurückgeschoben. Alle Leser, Marker und
 * Lichtschranken arbeiten danach auf dem stabilisierten Bild und brauchen keine Kenntnis davon.
 * Nur Verschiebung (kein Drehen, kein Zoomen): reicht für leichtes Verrutschen und Vibrieren.
 */

/** Verschiebt ein Bild um (dx, dy) Bildpunkte (auch Bruchteile, bilinear); am Rand wird der Randwert fortgesetzt. */
export function translateFrame(f: Frame, dx: number, dy: number): Frame {
  const { width: w, height: h } = f;
  const out = new Uint8ClampedArray(f.data.length);
  const src = f.data;
  const ix = Math.round(dx), iy = Math.round(dy);
  if (Math.abs(dx - ix) < 1e-3 && Math.abs(dy - iy) < 1e-3) {
    for (let y = 0; y < h; y++) {
      const sy = Math.min(h - 1, Math.max(0, y - iy));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1, Math.max(0, x - ix));
        const o = (y * w + x) * 4, s = (sy * w + sx) * 4;
        out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
      }
    }
    return { width: w, height: h, data: out };
  }
  for (let y = 0; y < h; y++) {
    const fy = y - dy, y0 = Math.floor(fy), wy = fy - y0;
    const ya = Math.min(h - 1, Math.max(0, y0)), yb = Math.min(h - 1, Math.max(0, y0 + 1));
    for (let x = 0; x < w; x++) {
      const fx = x - dx, x0 = Math.floor(fx), wx = fx - x0;
      const xa = Math.min(w - 1, Math.max(0, x0)), xb = Math.min(w - 1, Math.max(0, x0 + 1));
      const i00 = (ya * w + xa) * 4, i10 = (ya * w + xb) * 4, i01 = (yb * w + xa) * 4, i11 = (yb * w + xb) * 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] = (src[i00 + c] * (1 - wx) + src[i10 + c] * wx) * (1 - wy) + (src[i01 + c] * (1 - wx) + src[i11 + c] * wx) * wy;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** Unterhalb dieser Verschiebung (Bildpunkte) bleibt das Bild unverändert. */
const NEGLIGIBLE = 0.05;

export interface Prepper {
  /** Zurück zum Start (vor jeder Aufnahme oder Auswertung). */
  reset(): void;
  /** Liefert das stabilisierte Bild zur Zeit t (s). */
  apply(frame: Frame, t: number): Frame;
}

export class Stabilizer implements Prepper {
  private tracker: Tracker;
  private shiftNow = { dx: 0, dy: 0 };
  private isLost = false;
  private readonly start: { x: number; y: number };

  constructor(cfg: TrackConfig) {
    // Der Anker gilt immer, auch bei Videodateien ab Sekunde 0
    this.tracker = new Tracker({ ...cfg, t0: 0, scale: null }, true);
    this.start = { x: cfg.template.x + cfg.template.w / 2, y: cfg.template.y + cfg.template.h / 2 };
  }

  reset(): void {
    this.tracker.reset();
    this.shiftNow = { dx: 0, dy: 0 };
    this.isLost = false;
  }

  /** Verschiebung des Ankers gegenüber der Kalibrierung (Bildpunkte); die Korrektur ist das Negative davon. */
  get shift(): { dx: number; dy: number } {
    return { dx: -this.shiftNow.dx, dy: -this.shiftNow.dy };
  }
  /** Anker im letzten Bild nicht gefunden (die zuletzt bekannte Korrektur bleibt in Kraft). */
  get lost(): boolean {
    return this.isLost;
  }

  apply(frame: Frame, t: number): Frame {
    const r = this.tracker.update(frame, t);
    if (r.px !== null && r.py !== null) {
      this.shiftNow = { dx: this.start.x - r.px, dy: this.start.y - r.py };
      this.isLost = false;
    } else this.isLost = true;
    const { dx, dy } = this.shiftNow;
    if (Math.abs(dx) < NEGLIGIBLE && Math.abs(dy) < NEGLIGIBLE) return frame;
    return translateFrame(frame, dx, dy);
  }
}
