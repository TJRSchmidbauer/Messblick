import { describe, expect, it } from 'vitest';
import { compareToLiterature } from '../src/analysis/literature';
import { parseExpression } from '../src/analysis/derive';

describe('Literaturwert-Vergleich', () => {
  it('verträglich innerhalb 2σ', () => {
    const c = compareToLiterature(6.7, 0.2, 6.626);
    expect(c.verdict).toBe('compatible');
    expect(c.z).toBeCloseTo(0.074 / 0.2, 6);
    expect(c.text).toMatch(/^Verträglich/);
  });
  it('nicht verträglich ab mehr als 2σ, mit Hinweis auf systematische Fehler', () => {
    const c = compareToLiterature(7.5, 0.2, 6.626);
    expect(c.verdict).toBe('incompatible');
    expect(c.text).toMatch(/systematische Fehler/);
    expect(c.percent).toBeCloseTo(13.19, 1);
  });
  it('σ des Literaturwerts geht quadratisch ein', () => {
    expect(compareToLiterature(10, 0.1, 10.5, 0.4).z).toBeCloseTo(0.5 / Math.hypot(0.1, 0.4), 10);
  });
  it('ohne Unsicherheit: nur Abweichung, kein Urteil', () => {
    const c = compareToLiterature(5, null, 4);
    expect(c.verdict).toBe('unknown');
    expect(c.percent).toBeCloseTo(25, 10);
    expect(c.z).toBeNull();
    expect(compareToLiterature(5, 0, 4).verdict).toBe('unknown');
  });
  it('riesige Abweichungen stehen in Zehnerpotenzen, nicht mit vielen Nullen', () => {
    expect(compareToLiterature(0, 1e-16, 6.6).text).toMatch(/6,6e\+?\d+σ|e\d+σ/);
    expect(compareToLiterature(0, 1e-16, 6.6).text).not.toMatch(/0000000/);
  });
  it('Literaturwert 0: kein Prozentwert', () => {
    expect(compareToLiterature(0.1, 0.01, 0).percent).toBeNull();
  });
});

describe('Konstante pi im Formelparser', () => {
  it('pi und π zählen als Zahl, nicht als Größe', () => {
    const e = parseExpression('2*pi*sqrt(L*C)');
    expect(e.vars.sort()).toEqual(['C', 'L']);
    expect(e.eval({ L: 1, C: 1 })).toBeCloseTo(2 * Math.PI, 10);
    expect(parseExpression('π').eval({})).toBeCloseTo(Math.PI, 10);
  });
});
