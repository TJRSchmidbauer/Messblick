import { describe, expect, it } from 'vitest';
import { fitLine, fitProportional } from '../src/analysis/fit/linear';
import { fitModel } from '../src/analysis/fit/fit';
import { modelById } from '../src/analysis/fit/models';
import type { Pt } from '../src/analysis/fit/types';
import { describeUncertainty, sigmaOf } from '../src/analysis/uncertainty';
import { derivative, evalWithError, integral, parseExpression, ParseError } from '../src/analysis/derive';

/** Feste Zufallssaat (LCG) + Box-Muller: Tests sind reproduzierbar. */
function rng(seed: number): { uniform: () => number; normal: () => number } {
  let s = seed >>> 0;
  const uniform = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return { uniform, normal: () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()) };
}
const grid = (a: number, b: number, n: number): number[] => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const model = (id: string) => modelById(id)!;

describe('lineare Regression', () => {
  it('trifft rauschfreie Daten exakt', () => {
    const pts = grid(0, 10, 11).map((x) => ({ x, y: 2.5 * x - 1 }));
    const l = fitLine(pts)!;
    expect(l.a).toBeCloseTo(2.5, 10);
    expect(l.b).toBeCloseTo(-1, 10);
    expect(l.sa).toBeCloseTo(0, 8);
  });

  it('bekannte σ: σ_a = σ/√Σ(x−x̄)², σ_b = σ·√(1/n + x̄²/Σ(x−x̄)²)', () => {
    const xs = grid(0, 9, 10), sy = 0.3;
    const pts: Pt[] = xs.map((x, i) => ({ x, y: x + (i % 2 ? 0.2 : -0.2), sy }));
    const xm = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sxx = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
    const l = fitLine(pts)!;
    expect(l.sa).toBeCloseTo(sy / Math.sqrt(sxx), 10);
    expect(l.sb).toBeCloseTo(sy * Math.sqrt(1 / xs.length + (xm * xm) / sxx), 10);
  });

  it('ohne σ skaliert die Streuung der Residuen die Unsicherheit', () => {
    const pts: Pt[] = grid(0, 9, 10).map((x, i) => ({ x, y: x + (i % 2 ? 0.2 : -0.2) }));
    const l = fitLine(pts)!;
    expect(l.sa).toBeGreaterThan(0);
    // mit größerer Streuung wird σ_a größer
    const noisier = fitLine(pts.map((p, i) => ({ ...p, y: p.y + (i % 2 ? 1 : -1) })))!;
    expect(noisier.sa).toBeGreaterThan(l.sa);
  });

  it('gewichtet: ein Punkt mit riesigem σ zählt kaum', () => {
    const pts: Pt[] = [{ x: 0, y: 0, sy: 0.1 }, { x: 1, y: 1, sy: 0.1 }, { x: 2, y: 2, sy: 0.1 }, { x: 3, y: 40, sy: 1e6 }];
    expect(fitLine(pts)!.a).toBeCloseTo(1, 3);
  });

  it('Ursprungsgerade und Randfälle', () => {
    expect(fitProportional(grid(1, 5, 5).map((x) => ({ x, y: 3 * x })))!.a).toBeCloseTo(3, 10);
    expect(fitLine([{ x: 1, y: 1 }])).toBeNull();
    expect(fitLine([{ x: 2, y: 1 }, { x: 2, y: 3 }, { x: 2, y: 5 }])).toBeNull();
  });
});

