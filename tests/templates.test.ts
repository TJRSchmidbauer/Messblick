import { describe, expect, it } from 'vitest';
import { TEMPLATES, evalTemplateResults, templateById, type Template } from '../src/templates';
import { parseExpression } from '../src/analysis/derive';
import { modelById } from '../src/analysis/fit/models';

const P = (o: Record<string, [number, number]>) => Object.entries(o).map(([name, [value, sigma]]) => ({ name, value, sigma }));
const inp = (o: Record<string, number | [number, number]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? { value: v[0], relPercent: v[1] } : { value: v, relPercent: null }]));
const tpl = (id: string): Template => templateById(id)!;
const E = 1.602176634e-19;

describe('Vorlagen: Aufbau', () => {
  it('alle Ausdrücke sind gültig und verwenden nur Fitparameter oder eigene Eingaben', () => {
    for (const t of TEMPLATES) {
      const model = t.mode === 'series' ? modelById(t.series!.model)! : modelById(t.fit!)!;
      expect(model, t.id).toBeDefined();
      const names = new Set([...model.params, ...t.inputs.map((i) => i.id)]);
      for (const r of t.results) {
        for (const expr of [r.expr, r.lit?.expr].filter((e): e is string => !!e)) {
          for (const v of parseExpression(expr).vars) expect(names.has(v), `${t.id}: „${v}“ in ${expr}`).toBe(true);
        }
      }
    }
  });
  it('eindeutige Kennungen, Schritte und Geräte passend zum Modus', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(t.steps.length, t.id).toBeGreaterThan(1);
      if (t.mode === 'channels') expect(t.channels).toHaveLength(2);
      else if (!t.audio) expect(t.channels?.length, t.id).toBeGreaterThanOrEqual(1);
      if (t.mode === 'series') expect(t.series, t.id).toBeDefined(); else expect(t.fit, t.id).toBeDefined();
    }
  });
});

