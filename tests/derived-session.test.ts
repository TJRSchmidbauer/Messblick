import { describe, expect, it } from 'vitest';
import { Session, seriesOf, tableOf } from '../src/session/session';

function demo(): Session {
  const s = new Session();
  s.addChannel({ id: 'k1', name: 'Gerät 1', unit: 'V', uncertainty: { mode: 'class', cls: 1.5, range: 10 } });
  s.addChannel({ id: 'k2', name: 'Gerät 2', unit: 'A', uncertainty: { mode: 'abs', value: 0.01 } });
  for (let i = 0; i <= 10; i++) s.addSample(i, { k1: { v: 2 * i, c: 1 }, k2: { v: 0.5, c: 0.9 } });
  return s;
}

describe('abgeleitete Kanäle in der Sitzung', () => {
  it('Formelkanal: Wert, Unsicherheit aus den Quellkanälen, Sicherheit = kleinste Eingangssicherheit', () => {
    const s = demo();
    s.addChannel({ id: 'd1', name: 'Leistung', unit: 'W', derived: { kind: 'formula', expr: 'Gerät_1*Gerät_2' } });
    expect(s.recompute()).toEqual({});
    const cell = s.samples[4].values.d1;
    expect(cell.v).toBeCloseTo(4, 10);
    expect(cell.c).toBeCloseTo(0.9, 10);
    expect(cell.s).toBeCloseTo(Math.hypot(0.5 * 0.15, 8 * 0.01), 5);
    const pts = s.series('t', 'd1');
    expect(pts).toHaveLength(11);
    expect(pts[4].sy).toBeCloseTo(cell.s!, 10);
  });

  it('Messunsicherheit des Geräts liefert σ_y der Reihe; ohne Angabe fehlt sy', () => {
    const s = demo();
    expect(s.series('t', 'k1')[3].sy).toBeCloseTo(0.15, 10);
    expect(seriesOf(s.samples, 't', 'k1')[3].sy).toBeUndefined();
  });

  it('Ableitung und Integral über die Zeit', () => {
    const s = demo();
    s.addChannel({ id: 'd1', name: 'Rate', unit: 'V/s', derived: { kind: 'derivative', of: 'k1' } });
    s.addChannel({ id: 'd2', name: 'Fläche', unit: 'V·s', derived: { kind: 'integral', of: 'k1' } });
    s.recompute();
    expect(s.samples[5].values.d1.v).toBeCloseTo(2, 10);
    expect(s.samples[10].values.d2.v).toBeCloseTo(100, 10); // ∫ 2t dt von 0 bis 10
  });

  it('Formel mit Fehlern meldet verständlich und ändert nichts an den Messwerten', () => {
    const s = demo();
    s.addChannel({ id: 'd1', name: 'X', unit: '', derived: { kind: 'formula', expr: 'Gerät_9*2' } });
    s.addChannel({ id: 'd2', name: 'Y', unit: '', derived: { kind: 'formula', expr: '2*(' } });
    s.addChannel({ id: 'd3', name: 'Z', unit: '', derived: { kind: 'formula', expr: 'Gerät_1/(Gerät_1-Gerät_1)' } });
    const problems = s.recompute();
    expect(problems.d1).toMatch(/Unbekannte Größe: Gerät_9/);
    expect(problems.d2).toMatch(/endet zu früh/);
    expect(problems.d3).toMatch(/11 Punkt\(e\) nicht berechenbar/);
    expect(s.samples[3].values.k1.v).toBe(6);
  });

  it('abgeleitete Werte stehen in der Tabelle und damit in den Exporten; Neuberechnung nach Korrektur', () => {
    const s = demo();
    s.addChannel({ id: 'd1', name: 'Leistung', unit: 'W', derived: { kind: 'formula', expr: 'Gerät_1*Gerät_2' } });
    s.recompute();
    expect(tableOf(s.channels, s.samples).header).toEqual(['Zeit / s', 'Gerät 1 / V', 'Gerät 2 / A', 'Leistung / W']);
    expect(tableOf(s.channels, s.samples).rows[4][3]).toBeCloseTo(4, 10);
    s.setValue(4, 'k1', 10);
    s.recompute();
    expect(s.samples[4].values.d1.v).toBeCloseTo(5, 10);
  });

  it('Kanal entfernen: abgeleitete Werte verschwinden aus den Messpunkten', () => {
    const s = demo();
    s.addChannel({ id: 'd1', name: 'L', unit: '', derived: { kind: 'formula', expr: 'Gerät_1*Gerät_2' } });
    s.recompute();
    s.removeChannel('d1');
    expect(s.samples[0].values.d1).toBeUndefined();
  });

  it('rescale: Bereich [von, bis) wird umgerechnet, σ mit, Rest bleibt; zweimal gegenläufig stellt den Ausgangszustand her', () => {
    const s = demo();
    const before = s.samples.map((x) => x.values.k1.v);
    s.rescale('k1', 6, 9, 0.1);
    expect(s.samples[5].values.k1.v).toBe(before[5]);
    expect(s.samples[6].values.k1.v).toBeCloseTo(before[6]! * 0.1, 12);
    expect(s.samples[8].values.k1.v).toBeCloseTo(before[8]! * 0.1, 12);
    expect(s.samples[9].values.k1.v).toBe(before[9]);
    s.rescale('k1', 6, 9, 10);
    expect(s.samples.map((x) => x.values.k1.v).every((v, i) => Math.abs(v! - before[i]!) < 1e-12)).toBe(true);
  });
});