describe('Fit mit Levenberg–Marquardt', () => {
  it('Zerfall: Parameter liegen in ≥ 95 % von 200 Läufen innerhalb 3σ der gemeldeten Unsicherheit', () => {
    const truth = [4, 2.5, 1], sigma = 0.05;
    const r = rng(42);
    let inside = 0;
    for (let run = 0; run < 200; run++) {
      const pts: Pt[] = grid(0, 10, 60).map((x) => ({ x, y: truth[0] * Math.exp(-x / truth[1]) + truth[2] + sigma * r.normal(), sy: sigma }));
      const f = fitModel(model('decay'), pts);
      if (!f.ok) continue;
      if (f.params.every((p, i) => Math.abs(p.value - truth[i]) <= 3 * p.sigma)) inside++;
    }
    expect(inside / 200).toBeGreaterThanOrEqual(0.95);
  });

  it('Zerfall ohne angegebene σ: Unsicherheit aus der Streuung, Hinweis in den Warnungen', () => {
    const r = rng(3);
    const pts: Pt[] = grid(0, 10, 50).map((x) => ({ x, y: 4 * Math.exp(-x / 2.5) + 1 + 0.05 * r.normal() }));
    const f = fitModel(model('decay'), pts);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.params[1].value).toBeCloseTo(2.5, 0);
    expect(f.params[1].sigma).toBeGreaterThan(0);
    expect(f.weighted).toBe(false);
    expect(f.warnings.join(' ')).toMatch(/Keine Messunsicherheit/);
    expect(f.r2).toBeGreaterThan(0.99);
  });

  it('Sättigung (Kondensator laden)', () => {
    const pts: Pt[] = grid(0, 12, 50).map((x) => ({ x, y: 6 * (1 - Math.exp(-x / 3)) + 0.2 }));
    const f = fitModel(model('saturation'), pts);
    expect(f.ok && f.params.map((p) => p.value)).toEqual([expect.closeTo(6, 4), expect.closeTo(3, 4), expect.closeTo(0.2, 4)]);
  });

  it('Potenz a·x^b (Auslassen von x ≤ 0 wird gemeldet)', () => {
    const pts: Pt[] = [{ x: 0, y: 0 }, ...grid(1, 9, 9).map((x) => ({ x, y: 2 * x ** 1.5 }))];
    const f = fitModel(model('power'), pts);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.params[0].value).toBeCloseTo(2, 5);
    expect(f.params[1].value).toBeCloseTo(1.5, 5);
    expect(f.warnings.join(' ')).toMatch(/1 Punkt\(e\)/);
  });

  it('Sinus mit Offset auf der Demo-Kurve (ω ≈ 1/3, A ≈ 4, C ≈ 5)', () => {
    const pts: Pt[] = grid(0, 30, 151).map((t) => ({ x: t, y: 5 + 4 * Math.sin(t / 3) }));
    const f = fitModel(model('sine'), pts);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const [A, w, phi, C] = f.params.map((p) => p.value);
    expect(A).toBeCloseTo(4, 3);
    expect(w).toBeCloseTo(1 / 3, 4);
    expect(Math.abs(phi)).toBeLessThan(0.01); // eindeutige Form: Phase um 0, nicht um 2π
    expect(C).toBeCloseTo(5, 3);
  });

  it('gedämpfter Sinus (Schwingkreis)', () => {
    const r = rng(9);
    const pts: Pt[] = grid(0, 20, 400).map((t) => ({ x: t, y: 3 * Math.exp(-0.15 * t) * Math.sin(2 * t + 0.5) + 0.01 * r.normal() }));
    const f = fitModel(model('dampedsine'), pts);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.params[1].value).toBeCloseTo(0.15, 1);
    expect(f.params[2].value).toBeCloseTo(2, 1);
    expect(f.params[3].value).toBeCloseTo(0.5, 1);
  });

  it('Bereich: nur Punkte im gewählten Fitbereich zählen', () => {
    const pts: Pt[] = grid(0, 10, 11).map((x) => ({ x, y: x < 5 ? 2 * x : 100 }));
    const f = fitModel(model('prop'), pts, { range: [0, 4] });
    expect(f.ok && f.params[0].value).toBeCloseTo(2, 10);
    expect(f.ok && f.n).toBe(5);
  });

  it('Randfälle: zu wenige Punkte, NaN, konstante Daten', () => {
    const few = fitModel(model('decay'), [{ x: 0, y: 1 }, { x: 1, y: 0.5 }]);
    expect(!few.ok && few.error).toMatch(/Zu wenige Punkte im Bereich \(n = 2, nötig ≥ 4\)/);
    const withNaN = fitModel(model('line'), [{ x: 0, y: 0 }, { x: 1, y: NaN }, { x: 2, y: 4 }, { x: 3, y: 6 }]);
    expect(withNaN.ok && withNaN.n).toBe(3);
    const flat = fitModel(model('decay'), grid(0, 5, 20).map((x) => ({ x, y: 3 })));
    expect(flat.ok === false || flat.reliable === false || Number.isFinite(flat.r2) === false || flat.r2 <= 1).toBe(true);
  });
});

