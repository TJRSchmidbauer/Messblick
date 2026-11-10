import type { Frame, ReadResult, Rect } from '../core/types';
import { luminance } from '../core/types';

/** Von Hand angelernte Ziffer (siehe glyph.ts): Zeichen + Raster als Ziffernfolge '0'..'9' (Füllgrad in Zehnteln). */
export interface LearnedGlyph {
  ch: string;
  grid: string;
}

export interface DigitalCalibration {
  type: 'digital';
  roi: Rect;
  /** Anzahl Ziffernzellen (ohne Dezimalpunkte in der Zelle). Bei Punktmatrix-Anzeigen zählt ein Punkt als eigene Zelle. */
  digits: number;
  /** Feste Nachkommastellen, falls die Anzeige keinen Punkt zeigt/der Punkt nicht erkannt wird. */
  decimals: number | null;
  /** 'auto': die Minderheit der Pixel gilt als Segment. */
  polarity: 'auto' | 'dark-on-light' | 'light-on-dark';
  /**
   * Leseverfahren. 'segment': Segmentabtastung (7-Segment, schnell, Standard für ältere Dateien).
   * 'glyph': Zeichenvergleich für LCD und Punktmatrix. 'auto': Segment, bei unsicherem Ergebnis Zeichenvergleich.
   */
  style?: 'auto' | 'segment' | 'glyph';
  /** Angelernte Zeichen dieses Geräts; gehen im Zeichenvergleich vor den eingebauten Vorlagen. */
  learned?: LearnedGlyph[];
}

export const NO_READING: ReadResult = { value: null, confidence: 0 };

export function otsu(values: Uint8Array | number[]): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

export interface RoiPixels {
  w: number;
  h: number;
  lum: Uint8Array;
}

/** Schneidet den Ausschnitt aus dem Bild und rechnet in Helligkeit um. null, wenn er zu klein ist. */
export function extractRoi(frame: Frame, roi: Rect, digits: number): RoiPixels | null {
  const x0 = Math.max(0, Math.round(roi.x)), y0 = Math.max(0, Math.round(roi.y));
  const w = Math.min(frame.width - x0, Math.round(roi.w)), h = Math.min(frame.height - y0, Math.round(roi.h));
  if (w < digits * 4 || h < 8 || digits < 1) return null;
  const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = luminance(frame, x0 + x, y0 + y);
  return { w, h, lum };
}

/** Sind die Ziffern dunkel (auf hellem Grund)? 'auto': die Minderheit der Pixel gilt als Ziffer. */
export function foregroundIsDark(lum: Uint8Array, thr: number, polarity: DigitalCalibration['polarity']): boolean {
  if (polarity !== 'auto') return polarity === 'dark-on-light';
  let dark = 0;
  for (const v of lum) if (v <= thr) dark++;
  return dark < lum.length / 2;
}

/**
 * Fügt aus erkanntem Text eine Zahl zusammen (feste Nachkommastellen, wenn kein Punkt zu sehen war).
 * Gibt null zurück, wenn der Text keine gültige Zahl ist.
 */
export function textToValue(text: string, dpCount: number, decimals: number | null): number | null {
  if (dpCount > 1) return null;
  let t = text.replace(/ /g, '');
  if (dpCount === 0 && decimals && decimals > 0) {
    const neg = t.startsWith('-');
    const digs = (neg ? t.slice(1) : t).padStart(decimals + 1, '0');
    t = (neg ? '-' : '') + digs.slice(0, -decimals) + '.' + digs.slice(-decimals);
  }
  const value = Number(t);
  if (t === '' || t === '-' || t === '.' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Dreht eine schräg im Bild stehende Anzeige gerade: Das Rechteck `roi` ist um `roi.angle` Grad (im Uhrzeigersinn) gedreht;
 * zurück kommt ein Bild genau so groß wie das Rechteck mit aufrechter Anzeige (bilineare Abtastung, Rand wird fortgesetzt).
 */
export function derotate(frame: Frame, roi: Rect & { angle?: number }): Frame {
  const w = Math.max(1, Math.round(roi.w)), h = Math.max(1, Math.round(roi.h));
  const a = ((roi.angle ?? 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const cx = roi.x + roi.w / 2, cy = roi.y + roi.h / 2;
  const data = new Uint8ClampedArray(w * h * 4);
  const W = frame.width, H = frame.height;
  const px = (x: number, y: number, k: number): number => frame.data[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + k];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x + 0.5 - w / 2, v = y + 0.5 - h / 2;
      const sx = cx + u * cs - v * sn - 0.5, sy = cy + u * sn + v * cs - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        data[o + k] = (px(x0, y0, k) * (1 - fx) + px(x0 + 1, y0, k) * fx) * (1 - fy) + (px(x0, y0 + 1, k) * (1 - fx) + px(x0 + 1, y0 + 1, k) * fx) * fy;
      }
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
