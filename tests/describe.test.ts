import { describe, expect, it } from 'vitest';
import { analyzeShape, announcePoint, describeSeries, frequencyFor, num, sonificationSchedule, type DescPoint } from '../src/analysis/describe';

const curve = (f: (x: number) => number, a: number, b: number, n: number): DescPoint[] => Array.from({ length: n }, (_, i) => { const x = a + ((b - a) * i) / (n - 1); return { x, y: f(x) }; });
const O = { xName: 'Zeit', xUnit: 's', yName: 'Spannung', yUnit: 'V' };

describe('Grundform des Verlaufs', () => {
  it('steigend gleichmäßig, fallend flacher werdend, steigend steiler werdend', () => {
    expect(analyzeShape(curve((x) => 2 * x + 1, 0, 10, 30))).toMatchObject({ trend: 'rising', curve: 'steady' });
    expect(analyzeShape(curve((x) => 5 * Math.exp(-x / 2), 0, 10, 60))).toMatchObject({ trend: 'falling', curve: 'flattening' });
    expect(analyzeShape(curve((x) => x * x, 0, 10, 40))).toMatchObject({ trend: 'rising', curve: 'steepening' });
  });
  it('schwingend: Maxima und Periode', () => {
    const s = analyzeShape(curve((t) => 5 + 4 * Math.sin((2 * Math.PI * t) / 4), 0, 20, 200));
    expect(s.trend).toBe('oscillating');
    expect(s.maxima).toBe(5);
    expect(s.period).toBeCloseTo(4, 0);
  });
  it('gleichbleibend, verrauscht, zu kurz', () => {
    expect(analyzeShape(curve(() => 3, 0, 10, 20)).trend).toBe('flat');
    expect(analyzeShape(curve((x) => 3 + 0.01 * Math.sin(x * 7), 0, 10, 50)).trend).not.toBe('oscillating');
    expect(analyzeShape([{ x: 0, y: 1 }, { x: 1, y: 2 }]).trend).toBe('flat');
  });
});

describe('Beschreibung in Worten', () => {
  it('nennt Messpunkte, Bereich, Extremwerte mit Ort, Anfang und Ende, Verlauf', () => {
    const d = describeSeries(curve((t) => 5 + 4 * Math.sin((2 * Math.PI * t) / 4), 0, 20, 200), O);
    expect(d.lines[0]).toBe('Graph von Spannung über Zeit mit 200 Messpunkten. Zeit reicht von 0 s bis 20 s.');
    expect(d.lines[1]).toMatch(/liegt zwischen 1 V \(bei Zeit = [\d,]+ s\) und 9 V/);
    expect(d.text).toMatch(/schwingt auf und ab: 5 Maxima, im Mittel (3,9\d|4) s auseinander/);
  });
  it('Einheit fehlt, Fit-Satz wird angehängt, zu wenige Punkte', () => {
    const d = describeSeries(curve((x) => 2 * x, 0, 5, 10), { xName: 'Länge', xUnit: '', yName: 'Wert', yUnit: '', fit: 'Fit: a = 2.' });
    expect(d.text).toMatch(/Länge reicht von 0 bis 5\./);
    expect(d.text).toMatch(/steigt gleichmäßig/);
    expect(d.lines.at(-1)).toBe('Fit: a = 2.');
    expect(describeSeries([{ x: 1, y: 1 }], O).text).toMatch(/zu wenige Messpunkte/);
  });
  it('ignoriert ungültige Punkte und sortiert nach x', () => {
    const d = describeSeries([{ x: 2, y: 4 }, { x: NaN, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 2 }], O);
    expect(d.lines[0]).toMatch(/3 Messpunkten/);
    expect(d.lines[0]).toMatch(/von 0 s bis 2 s/);
  });
  it('Zahlenformat deutsch mit 3 gültigen Stellen', () => {
    expect(num(1234.5678)).toBe('1230');
    expect(num(0.123456)).toBe('0,123');
    expect(num(-2.5)).toBe('-2,5');
  });
  it('Ansage eines Messpunkts', () => {
    expect(announcePoint(11, 151, { x: 2.4, y: 4.57 }, O)).toBe('Messpunkt 12 von 151: Zeit = 2,4 s, Spannung = 4,57 V.');
  });
});

describe('Hörbarmachung', () => {
  it('Tonhöhe: exponentiell, unten und oben genau die Grenzen, Mitte geometrisches Mittel', () => {
    expect(frequencyFor(0, 0, 10)).toBeCloseTo(220, 6);
    expect(frequencyFor(10, 0, 10)).toBeCloseTo(880, 6);
    expect(frequencyFor(5, 0, 10)).toBeCloseTo(440, 6);
    expect(frequencyFor(-5, 0, 10)).toBeCloseTo(220, 6); // außerhalb wird begrenzt
    expect(frequencyFor(3, 3, 3)).toBeCloseTo(Math.sqrt(220 * 880), 6); // konstante Werte: mittlere Tonhöhe
  });
  it('Plan: gleichmäßig in der Zeit, Ton folgt der Kurve, unabhängig vom Punktabstand', () => {
    const pts = [...curve((x) => x, 0, 1, 5), ...curve((x) => x, 1.0001, 10, 50)]; // ungleichmäßig dicht
    const n = sonificationSchedule(pts, 4, 25);
    expect(n).toHaveLength(100);
    expect(n[0].at).toBe(0);
    expect(n[99].at).toBeCloseTo(4, 10);
    expect(n[0].freq).toBeCloseTo(220, 4);
    expect(n[99].freq).toBeCloseTo(880, 4);
    const mid = n[Math.round(99 / 2)].freq; // x ≈ 5 von 10 → Tonmitte
    expect(mid).toBeGreaterThan(400);
    expect(mid).toBeLessThan(480);
    for (let i = 1; i < n.length; i++) expect(n[i].freq).toBeGreaterThanOrEqual(n[i - 1].freq - 1e-9); // steigende Kurve → steigender Ton
  });
  it('Randfälle: zu wenige Punkte, Dauer 0, alle x gleich', () => {
    expect(sonificationSchedule([{ x: 0, y: 1 }], 3)).toEqual([]);
    expect(sonificationSchedule(curve((x) => x, 0, 1, 5), 0)).toEqual([]);
    expect(sonificationSchedule([{ x: 1, y: 1 }, { x: 1, y: 2 }], 3)).toEqual([]);
  });
});
