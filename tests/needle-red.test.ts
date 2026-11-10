import { describe, expect, it } from 'vitest';
import { needleLineRed } from '../src/readers/analog';

function frame(w: number, h: number, draw: (set: (x: number, y: number) => void) => void) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  draw((x, y) => { const o = (Math.round(y) * w + Math.round(x)) * 4; data[o] = 210; data[o + 1] = 30; data[o + 2] = 30; });
  return { width: w, height: h, data };
}
const box = { x: 0, y: 0, w: 200, h: 200 };

describe('needleLineRed', () => {
  it('findet einen dünnen roten Zeiger und seine Richtung', () => {
    const f = frame(200, 200, (set) => { for (let t = 0; t < 100; t += 0.5) { const x = 100 - t * Math.sin(0.2), y = 180 - t * Math.cos(0.2); set(x, y); set(x + 1, y); } });
    const l = needleLineRed(f, box)!;
    expect(l).not.toBeNull();
    expect(Math.atan2(l.dx, -l.dy) * 180 / Math.PI).toBeCloseTo(-11.5, 0);
  });
  it('ignoriert waagrechte rote Flächen (Arm, Kabel) und breite Flecken', () => {
    const arm = frame(200, 200, (set) => { for (let x = 10; x < 190; x++) for (let y = 100; y < 104; y++) set(x, y); });
    expect(needleLineRed(arm, box)).toBeNull();
    const fleck = frame(200, 200, (set) => { for (let x = 80; x < 120; x++) for (let y = 60; y < 140; y++) set(x, y); });
    expect(needleLineRed(fleck, box)).toBeNull();
  });
});
