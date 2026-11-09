import type { Frame, ReadResult, Rect } from '../core/types';
import { luminance } from '../core/types';
import { DIGIT_SEGMENTS, DP_BOX, SEGMENT_BOXES } from '../core/synth';

export interface DigitalCalibration {
  type: 'digital';
  roi: Rect;
  /** Anzahl Ziffernzellen (ohne Dezimalpunkte). */
  digits: number;
  /** Feste Nachkommastellen, falls die Anzeige keinen Punkt zeigt/der Punkt nicht erkannt wird. */
  decimals: number | null;
  /** 'auto': die Minderheit der Pixel gilt als Segment. */
  polarity: 'auto' | 'dark-on-light' | 'light-on-dark';
}

const PATTERNS = new Map<string, string>(
  Object.entries(DIGIT_SEGMENTS).map(([ch, segs]) => [[...segs].sort().join(''), ch]),
);
// gängige Varianten (6/7/9 mit oder ohne Zusatzsegment)
PATTERNS.set('abcdfg'.split('').sort().join(''), '9');
PATTERNS.set('bcdfg'.split('').sort().join(''), '9');
PATTERNS.set('abcf'.split('').sort().join(''), '7');
PATTERNS.set('cdefg'.split('').sort().join(''), '6');

function otsu(values: Uint8Array | number[]): number {
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

export function readDigital(frame: Frame, cal: DigitalCalibration): ReadResult {
  const { roi, digits } = cal;
  const x0 = Math.max(0, Math.round(roi.x)), y0 = Math.max(0, Math.round(roi.y));
  const w = Math.min(frame.width - x0, Math.round(roi.w)), h = Math.min(frame.height - y0, Math.round(roi.h));
  if (w < digits * 4 || h < 8 || digits < 1) return { value: null, confidence: 0 };

  const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = luminance(frame, x0 + x, y0 + y);
  const thr = otsu(lum);
  let fgIsDark = cal.polarity === 'dark-on-light';
  if (cal.polarity === 'auto') {
    let dark = 0;
    for (const v of lum) if (v <= thr) dark++;
    fgIsDark = dark < lum.length / 2;
  }
  const isFg = (x: number, y: number): boolean => (lum[y * w + x] <= thr) === fgIsDark;

  /** Füllanteil in einer Box (Anteile der Zelle), Randbereiche 20 % ausgespart. */
  const fill = (cx: number, cw: number, box: [number, number, number, number]): number => {
    const bx0 = box[0] + (box[2] - box[0]) * 0.2, bx1 = box[2] - (box[2] - box[0]) * 0.2;
    const by0 = box[1] + (box[3] - box[1]) * 0.2, by1 = box[3] - (box[3] - box[1]) * 0.2;
    const xa = Math.max(0, Math.floor(cx + bx0 * cw)), xb = Math.min(w, Math.max(xa + 1, Math.ceil(cx + bx1 * cw)));
    const ya = Math.max(0, Math.floor(by0 * h)), yb = Math.min(h, Math.max(ya + 1, Math.ceil(by1 * h)));
    let n = 0, c = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { c++; if (isFg(x, y)) n++; }
    return c ? n / c : 0;
  };

  const cw = w / digits;
  let out = '';
  let dpCount = 0;
  let marginSum = 0, marginN = 0;
  for (let i = 0; i < digits; i++) {
    const cx = i * cw;
    let key = '';
    for (const s of 'abcdefg') {
      const r = fill(cx, cw, SEGMENT_BOXES[s]);
      marginSum += Math.abs(r - 0.5) * 2;
      marginN++;
      if (r > 0.5) key += s;
    }
    const ch = PATTERNS.get([...key].sort().join(''));
    if (ch === undefined) return { value: null, confidence: 0 };
    out += ch;
    const rdp = fill(cx, cw, DP_BOX);
    if (rdp > 0.5) { out += '.'; dpCount++; }
  }
  if (dpCount > 1) return { value: null, confidence: 0 };
  let text = out.replace(/ /g, '');
  if (dpCount === 0 && cal.decimals && cal.decimals > 0) {
    const neg = text.startsWith('-');
    const digs = (neg ? text.slice(1) : text).padStart(cal.decimals + 1, '0');
    text = (neg ? '-' : '') + digs.slice(0, -cal.decimals) + '.' + digs.slice(-cal.decimals);
  }
  const value = Number(text);
  if (text === '' || text === '-' || !Number.isFinite(value)) return { value: null, confidence: 0 };
  return { value, confidence: Math.max(0, Math.min(1, marginSum / marginN)) };
}
