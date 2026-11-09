import { describe, expect, it } from 'vitest';
import { readDigital, type DigitalCalibration } from '../src/readers/digital';
import { createFrame, drawSevenSegment } from '../src/core/synth';

const cal = (over: Partial<DigitalCalibration> = {}): DigitalCalibration => ({
  type: 'digital', roi: { x: 20, y: 20, w: 200, h: 80 }, digits: 4, decimals: null, polarity: 'auto', ...over,
});
const render = (text: string, o: { fg?: number; bg?: number; cells?: number } = {}) => {
  const f = createFrame(260, 140, 128);
  drawSevenSegment(f, 20, 20, 200, 80, text, o.cells ?? 4, o);
  return f;
};

describe('Digital-Reader (7-Segment)', () => {
  it.each(['12.34', '0.05', '-1.50', '9999', '  7.8', '86.20'])('erkennt %s', (txt) => {
    const r = readDigital(render(txt), cal());
    expect(r.value).toBeCloseTo(Number(txt.trim()), 6);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('helle Ziffern auf dunklem Grund (LCD-Hintergrundbeleuchtung/LED)', () => {
    const r = readDigital(render('3.14', { fg: 250, bg: 10 }), cal());
    expect(r.value).toBeCloseTo(3.14, 6);
  });

  it('feste Nachkommastellen ohne sichtbaren Punkt', () => {
    expect(readDigital(render('1234'), cal({ decimals: 2 })).value).toBeCloseTo(12.34, 6);
    expect(readDigital(render('  45'), cal({ decimals: 2 })).value).toBeCloseTo(0.45, 6);
  });

  it('verrauschtes Bild', () => {
    const f = render('42.7');
    let seed = 1;
    for (let i = 0; i < f.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = ((seed >>> 24) / 255 - 0.5) * 60;
      for (let k = 0; k < 3; k++) f.data[i + k] = Math.max(0, Math.min(255, f.data[i + k] + n));
    }
    expect(readDigital(f, cal()).value).toBeCloseTo(42.7, 6);
  });

  it('unlesbares Bild → null', () => {
    const f = createFrame(260, 140, 128);
    expect(readDigital(f, cal({ polarity: 'dark-on-light' })).value).toBeNull();
  });
});
