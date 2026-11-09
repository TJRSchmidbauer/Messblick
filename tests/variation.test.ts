import { describe, expect, it } from 'vitest';
import { applyTransform, averageReadings, suggestPlots, toPoints, transformLabel, type VarRow } from '../src/analysis/variation';

describe('Parameterreihe: Umrechnungen', () => {
  it('Wert und Unsicherheit nach Gauß', () => {
    expect(applyTransform('square', 3, 0.1)).toEqual({ v: 9, s: expect.closeTo(0.6, 10) });
    expect(applyTransform('inverse', 4, 0.2)).toEqual({ v: 0.25, s: expect.closeTo(0.0125, 10) });
    expect(applyTransform('sqrt', 16, 0.4)).toEqual({ v: 4, s: expect.closeTo(0.05, 10) });
    expect(applyTransform('ln', Math.E, 0.1)).toEqual({ v: 1, s: expect.closeTo(0.1 / Math.E, 10) });
    expect(applyTransform('id', 5)).toEqual({ v: 5 });
  });
  it('nicht definierte Fälle ergeben null', () => {
    expect(applyTransform('inverse', 0)).toBeNull();
    expect(applyTransform('ln', 0)).toBeNull();
    expect(applyTransform('ln', -1)).toBeNull();
    expect(applyTransform('sqrt', -4)).toBeNull();
  });
  it('Beschriftungen', () => {
    expect(transformLabel('square', 'T')).toBe('T²');
    expect(transformLabel('inverse', 'm')).toBe('1/m');
    expect(transformLabel('ln', 'U')).toBe('ln(U)');
  });
  it('toPoints lässt ungültige Zeilen weg und reicht σ weiter', () => {
    const rows: VarRow[] = [{ p: 1, v: 2, s: 0.1 }, { p: 0, v: 3 }, { p: 2, v: 4, s: 0.2 }];
    const pts = toPoints(rows, 'inverse', 'square');
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ x: 1, y: 4, sy: expect.closeTo(0.4, 10) });
  });
});

describe('Parameterreihe: Auftragungsvorschläge', () => {
  const rows = (f: (p: number) => number, ps: number[], s?: number): VarRow[] => ps.map((p) => ({ p, v: f(p), ...(s ? { s } : {}) }));

  it('Federpendel: T = 2π√(m/D) → beste Auftragung ist T² über m, durch den Ursprung', () => {
    const D = 20;
    const best = suggestPlots(rows((m) => 2 * Math.PI * Math.sqrt(m / D), [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]))[0];
    expect(best.r2).toBeGreaterThan(0.9999);
    expect(suggestPlots(rows((m) => 2 * Math.PI * Math.sqrt(m / D), [0.05, 0.1, 0.15, 0.2, 0.25, 0.3])).some((s) => s.tx === 'id' && s.ty === 'square' && s.throughOrigin)).toBe(true);
  });

  it('lineare Daten: einfachste Auftragung (y über x) steht vorn', () => {
    const s = suggestPlots(rows((p) => 3 * p + 1, [1, 2, 3, 4, 5]));
    expect(s[0]).toMatchObject({ tx: 'id', ty: 'id' });
    expect(s[0].throughOrigin).toBe(false);
  });

  it('Proportional: Achsenabschnitt innerhalb 2σ von 0 wird erkannt', () => {
    const s = suggestPlots(rows((p) => 2 * p + (p === 3 ? 0.02 : 0), [1, 2, 3, 4, 5]));
    expect(s[0].throughOrigin).toBe(true);
  });

  it('Potenzgesetz T ∝ l^0,5: ln über ln ist linear und erscheint unter den Vorschlägen', () => {
    const s = suggestPlots(rows((l) => 2 * Math.sqrt(l), [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]), 8);
    expect(s.some((x) => x.tx === 'ln' && x.ty === 'ln' && x.r2 > 0.9999)).toBe(true);
  });

  it('zu wenige Punkte oder konstante Werte → keine Vorschläge', () => {
    expect(suggestPlots(rows((p) => p, [1, 2]))).toEqual([]);
    expect(suggestPlots(rows(() => 5, [1, 2, 3, 4]))).toEqual([]);
    expect(suggestPlots([])).toEqual([]);
  });
});

describe('Parameterreihe: Mittelwert mehrerer Ablesungen', () => {
  it('Mittelwert, Unsicherheit des Mittelwerts, Gerätefehler quadratisch addiert', () => {
    const r = averageReadings([4.9, 5.1, 5.0, 5.0], 0.15)!;
    expect(r.v).toBeCloseTo(5, 10);
    const std = Math.sqrt((0.01 + 0.01) / 3);
    expect(r.s).toBeCloseTo(Math.hypot(std / 2, 0.15), 10);
    expect(r.n).toBe(4);
  });
  it('wenige Werte: keine Streuung angenommen, ohne Gerätefehler unbekannt', () => {
    expect(averageReadings([2, 4])!.s).toBeNull();
    expect(averageReadings([3], 0.1)!.s).toBeCloseTo(0.1, 10);
    expect(averageReadings([NaN])).toBeNull();
    expect(averageReadings([])).toBeNull();
  });
});
