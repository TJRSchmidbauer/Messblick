import type { Frame, ReadResult } from '../core/types';
import { DIGIT_SEGMENTS, DP_BOX, SEGMENT_BOXES } from '../core/synth';
import { foregroundMask, readGlyph } from './glyph';
import { NO_READING, extractRoi, foregroundIsDark, otsu, textToValue, type DigitalCalibration } from './shared';

export type { DigitalCalibration, LearnedGlyph } from './shared';

const PATTERNS = new Map<string, string>(
  Object.entries(DIGIT_SEGMENTS).map(([ch, segs]) => [[...segs].sort().join(''), ch]),
);
// gängige Varianten (6/7/9 mit oder ohne Zusatzsegment)
PATTERNS.set('abcdfg'.split('').sort().join(''), '9');
PATTERNS.set('bcdfg'.split('').sort().join(''), '9');
PATTERNS.set('abcf'.split('').sort().join(''), '7');
PATTERNS.set('cdefg'.split('').sort().join(''), '6');

/** Unterhalb dieser Sicherheit setzt sich im Modus 'auto' bei Widerspruch die Segmentabtastung durch. */
const GLYPH_TRUSTED_FROM = 0.4;
const SEGMENT_SURE = 0.95;

/**
 * Liest eine Digitalanzeige nach dem eingestellten Verfahren (Standard ohne Angabe: Segmentabtastung).
 * 'auto' liest mit beiden Verfahren: stimmen sie überein, gilt das Ergebnis; bei Widerspruch gewinnt der
 * Zeichenvergleich, weil er Schrägschrift, schwachen Kontrast und Lichtverlauf besser verträgt.
 */
export function readDigital(frame: Frame, cal: DigitalCalibration): ReadResult {
  const style = cal.style ?? 'segment';
  if (style === 'glyph') return readGlyph(frame, cal);
  if (style === 'segment') return readSegments(frame, cal);
  const seg = readSegments(frame, cal, true);
  const glyph = readGlyph(frame, cal);
  if (glyph.value === null) return seg;
  if (seg.value === null) return glyph;
  if (seg.value === glyph.value) return { value: seg.value, confidence: Math.max(seg.confidence, glyph.confidence) };
  // Gleiche Ziffern, nur der Dezimalpunkt fehlt einem der beiden Verfahren (kleine Punkte gehen leicht unter): der Wert mit Punkt gilt
  if (seg.value !== 0 && glyph.value !== 0) {
    const big = Math.max(Math.abs(seg.value), Math.abs(glyph.value)), small = Math.min(Math.abs(seg.value), Math.abs(glyph.value)), q = big / small;
    if ([10, 100, 1000].some((k) => Math.abs(q - k) < 1e-6 * k)) return Math.abs(seg.value) < Math.abs(glyph.value) ? seg : glyph;
  }
  // Die Segmentabtastung ist sich bei sauberen 7-Segment-Ziffern ganz sicher (jedes Segment klar an oder aus): dann gilt sie
  if (seg.confidence >= SEGMENT_SURE) return seg;
  return glyph.confidence >= GLYPH_TRUSTED_FROM ? glyph : seg;
}

/** 7-Segment-Anzeigen: Füllgrad je Segmentbox. */
export function readSegments(frame: Frame, cal: DigitalCalibration, adaptive = false): ReadResult {
  const { roi, digits } = cal;
  const px = extractRoi(frame, roi, digits);
  if (!px) return NO_READING;
  const { w, h, lum } = px;
  const thr = otsu(lum);
  const fgIsDark = foregroundIsDark(lum, thr, cal.polarity);
  // adaptive Schwelle: verträgt Lichtverlauf und schwachen Kontrast (LCD); sonst eine Schwelle fürs ganze Bild
  const local = adaptive ? foregroundMask(lum, w, h, fgIsDark) : null;
  if (adaptive && !local) return NO_READING;
  const isFg = (x: number, y: number): boolean => (local ? local[y * w + x] === 1 : (lum[y * w + x] <= thr) === fgIsDark);

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
    if (ch === undefined) return NO_READING;
    out += ch;
    const rdp = fill(cx, cw, DP_BOX);
    if (rdp > 0.5) { out += '.'; dpCount++; }
  }
  const value = textToValue(out, dpCount, cal.decimals);
  if (value === null) return NO_READING;
  return { value, confidence: Math.max(0, Math.min(1, marginSum / marginN)) };
}
