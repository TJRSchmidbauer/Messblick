import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { Session } from '../src/session/session';
import { medianFilter } from '../src/session/smooth';
import { toCsv } from '../src/export/csv';
import { toXlsx } from '../src/export/xlsx';

function demo(): Session {
  const s = new Session();
  s.addChannel({ id: 'u', name: 'Spannung', unit: 'V' });
  s.addChannel({ id: 'i', name: 'Stromstärke', unit: 'A' });
  s.addSample(0, { u: { v: 1.5, c: 1 }, i: { v: 0.3, c: 1 } });
  s.addSample(0.5, { u: { v: 3, c: 0.9 }, i: { v: null, c: 0 } });
  s.addSample(1, { u: { v: 4.5, c: 1 }, i: { v: 0.9, c: 1 } });
  return s;
}

describe('Session', () => {
  it('Tabelle mit Einheiten im Kopf', () => {
    const t = demo().table();
    expect(t.header).toEqual(['Zeit / s', 'Spannung / V', 'Stromstärke / A']);
    expect(t.rows[1]).toEqual([0.5, 3, null]);
  });
  it('series: x über anderem Kanal, null-Punkte entfallen', () => {
    expect(demo().series('u', 'i').map((p) => [p.x, p.y])).toEqual([[1.5, 0.3], [4.5, 0.9]]);
    expect(demo().series('t', 'u')).toHaveLength(3);
  });
  it('manuelle Korrektur', () => {
    const s = demo();
    s.setValue(1, 'i', 0.6);
    expect(s.table().rows[1][2]).toBe(0.6);
  });
  it('Median-Glättung entfernt Ausreißer', () => {
    expect(medianFilter([1, 1, 99, 1, 1], 3)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('Export', () => {
  it('CSV deutsch: Semikolon, Dezimalkomma, BOM', () => {
    const csv = toCsv(demo().table(), { german: true });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe('﻿Zeit / s;Spannung / V;Stromstärke / A');
    expect(csv.split('\r\n')[1]).toBe('0;1,5;0,3');
    expect(csv.split('\r\n')[2]).toBe('0,5;3;');
  });
  it('CSV international', () => {
    expect(toCsv(demo().table()).split('\r\n')[1]).toBe('0,1.5,0.3');
  });
  it('XLSX Roundtrip', () => {
    const wb = XLSX.read(toXlsx(demo().table()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Messwerte'], { header: 1 });
    expect(rows[0]).toEqual(['Zeit / s', 'Spannung / V', 'Stromstärke / A']);
    expect(rows[1]).toEqual([0, 1.5, 0.3]);
    expect(rows[3]).toEqual([1, 4.5, 0.9]);
  });
});

import { seriesOf, tableOf } from '../src/session/session';
import { assessRegion } from '../src/quality';
import { createFrame, drawSevenSegment, fillRect } from '../src/core/synth';
import { parseState, parseCalibrationFile, calibrationFile } from '../src/storage';

describe('Reihen', () => {
  it('archive sichert die Reihe und leert die aktuelle', () => {
    const s = demo();
    s.archive('Reihe A');
    expect(s.samples).toHaveLength(0);
    expect(s.runs[0].name).toBe('Reihe A');
    expect(seriesOf(s.runs[0].samples, 't', 'u')).toHaveLength(3);
    expect(tableOf(s.runs[0].channels, s.runs[0].samples).rows).toHaveLength(3);
  });
  it('archive ohne Daten tut nichts', () => {
    const s = new Session();
    s.archive('leer');
    expect(s.runs).toHaveLength(0);
  });
  it('XLSX mit mehreren Blättern, eindeutige Namen', () => {
    const t = demo().table();
    const wb = XLSX.read(toXlsx([{ name: 'Reihe A', table: t }, { name: 'Reihe A', table: t }, { name: 'a/b:c', table: t }]), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Reihe A', 'Reihe A 2', 'a b c']);
  });
});

describe('Bildqualität', () => {
  const region = { x: 20, y: 20, w: 200, h: 80 };
  it('sauberes Bild: keine Hinweise', () => {
    const f = createFrame(260, 140, 128);
    drawSevenSegment(f, 20, 20, 200, 80, '12.34', 4);
    expect(assessRegion(f, region, { minFeature: 40 }).issues).toEqual([]);
  });
  it('einfarbige Fläche: Kontrast', () => {
    expect(assessRegion(createFrame(260, 140, 128), region, { minFeature: 40 }).issues[0]).toMatch(/Kontrast/);
  });
  it('Überbelichtung', () => {
    const f = createFrame(260, 140, 128);
    drawSevenSegment(f, 20, 20, 200, 80, '12.34', 4);
    fillRect(f, 20, 20, 200, 40, 255);
    expect(assessRegion(f, region, { minFeature: 40 }).issues.join()).toMatch(/Überbelichtet/);
  });
  it('zu klein', () => {
    const f = createFrame(260, 140, 128);
    drawSevenSegment(f, 20, 20, 200, 80, '12.34', 4);
    expect(assessRegion(f, region, { minFeature: 6 }).issues.join()).toMatch(/klein/);
  });
  it('außerhalb des Bildes', () => {
    expect(assessRegion(createFrame(50, 50), { x: 200, y: 200, w: 50, h: 50 }, { minFeature: 40 }).issues[0]).toMatch(/außerhalb/);
  });
});

describe('Speicher', () => {
  it('beschädigte Daten → null', () => {
    expect(parseState('{kaputt')).toBeNull();
    expect(parseState(null)).toBeNull();
    expect(parseState('{"version":2}')).toBeNull();
  });
  it('Kalibrierdatei Roundtrip und Fremddatei', () => {
    expect(parseCalibrationFile(calibrationFile([]))).toEqual([]);
    expect(parseCalibrationFile('{"kind":"x"}')).toBeNull();
  });
});
