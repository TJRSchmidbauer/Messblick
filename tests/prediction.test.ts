import { describe, expect, it } from 'vitest';
import { cleanPath, comparePrediction, predictionAt, type PredPoint } from '../src/analysis/prediction';

const curve = (f: (x: number) => number, a: number, b: number, n: number): PredPoint[] => Array.from({ length: n }, (_, i) => { const x = a + ((b - a) * i) / (n - 1); return { x, y: f(x) }; });

describe('Vorhersage: gezeichneter Zug → Kurve', () => {
  it('sortiert nach x, fasst zu dichte und doppelte Punkte zusammen', () => {
    const out = cleanPath([{ x: 2, y: 4 }, { x: 0, y: 0 }, { x: 2.001, y: 6 }, { x: 1, y: 1 }], 0.01);
    expect(out).toHaveLength(3);
    expect(out[0].x).toBe(0);
    expect(out[2].x).toBeCloseTo(2.0005, 10);
    expect(out[2].y).toBe(5);
  });
  it('verwirft ungültige Punkte', () => {
    expect(cleanPath([{ x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1, y: 1 }], 0.1)).toEqual([{ x: 1, y: 1 }]);
  });
  it('linear interpoliert, außerhalb null', () => {
    const p = [{ x: 0, y: 0 }, { x: 10, y: 20 }];
    expect(predictionAt(p, 5)).toBe(10);
    expect(predictionAt(p, 0)).toBe(0);
    expect(predictionAt(p, 10)).toBe(20);
    expect(predictionAt(p, -1)).toBeNull();
    expect(predictionAt(p, 11)).toBeNull();
    expect(predictionAt([{ x: 1, y: 1 }], 1)).toBeNull();
  });
});

describe('Vorhersage: Vergleich mit der Messung', () => {
  const data = curve((t) => 5 * Math.exp(-t / 3), 0, 12, 40);
  it('sehr nah, grob richtig, deutlich anders', () => {
    const close = comparePrediction(curve((t) => 5 * Math.exp(-t / 3.1), 0, 12, 13), data);
    expect(close.verdict).toBe('close');
    const rough = comparePrediction(curve((t) => 5 * Math.exp(-t / 5), 0, 12, 13), data);
    expect(rough.verdict).toBe('rough');
    const off = comparePrediction(curve((t) => 5 - 0.4 * t, 0, 12, 13), data);
    expect(off.verdict).toBe('different');
    expect(off.text).toMatch(/Was hast du anders erwartet/);
    expect(close.rmsPercent!).toBeLessThan(rough.rmsPercent!);
  });
  it('Vorhersage deckt nur einen Teil ab: Anteil wird gemeldet', () => {
    const f = comparePrediction(curve((t) => 5 * Math.exp(-t / 3), 0, 6, 10), data);
    expect(f.coverage).toBeCloseTo(0.5, 1);
    expect(f.verdict).toBe('close');
  });
  it('Randfälle melden verständlich, was fehlt', () => {
    expect(comparePrediction([], data).text).toMatch(/Keine Vorhersage/);
    expect(comparePrediction(curve((t) => t, 0, 1, 5), data.slice(0, 2)).text).toMatch(/zu wenige Messpunkte/);
    expect(comparePrediction(curve((t) => t, 100, 200, 5), data).text).toMatch(/kaum im Bereich/);
    expect(comparePrediction(curve((t) => t, 0, 12, 5), data.map((d) => ({ ...d, y: 2 }))).text).toMatch(/konstant/);
  });
});