describe('Messunsicherheit', () => {
  it('Güteklasse 1,5 bei 10 V → 0,15 V; mit Ablesefehler quadratisch addiert', () => {
    expect(sigmaOf({ mode: 'class', cls: 1.5, range: 10 }, 4)).toBeCloseTo(0.15, 10);
    expect(sigmaOf({ mode: 'class', cls: 1.5, range: 10, read: 0.2 }, 4)).toBeCloseTo(Math.hypot(0.15, 0.2), 10);
  });
  it('Digitalschritt, fester Wert, Poisson, unbekannt', () => {
    expect(sigmaOf({ mode: 'digits', steps: 2, decimals: 2 }, 12.34)).toBeCloseTo(0.02, 10);
    expect(sigmaOf({ mode: 'abs', value: 0.5 }, 3)).toBe(0.5);
    expect(sigmaOf({ mode: 'poisson' }, 100)).toBe(10);
    expect(sigmaOf({ mode: 'none' }, 1)).toBeNull();
    expect(sigmaOf(undefined, 1)).toBeNull();
    expect(sigmaOf({ mode: 'abs', value: 0 }, 1)).toBeNull();
  });
  it('Beschreibung in Klartext', () => {
    expect(describeUncertainty({ mode: 'class', cls: 1.5, range: 10 }, 'V')).toBe('Klasse 1,5 bei 10 V');
  });
});

describe('abgeleitete Größen', () => {
  const xs = grid(0, 2 * Math.PI, 400);
  it('Ableitung von sin ist cos (Rand einseitig, innen zentral)', () => {
    const d = derivative(xs.map((x) => ({ x, y: Math.sin(x) })));
    for (const i of [5, 100, 200, 300]) expect(d[i]).toBeCloseTo(Math.cos(xs[i]), 3);
    expect(d[0]).toBeCloseTo(1, 1);
  });
  it('Integral: Konstante und Gerade analytisch', () => {
    expect(integral(grid(0, 4, 5).map((x) => ({ x, y: 3 }))).at(-1)).toBeCloseTo(12, 10);
    expect(integral(grid(0, 4, 41).map((x) => ({ x, y: 2 * x }))).at(-1)).toBeCloseTo(16, 10);
    expect(integral([])).toEqual([]);
  });

  it('Parser: Rangfolge, Klammern, Potenz rechtsassoziativ, Vorzeichen, Funktionen, Dezimalkomma', () => {
    const ev = (s: string, v: Record<string, number> = {}) => parseExpression(s).eval(v);
    expect(ev('2+3*4')).toBe(14);
    expect(ev('(2+3)*4')).toBe(20);
    expect(ev('2^3^2')).toBe(512);
    expect(ev('-2^2')).toBe(-4);
    expect(ev('10-4-3')).toBe(3);
    expect(ev('sqrt(16)+abs(-2)')).toBe(6);
    expect(ev('1,5*2')).toBe(3);
    expect(ev('U*I', { U: 4, I: 0.5 })).toBe(2);
    expect(ev('Gerät_1/Gerät_2', { Gerät_1: 9, Gerät_2: 3 })).toBe(3);
    expect(Number.isNaN(ev('1/0'))).toBe(true);
    expect(parseExpression('a*b+a').vars.sort()).toEqual(['a', 'b']);
  });

  it('Parser: Fehler mit Stelle, keine Code-Ausführung', () => {
    expect(() => parseExpression('2*(3+')).toThrow(ParseError);
    expect(() => parseExpression('2 $ 3')).toThrow(/Stelle 3/);
    expect(() => parseExpression('foo(2)')).toThrow(/Unbekannte Funktion/);
    expect(() => parseExpression('')).toThrow(/Bitte eine Formel/);
    expect(() => parseExpression('2 3')).toThrow(ParseError);
    for (const evil of ['constructor("alert(1)")()', 'process.exit()', 'this', '__proto__']) {
      let value: number | null = null;
      try { value = parseExpression(evil).eval({}); } catch { /* ParseError ist erwünscht */ }
      expect(value === null || Number.isNaN(value)).toBe(true);
    }
  });

  it('Fehlerfortpflanzung U/I stimmt mit der analytischen Formel überein', () => {
    const U = 6, I = 0.3, sU = 0.15, sI = 0.01;
    const r = evalWithError(parseExpression('U/I'), { U, I }, { U: sU, I: sI });
    expect(r.value).toBeCloseTo(20, 10);
    expect(r.sigma).toBeCloseTo((U / I) * Math.hypot(sU / U, sI / I), 5);
  });
  it('Fehlt eine σ, zählt die Größe als exakt; fehlen alle, ist σ unbekannt', () => {
    const e = parseExpression('U*I');
    expect(evalWithError(e, { U: 2, I: 3 }, { U: 0.1, I: null }).sigma).toBeCloseTo(0.3, 6);
    expect(evalWithError(e, { U: 2, I: 3 }, { U: null, I: null }).sigma).toBeNull();
  });
});
