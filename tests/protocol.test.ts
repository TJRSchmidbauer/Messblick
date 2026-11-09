import { describe, expect, it } from 'vitest';
import { buildProtocolHtml, sampleRows, type ProtocolData } from '../src/export/protocol';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const base = (over: Partial<ProtocolData> = {}): ProtocolData => ({
  title: 'Entladung <Kondensator>', names: 'Gruppe A & B', date: '09.11.2026', devices: [{ name: 'Spannung U', unit: 'V', uncertainty: 'Klasse 1,5 bei 10 V' }],
  table: { header: ['Zeit / s', 'U / V'], rows: [[0, 5], [1, 3.2], [2, null]], total: 3 },
  fit: { model: 'Zerfall mit Offset', formula: 'A·e^(−x/τ) + C', params: ['τ = 2,50 ± 0,03'], stats: 'R² = 0,9987 · n = 60', warnings: [] },
  results: [{ label: 'Kapazität C = τ/R', value: '2500 ± 40 µF', lit: 'Verträglich mit dem Nennwert.', budget: 'größter Beitrag R (97 %)' }],
  notes: ['Korrektur angewendet (×0,1).'], graphImage: PNG, ...over,
});

describe('Protokoll-HTML', () => {
  it('enthält alle sieben Abschnitte in fester Reihenfolge', () => {
    const html = buildProtocolHtml(base());
    const heads = [...html.matchAll(/<h2>(\d)\. ([^<]+)<\/h2>/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(heads).toEqual(['1 Fragestellung', '2 Aufbau', '3 Durchführung', '4 Messwerte', '5 Auswertung', '6 Fehlerbetrachtung', '7 Fazit']);
  });
  it('Freitextfelder sind leer und bearbeitbar', () => {
    const html = buildProtocolHtml(base());
    expect([...html.matchAll(/class="blank" contenteditable="true"[^>]*><\/div>/g)].length).toBeGreaterThanOrEqual(5);
  });
  it('maskiert Eingaben (kein HTML aus Titel, Namen, Werten)', () => {
    const html = buildProtocolHtml(base({ title: '<script>alert(1)</script>', names: '"><img src=x onerror=1>' }));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/);
    expect(html).toContain('&lt;script&gt;');
  });
  it('lädt nichts nach: keine Skripte, keine http(s)-Adressen, nur data:-Bilder', () => {
    const html = buildProtocolHtml(base({ setupImage: PNG, seriesImage: PNG }));
    expect(html).not.toMatch(/<script|https?:\/\//i);
    expect((html.match(/<img /g) ?? []).length).toBe(3);
    const fremd = buildProtocolHtml(base({ graphImage: 'https://example.org/x.png', setupImage: 'javascript:alert(1)' }));
    expect(fremd).not.toMatch(/<img /);
  });
  it('Messwerttabelle: deutsche Zahlen, Lücken leer, Hinweis bei ausgewählten Zeilen', () => {
    const html = buildProtocolHtml(base());
    expect(html).toContain('<td>3,2</td>');
    expect(html).toMatch(/<td><\/td>/);
    const many = Array.from({ length: 300 }, (_, i) => [i, i * 2] as (number | null)[]);
    const big = buildProtocolHtml(base({ table: { header: ['t', 'y'], rows: many, total: 300 } }));
    expect((big.match(/<tr>/g) ?? []).length).toBeLessThan(40);
    expect(big).toContain('25 von 300 Messpunkten');
  });
  it('Ergebnis, Vergleich, Budget und Hinweise erscheinen; ohne Daten sagt es das', () => {
    const html = buildProtocolHtml(base());
    expect(html).toContain('2500 ± 40 µF');
    expect(html).toContain('Verträglich mit dem Nennwert.');
    expect(html).toContain('größter Beitrag R (97 %)');
    expect(html).toContain('Korrektur angewendet');
    expect(buildProtocolHtml(base({ table: undefined, fit: undefined, results: [], notes: [] }))).toContain('Keine Messwerte vorhanden.');
  });
  it('sampleRows: erste und letzte Zeile bleiben, Länge begrenzt', () => {
    const r = sampleRows(Array.from({ length: 100 }, (_, i) => i), 10);
    expect(r).toHaveLength(10);
    expect(r[0]).toBe(0);
    expect(r[9]).toBe(99);
    expect(sampleRows([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});
