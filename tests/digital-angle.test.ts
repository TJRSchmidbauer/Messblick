import { describe, expect, it } from 'vitest';
import { createFrame, drawSevenSegment } from '../src/core/synth';
import { readDigital } from '../src/readers/digital';
import type { Frame } from '../src/core/types';

/** Dreht das ganze Bild um `deg` Grad im Uhrzeigersinn um die Mitte (Nächster-Nachbar). */
function rotate(f: Frame, deg: number): Frame {
  const out = createFrame(f.width, f.height, 215);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = f.width / 2, cy = f.height / 2;
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
    const u = x - cx, v = y - cy;
    const sx = Math.round(cx + u * c + v * s), sy = Math.round(cy - u * s + v * c);
    if (sx < 0 || sy < 0 || sx >= f.width || sy >= f.height) continue;
    const o = (y * f.width + x) * 4, q = (sy * f.width + sx) * 4;
    out.data[o] = f.data[q]; out.data[o + 1] = f.data[q + 1]; out.data[o + 2] = f.data[q + 2];
  }
  return out;
}

describe('Digitalanzeige schief im Bild: Rechteck drehen', () => {
  const base = createFrame(400, 300, 215);
  drawSevenSegment(base, 100, 110, 200, 80, '12.35', 4, { fg: 25, bg: 190 });
  const roi = { x: 100, y: 110, w: 200, h: 80 };
  for (const deg of [-12, 8, 20]) {
    it(`liest eine um ${deg}° gedrehte Anzeige mit gedrehtem Rechteck`, () => {
      const f = rotate(base, deg);
      const r = readDigital(f, { type: 'digital', roi: { ...roi, angle: deg }, digits: 4, decimals: 2, polarity: 'auto', style: 'segment' });
      expect(r.value).toBeCloseTo(12.35, 9);
    });
  }
  it('ohne Winkel liest eine um 20° gedrehte Anzeige nicht richtig (Gegenprobe)', () => {
    const r = readDigital(rotate(base, 20), { type: 'digital', roi, digits: 4, decimals: 2, polarity: 'auto', style: 'segment' });
    expect(r.value === null || Math.abs(r.value - 12.35) > 1e-6).toBe(true);
  });
  it('ohne Winkel bleibt das Lesen wie bisher', () => {
    const r = readDigital(base, { type: 'digital', roi, digits: 4, decimals: 2, polarity: 'auto', style: 'segment' });
    expect(r.value).toBeCloseTo(12.35, 9);
  });
});
