import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, parseShares, summarize, type SharedResult } from '../src/analysis/classview';

const r = (group: string, value: number, sigma: number | null = 0.1): SharedResult => ({ tpl: 'fadenpendel', group, lines: [{ label: 'Fallbeschleunigung g', unit: 'm/s²', value, sigma }] });

describe('Klassenansicht: Codes', () => {
  it('Code ist umkehrbar, auch mit Umlauten und Sonderzeichen', () => {
    const x: SharedResult = { tpl: 'kond-entladen', group: 'Gruppe Ä/Ö ü ß', lines: [{ label: 'Kapazität C', unit: 'µF', value: 4700.5, sigma: 12 }, { label: 'τ', unit: 's', value: 4.7, sigma: null }] };
    expect(decodeShare(encodeShare(x))).toEqual(x);
  });
  it('findet Codes in eingefügtem Text und Links, doppelte Gruppen zählen einmal', () => {
    const a = encodeShare(r('A', 9.8)), b = encodeShare(r('B', 9.7)), a2 = encodeShare(r('A', 9.9));
    const got = parseShares(`Hallo\n${a}\nhttps://x.de/#pmw=${b} ${a2}`);
    expect(got.map((g) => g.group).sort()).toEqual(['A', 'B']);
    expect(got.find((g) => g.group === 'A')!.lines[0].value).toBe(9.9);
  });
  it('ungültige oder bösartige Eingaben ergeben null, nie eine Ausnahme', () => {
    for (const bad of ['', 'PMW1.', 'PMW1.@@@', 'PMW1.' + btoa('kein json'), 'PMW1.' + btoa('[1,2,3]'), 'PMW1.' + btoa('["a","b",[["x","y","z",1]]]'), 'PMW1.' + btoa('["a","b",[]]')]) {
      expect(decodeShare(bad)).toBeNull();
    }
    expect(decodeShare('PMW1.' + 'A'.repeat(5000))).toBeNull();
    const proto = 'PMW1.' + btoa('["__proto__","constructor",[["l","u",1,-5]]]').replace(/=+$/, '');
    expect(decodeShare(proto)?.lines[0].sigma).toBeNull(); // negative σ wird verworfen
  });
});

describe('Klassenansicht: Zusammenfassung', () => {
  it('Mittelwert, Standardabweichung, Standardfehler und gewichteter Mittelwert', () => {
    const s = summarize([r('A', 9.6, 0.1), r('B', 9.8, 0.1), r('C', 10.0, 0.2)])[0];
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(9.8, 10);
    expect(s.sd).toBeCloseTo(0.2, 10);
    expect(s.sem).toBeCloseTo(0.2 / Math.sqrt(3), 10);
    // Gewichte 100, 100, 25 → (960+980+250)/225
    expect(s.weighted!.value).toBeCloseTo(2190 / 225, 8);
    expect(s.weighted!.sigma).toBeCloseTo(Math.sqrt(1 / 225), 8);
  });
  it('findet einen Ausreißer erst ab vier Gruppen und nennt die Gruppe', () => {
    expect(summarize([r('A', 9.8), r('B', 9.7), r('C', 14)])[0].outliers).toEqual([]);
    const s = summarize([r('A', 9.8), r('B', 9.7), r('C', 9.9), r('D', 9.75), r('E', 14)])[0];
    expect(s.outliers).toEqual(['E']);
  });
  it('eine Gruppe allein: keine Streuung', () => {
    const s = summarize([r('A', 9.8, null)])[0];
    expect(s.sd).toBeNull(); expect(s.weighted).toBeNull(); expect(s.mean).toBe(9.8);
  });
});
