import { describe, expect, it } from 'vitest';
import { detectScaleJumps, factorLabel } from '../src/analysis/jumps';

const wobble = (base: number, n: number, rel = 0.01): number[] => Array.from({ length: n }, (_, i) => base * (1 + rel * Math.sin(i * 1.7)));

describe('Sprung um eine Zehnerpotenz', () => {
  it('Messbereichswechsel nach oben (0,5 → 5,0)', () => {
    const j = detectScaleJumps([...wobble(0.5, 8), ...wobble(5.0, 8)]);
    expect(j).toEqual([{ index: 8, factor: 10 }]);
  });
  it('Messbereichswechsel nach unten (12,3 → 1,23) und um 100', () => {
    expect(detectScaleJumps([...wobble(12.3, 6), ...wobble(1.23, 6)])).toEqual([{ index: 6, factor: 0.1 }]);
    expect(detectScaleJumps([...wobble(0.02, 6), ...wobble(2, 6)])[0].factor).toBe(100);
  });
  it('mehrere Wechsel hintereinander', () => {
    const j = detectScaleJumps([...wobble(0.5, 6), ...wobble(5, 6), ...wobble(0.5, 6)]);
    expect(j.map((x) => x.factor)).toEqual([10, 0.1]);
  });
  it('Lücken (null) stören nicht, Index bleibt der der Originalreihe', () => {
    const v: (number | null)[] = [...wobble(2, 5), null, null, ...wobble(20, 5)];
    expect(detectScaleJumps(v)).toEqual([{ index: 7, factor: 10 }]);
  });
  it('keine Fehlalarme: Sinus, glatter Zerfall, Rauschen, Nullen, Vorzeichenwechsel, kurze Reihen', () => {
    const sine = Array.from({ length: 60 }, (_, i) => 5 + 4 * Math.sin(i / 5));
    expect(detectScaleJumps(sine)).toEqual([]);
    const decay = Array.from({ length: 60 }, (_, i) => 10 * Math.exp(-i / 8));
    expect(detectScaleJumps(decay)).toEqual([]);
    expect(detectScaleJumps(wobble(3, 40, 0.2))).toEqual([]);
    expect(detectScaleJumps([0, 0, 0, 5, 5, 5, 5])).toEqual([]);
    expect(detectScaleJumps([-0.5, -0.5, -0.5, 5, 5, 5])).toEqual([]);
    expect(detectScaleJumps([1, 10])).toEqual([]);
    expect(detectScaleJumps([])).toEqual([]);
  });
  it('ein einzelner Ausreißer ist kein Bereichswechsel', () => {
    expect(detectScaleJumps([...wobble(2, 6), 20, ...wobble(2, 6)])).toEqual([]);
  });
  it('Faktor kein exakter Zehnerpotenz (×7) wird nicht gemeldet', () => {
    expect(detectScaleJumps([...wobble(1, 6), ...wobble(7, 6)])).toEqual([]);
  });
  it('Beschriftung', () => {
    expect(factorLabel(0.1)).toBe('×0,1');
    expect(factorLabel(100)).toBe('×100');
  });
});
