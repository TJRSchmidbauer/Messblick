import { describe, expect, it } from 'vitest';
import { analyzeBlock, fft, noteName } from '../src/analysis/audio';

const SR = 44100, N = 8192;
const tone = (parts: [number, number][], n = N, sr = SR, noise = 0): Float64Array => {
  let seed = 11;
  return Float64Array.from({ length: n }, (_, i) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return parts.reduce((s, [f, a]) => s + a * Math.sin((2 * Math.PI * f * i) / sr), 0) + (noise ? ((seed >>> 24) / 255 - 0.5) * noise : 0);
  });
};

describe('FFT', () => {
  it('Sinus erscheint in genau einer Stützstelle mit richtiger Stärke', () => {
    const n = 1024, re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 64 * i) / n)), im = new Float64Array(n);
    fft(re, im);
    expect(Math.hypot(re[64], im[64])).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[10], im[10])).toBeLessThan(1e-8);
  });
  it('Impuls hat ein flaches Spektrum', () => {
    const re = new Float64Array(64), im = new Float64Array(64);
    re[0] = 1;
    fft(re, im);
    for (let k = 0; k < 64; k++) expect(Math.hypot(re[k], im[k])).toBeCloseTo(1, 10);
  });
});

describe('Grundfrequenz und Pegel', () => {
  it.each([440, 261.63, 1000, 82.41, 3520.5])('findet %s Hz auf unter 0,2 Hz genau', (f) => {
    const a = analyzeBlock(tone([[f, 0.5]]), SR);
    expect(Math.abs(a.freq! - f)).toBeLessThan(0.2);
    expect(a.confidence).toBeGreaterThan(0.8);
  });
  it('mit Rauschen (Rauschpegel 30 % der Amplitude)', () => {
    const a = analyzeBlock(tone([[523.25, 0.4]], N, SR, 0.25), SR);
    expect(Math.abs(a.freq! - 523.25)).toBeLessThan(0.3);
  });
  it('Pegel: Sinus der Amplitude 1 hat Effektivwert 0,707 → −3 dB; halbe Amplitude → −9 dB', () => {
    expect(analyzeBlock(tone([[440, 1]]), SR).level).toBeCloseTo(-3.01, 1);
    expect(analyzeBlock(tone([[440, 0.5]]), SR).level).toBeCloseTo(-9.03, 1);
  });
  it('Grundton mit Obertönen: stärkster Ton gilt, Obertöne stehen in den Spitzen', () => {
    const a = analyzeBlock(tone([[220, 0.5], [440, 0.2], [660, 0.1]]), SR);
    expect(Math.abs(a.freq! - 220)).toBeLessThan(0.2);
    expect(a.peaks.map((p) => Math.round(p.freq))).toEqual([220, 440, 660]);
    expect(a.peaks[0].db).toBeCloseTo(0, 6);
    expect(a.peaks[1].db).toBeLessThan(-6);
  });
  it('Gleichanteil stört nicht', () => {
    const t = tone([[300, 0.3]]);
    for (let i = 0; i < t.length; i++) t[i] += 0.4;
    expect(Math.abs(analyzeBlock(t, SR).freq! - 300)).toBeLessThan(0.2);
  });
  it('Stille und reines Rauschen ergeben keine Frequenz', () => {
    const silent = analyzeBlock(new Float64Array(N), SR);
    expect(silent.freq).toBeNull();
    expect(silent.level).toBe(-100);
    expect(analyzeBlock(tone([], N, SR, 0.5), SR).freq).toBeNull();
  });
  it('ungültige Blocklänge wird gemeldet', () => {
    expect(() => analyzeBlock(new Float64Array(1000), SR)).toThrow(/Zweierpotenz/);
  });
});

describe('Tonname', () => {
  it('A4, C4, H3, Abweichung in Cent', () => {
    expect(noteName(440)).toEqual({ name: 'A4', cents: 0 });
    expect(noteName(261.63).name).toBe('C4');
    expect(noteName(246.94).name).toBe('H3');
    expect(noteName(452).cents).toBeGreaterThan(40);
    expect(noteName(430).name).toBe('A4');
    expect(noteName(430).cents).toBeLessThan(-30);
  });
});