describe('Vorlagen: Ergebnisse stimmen mit der Physik überein', () => {
  it('Kondensator: C = τ/R, Vergleich mit Nennwert, fehlendes R wird verständlich gemeldet', () => {
    const t = tpl('kond-entladen');
    const r = evalTemplateResults(t, P({ τ: [4.7, 0.05] }), inp({ R: [1000, 1], Cnenn: 4700 }));
    expect(r[1].value).toBeCloseTo(4700, 6); // µF bei R = 1 kΩ → 4,7 s / 1000 Ω = 4,7 mF = 4700 µF
    expect(r[1].lit?.comparison.verdict).toBe('compatible');
    const none = evalTemplateResults(t, P({ τ: [4.7, 0.05] }), {});
    expect(none[0].value).toBeCloseTo(4.7, 10);
    expect(none[1].problem).toMatch(/Widerstand R/);
    expect(evalTemplateResults(t, P({ τ: [4.7, 0.05] }), inp({ R: 1000 }))[1].lit).toBeUndefined(); // kein Nennwert: kein Vergleich
  });

  it('Unsicherheitsbudget: zeigt, welche Eingabe die Unsicherheit dominiert', () => {
    const r = evalTemplateResults(tpl('spule'), P({ τ: [0.002, 0.00002] }), inp({ R: [50, 5] }));
    expect(r[1].budget?.map((b) => b.name)).toEqual(['Gesamtwiderstand R', 'τ']);
    expect(r[1].budget![0].share).toBeGreaterThan(95);
    expect(evalTemplateResults(tpl('spule'), P({ τ: [0.002, 0.00002] }), inp({ R: 50 }))[1].budget).toBeUndefined(); // nur eine Quelle: kein Budget
  });

  it('Hooke und Wärmekapazität', () => {
    expect(evalTemplateResults(tpl('hooke'), P({ a: [25, 0.5] }), inp({ Dnenn: 25 }))[0].lit?.comparison.verdict).toBe('compatible');
    // 200 W auf 1 kg Wasser: 0,0478 K/s → c = 4184 J/(kg·K)
    const r = evalTemplateResults(tpl('waermekapazitaet'), P({ a: [0.0478, 0.0005], b: [20, 0.1] }), inp({ P: 200, m: 1 }));
    expect(r[0].value).toBeCloseTo(4184, 0);
    expect(r[0].lit?.comparison.verdict).toBe('compatible');
  });

  it('Spulenfeld: μ₀ aus B/I, N und l', () => {
    // N = 500, l = 25 cm, μ₀ = 1,2566e-6: B/I = μ₀·N/l = 2,513 mT/A
    const r = evalTemplateResults(tpl('spulenfeld'), P({ a: [2.513, 0.03] }), inp({ N: 500, l: 25 }));
    expect(r[0].value).toBeCloseTo(1.2565, 3);
    expect(r[0].lit?.comparison.verdict).toBe('compatible');
    expect(evalTemplateResults(tpl('spulenfeld'), P({ a: [2.513, 0.03] }), inp({ N: 500 }))[0].problem).toMatch(/Länge/);
  });

  it('Spule: L = τ·R in mH', () => {
    const r = evalTemplateResults(tpl('spule'), P({ τ: [0.002, 0.0001] }), inp({ R: 50 }));
    expect(r[1].value).toBeCloseTo(100, 8);
    expect(r[1].sigma).toBeCloseTo(5, 6);
  });

  it('Schwingkreis: Periodendauer gegen Thomson-Formel', () => {
    const L = 10, C = 1; // mH, µF
    const omega = 1 / Math.sqrt(L * 1e-3 * C * 1e-6);
    const r = evalTemplateResults(tpl('schwingkreis'), P({ A: [3, 0.1], δ: [150, 5], ω: [omega, omega * 0.002], φ: [0, 0.01], C: [0, 0.01] }), inp({ L: [L, 2], C: [C, 5] }));
    expect(r[0].value).toBeCloseTo(2 * Math.PI * Math.sqrt(L * 1e-3 * C * 1e-6), 12);
    expect(r[0].lit?.comparison.verdict).toBe('compatible');
    expect(r[1].unit).toBe('Hz');
  });

  it('Fotoeffekt: Steigung h/e (in V je 10¹⁴ Hz) ergibt h = 6,626·10⁻³⁴ J·s', () => {
    const a = (6.62607015e-34 * 1e14) / E; // ≈ 0,414 V je 10¹⁴ Hz
    expect(a).toBeCloseTo(0.4136, 3);
    const led = (6.62607015e-34 * 299792458) / (E * 1e-9);
    expect(led).toBeCloseTo(1239.8, 0); // hc/e in V·nm
    const r = evalTemplateResults(tpl('fotoeffekt'), P({ a: [a * 1.02, a * 0.03], b: [-1.9, 0.1] }), {});
    expect(r[0].value).toBeCloseTo(6.62607015 * 1.02, 6);
    expect(r[0].lit?.comparison.verdict).toBe('compatible');
    expect(r[1].value).toBeCloseTo(1.9, 10);
  });

  it('LEDs: U_S über 1/λ (λ in nm) ergibt h', () => {
    const a = (6.62607015e-34 * 299792458) / (E * 1e-9); // V·nm
    const r = evalTemplateResults(tpl('led-planck'), P({ a: [a, a * 0.02], b: [0, 0.05] }), {});
    expect(r[0].value).toBeCloseTo(6.62607015, 6);
  });

  it('Federpendel (m in g) und Fadenpendel (l in cm)', () => {
    const D = 20, aF = (4 * Math.PI ** 2) / (1000 * D);
    expect(evalTemplateResults(tpl('federpendel'), P({ a: [aF, aF * 0.01], b: [0, 0.001] }), {})[0].value).toBeCloseTo(D, 8);
    const g = 9.81, aG = (4 * Math.PI ** 2) / (100 * g);
    const r = evalTemplateResults(tpl('fadenpendel'), P({ a: [aG, aG * 0.01], b: [0, 0.001] }), {});
    expect(r[0].value).toBeCloseTo(g, 8);
    expect(r[0].lit?.comparison.verdict).toBe('compatible');
  });

  it('Resonanzrohr: Steigung von f über 1/L (L in cm) ergibt c; Vergleich mit der Temperaturformel', () => {
    const c = 343, a = (c * 100) / 2; // f = c/(2L) mit L in cm: f = (c·100/2)·(1/L)
    const r = evalTemplateResults(tpl('resonanzrohr-offen'), P({ a: [a * 1.01, a * 0.02], b: [3, 5] }), inp({ theta: 20 }));
    expect(r[0].value).toBeCloseTo(c * 1.01, 8);
    expect(r[0].lit?.value).toBeCloseTo(331.3 + 0.606 * 20, 8);
    expect(r[0].lit?.comparison.verdict).toBe('compatible');
    expect(evalTemplateResults(tpl('resonanzrohr-geschlossen'), P({ a: [c * 100 / 4, 10], b: [0, 1] }), {})[0].value).toBeCloseTo(c, 8);
    expect(evalTemplateResults(tpl('saite'), P({ a: [20000, 100], b: [0, 1] }), {})[0].value).toBeCloseTo(400, 8);
  });

  it('Stimmgabel und Schallpegel-Abstandsgesetz', () => {
    const s = evalTemplateResults(tpl('stimmgabel'), P({ a: [0.01, 0.005], b: [440.2, 0.1] }), inp({ fnenn: 440 }));
    expect(s[0].value).toBeCloseTo(440.2, 8);
    expect(s[0].lit?.comparison.verdict).toBe('compatible');
    // −20·lg r: je ln-Einheit −8,686 dB → n = 2
    const p = evalTemplateResults(tpl('schallpegel-abstand'), P({ a: [-20 / Math.LN10, 0.3], b: [70, 1] }), {});
    expect(p[0].value).toBeCloseTo(2, 5);
    expect(p[0].lit?.comparison.verdict).toBe('compatible');
  });

  it('Ohm, Zerfall, Abkühlung', () => {
    expect(evalTemplateResults(tpl('ohm'), P({ a: [100.4, 0.5] }), inp({ Rnenn: 100 }))[0].lit?.comparison.verdict).toBe('compatible');
    const z = evalTemplateResults(tpl('zerfall'), P({ A: [500, 5], τ: [100, 2], C: [3, 0.5] }), {});
    expect(z[0].value).toBeCloseTo(100 * Math.LN2, 10);
    expect(z[0].sigma).toBeCloseTo(2 * Math.LN2, 7);
    const k = evalTemplateResults(tpl('abkuehlung'), P({ A: [60, 1], τ: [600, 10], C: [30, 1] }), inp({ Traum: 21 }));
    expect(k[1].lit?.comparison.verdict).toBe('incompatible');
  });

  it('nicht verträglicher Wert wird als solcher gemeldet (z. B. h um 20 % daneben)', () => {
    const a = (6.62607015e-34 * 1e14) / E;
    const r = evalTemplateResults(tpl('fotoeffekt'), P({ a: [a * 1.2, a * 0.02], b: [-1, 0.1] }), {});
    expect(r[0].lit?.comparison.verdict).toBe('incompatible');
    expect(r[0].lit?.comparison.text).toMatch(/systematische Fehler/);
  });
});
