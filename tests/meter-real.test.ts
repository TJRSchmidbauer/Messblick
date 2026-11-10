import { describe, expect, it } from 'vitest';
import { buildAnalogCalibration, guessBigArc, readAnalog } from '../src/readers/analog';
import { createFrame, drawLine, fillDisc, fillRect } from '../src/core/synth';
import type { Frame } from '../src/core/types';

/**
 * Nachbau eines Demo-Multimeters (z. B. PHYWE-Demogerät): helles Skalenfeld in dunklem Gehäuse, Drehpunkt unten
 * unter einer dunklen Abdeckung, Skala nur etwa 100° oben, Ziffern über der Skala, dünner Zeiger mit Schatten,
 * Lichtverlauf. Das Gegenteil der Demo der App (270°-Skala auf gleichmäßigem Grund).
 */
const deg = (d: number): number => (d * Math.PI) / 180;
const PIV = { x: 320, y: 300 }, R = 200;
const A0 = deg(-140), A1 = deg(-40); // 0 links oben, 10 rechts oben (100° Bogen über oben)
export function realMeter(value: number, o: { shadow?: boolean; gradient?: number; pointerGray?: number; housingInBand?: boolean } = {}): Frame {
  const f = createFrame(640, 400, 35); // dunkles Gehäuse
  fillRect(f, 70, 40, 500, 300, 238); // helles Skalenfeld
  // Skalenbogen und Striche
  for (let i = 0; i <= 50; i++) {
    const a = A0 + ((A1 - A0) * i) / 50, long = i % 5 === 0;
    drawLine(f, PIV.x + Math.cos(a) * R * (long ? 0.86 : 0.9), PIV.y + Math.sin(a) * R * (long ? 0.86 : 0.9), PIV.x + Math.cos(a) * R * 0.97, PIV.y + Math.sin(a) * R * 0.97, long ? 2.2 : 1.2, 30);
  }
  for (let k = 0; k <= 200; k++) { const a = A0 + ((A1 - A0) * k) / 200; fillDisc(f, PIV.x + Math.cos(a) * R * 0.97, PIV.y + Math.sin(a) * R * 0.97, 1, 30); }
  // Ziffern als dunkle Blöcke über den langen Strichen
  for (let i = 0; i <= 10; i += 2) { const a = A0 + ((A1 - A0) * i) / 10; fillRect(f, PIV.x + Math.cos(a) * R * 1.08 - 9, PIV.y + Math.sin(a) * R * 1.08 - 11, 18, 22, 40); }
  // Spiegelstreifen-Kante und Beschriftung „V“, Schrauben, dunkle Abdeckung des Drehpunkts (unteres Drittel)
  fillRect(f, 290, 170, 60, 34, 45);
  fillRect(f, 70, 255, 500, 85, 60);
  if (o.housingInBand) { fillRect(f, 70, 40, 60, 300, 35); fillRect(f, 510, 40, 60, 300, 35); }
  const th = A0 + ((A1 - A0) * value) / 10;
  if (o.shadow) drawLine(f, PIV.x + 6, PIV.y + 4, PIV.x + 6 + Math.cos(th + deg(2.5)) * R * 0.9, PIV.y + 4 + Math.sin(th + deg(2.5)) * R * 0.9, 4, 165);
  drawLine(f, PIV.x, PIV.y, PIV.x + Math.cos(th) * R * 0.95, PIV.y + Math.sin(th) * R * 0.95, 2, o.pointerGray ?? 25);
  if (o.gradient) {
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
      const i = (y * f.width + x) * 4, g = o.gradient * (x / f.width - 0.5);
      for (let c = 0; c < 3; c++) f.data[i + c] = Math.max(0, Math.min(255, f.data[i + c] + g));
    }
  }
  return f;
}
const raw = { pivot: PIV, p1: { x: PIV.x + Math.cos(A0) * R * 0.9, y: PIV.y + Math.sin(A0) * R * 0.9 }, v1: 0, p2: { x: PIV.x + Math.cos(A1) * R * 0.9, y: PIV.y + Math.sin(A1) * R * 0.9 }, v2: 10 };

describe('Echtes Demo-Multimeter (100°-Skala im Gehäuse)', () => {
  const c = buildAnalogCalibration(raw, false);
  it.each([0, 0.5, 2, 3.3, 5, 6.7, 8, 9.5, 10])('liest %s V auf ±0,1 V, auch mit Schatten und Lichtverlauf', (v) => {
    for (const o of [{}, { shadow: true }, { shadow: true, gradient: 60 }, { housingInBand: true, shadow: true }, { pointerGray: 110 }]) {
      const r = readAnalog(realMeter(v, o), c);
      expect(Math.abs((r.value ?? NaN) - v), `${v} ${JSON.stringify(o)} → ${r.value}`).toBeLessThan(0.1);
      expect(r.confidence, JSON.stringify(o)).toBeGreaterThan(0.4);
    }
  });
  it('erkennt den kurzen Bogen von selbst, auch wenn der Zeiger auf 0 ruht', () => {
    for (const v of [0, 0.3, 5, 10]) expect(guessBigArc(realMeter(v, { shadow: true }), raw), String(v)).toBe(false);
  });
  it('ohne Zeiger im Bild: keine sichere Ablesung', () => {
    const f = realMeter(5);
    // Zeiger übermalen
    const g = realMeter(5, { pointerGray: 238 });
    expect(readAnalog(g, c).confidence).toBeLessThan(0.4);
    expect(readAnalog(f, c).confidence).toBeGreaterThan(0.4);
  });
});
