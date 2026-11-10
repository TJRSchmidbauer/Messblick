import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { encodeQr, qrCapacity, qrSvg } from '../src/ui/qr';

/** Rendert die Matrix als Bild (Ruhezone, Modulgröße 4) und lässt sie von jsQR lesen. */
const decode = (text: string): string | null => {
  const m = encodeQr(text), s = 4, q = 4, n = m.length + 2 * q, px = n * s;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  m.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = (((y + q) * s + dy) * px + (x + q) * s + dx) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
  }));
  return jsQR(data, px, px)?.data ?? null;
};
const rnd = (len: number): string => { let seed = len, o = ''; for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; o += String.fromCharCode(33 + (seed >>> 24) % 90); } return o; };

describe('QR-Kodierer (gegen jsQR geprüft)', () => {
  it('kurzer Text', () => { expect(decode('Hallo')).toBe('Hallo'); });
  it('alle Versionen 1 bis 20 bei voller Ausnutzung und bei Mindestlänge', () => {
    for (let v = 1; v <= 20; v++) {
      const full = rnd(qrCapacity(v));
      expect(decode(full), `Version ${v} voll`).toBe(full);
      if (v > 1) { const mid = rnd(qrCapacity(v - 1) + 1); expect(decode(mid), `Version ${v} Beginn`).toBe(mid); }
    }
  });
  it('Gruppenlink mit Code und Umlauten', () => {
    const link = 'https://tjrschmidbauer.github.io/Physikmesswererfassung/#pmw=PMW1.' + rnd(160).replace(/[^A-Za-z0-9]/g, 'x');
    expect(decode(link)).toBe(link);
    expect(decode('Größe µ ß ✓')).toBe('Größe µ ß ✓');
  });
  it('zu langer Text wird gemeldet; SVG ist gültig', () => {
    expect(() => encodeQr('x'.repeat(qrCapacity() + 1))).toThrow(/zu lang/);
    const svg = qrSvg(encodeQr('x'));
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 29 29"/);
    // Pfad zurück in eine Matrix lesen: muss der Kodierung entsprechen
    const m = encodeQr('Pfadtest 123'), back = m.map((r) => r.map(() => false));
    for (const [, x, y, w] of qrSvg(m).matchAll(/M(\d+) (\d+)h(\d+)v1/g)) for (let i = 0; i < Number(w); i++) back[Number(y) - 4][Number(x) - 4 + i] = true;
    expect(back).toEqual(m);
  });
});
