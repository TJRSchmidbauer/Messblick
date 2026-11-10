import { describe, expect, it } from 'vitest';
import { buildAnalogCalibration, readAnalog } from '../src/readers/analog';
import { createFrame, drawAnalogDial } from '../src/core/synth';

const PIVOT = { x: 160, y: 170 };
const R = 100;
const deg = (d: number) => (d * Math.PI) / 180;
// Skala 0..10 V: 0 bei 135° (links unten), 10 bei 45° (rechts unten), über oben (großer Bogen, 270°)
const A0 = deg(135), A1 = deg(45);
const cal = () =>
  buildAnalogCalibration(
    {
      pivot: PIVOT,
      p1: { x: PIVOT.x + Math.cos(A0) * R, y: PIVOT.y + Math.sin(A0) * R },
      v1: 0,
      p2: { x: PIVOT.x + Math.cos(A1) * R, y: PIVOT.y + Math.sin(A1) * R },
      v2: 10,
    },
    true,
  );

describe('Analog-Reader', () => {
  it('liest Werte über die ganze Skala auf ±1 % genau', () => {
    const c = cal();
    for (const v of [0, 1.3, 2.5, 5, 7.7, 9, 10]) {
      // Winkel für v: von 135° über 180°, 270° (oben) nach 405° (=45°)
      const theta = deg(135 + (270 * v) / 10);
      const f = createFrame(320, 320, 245);
      drawAnalogDial(f, PIVOT.x, PIVOT.y, R, theta, { ticks: { from: deg(135), to: deg(405), count: 10 } });
      const r = readAnalog(f, c);
      expect(r.value).not.toBeNull();
      expect(Math.abs((r.value as number) - v)).toBeLessThan(0.1);
      expect(r.confidence).toBeGreaterThan(0.6);
    }
  });

  it('kleiner Bogen: Richtung wird beachtet', () => {
    const c = buildAnalogCalibration(
      { pivot: PIVOT, p1: { x: PIVOT.x - 90, y: PIVOT.y - 90 }, v1: 0, p2: { x: PIVOT.x + 90, y: PIVOT.y - 90 }, v2: 100 },
      false,
    );
    const f = createFrame(320, 320, 245);
    drawAnalogDial(f, PIVOT.x, PIVOT.y, 120, deg(-90)); // genau oben = Mitte
    expect(Math.abs((readAnalog(f, c).value as number) - 50)).toBeLessThan(1);
  });

  it('helles Zeigerbild auf dunklem Grund mit pointerDark=false', () => {
    const c = { ...cal(), pointerDark: false };
    const f = createFrame(320, 320, 30);
    drawAnalogDial(f, PIVOT.x, PIVOT.y, R, deg(270), { pointerGray: 240 });
    expect(Math.abs((readAnalog(f, c).value as number) - 5)).toBeLessThan(0.1);
  });

  it('leeres Bild hat niedrige Confidence', () => {
    const r = readAnalog(createFrame(320, 320, 200), cal());
    expect(r.confidence).toBeLessThan(0.2);
  });
});

describe('Bogen automatisch erkennen', () => {
  it('270°-Skala (wie die Demo): Zeiger oben → großer Bogen', async () => {
    const { guessBigArc } = await import('../src/readers/analog');
    const raw = { pivot: PIVOT, p1: { x: PIVOT.x + Math.cos(A0) * R, y: PIVOT.y + Math.sin(A0) * R }, v1: 0, p2: { x: PIVOT.x + Math.cos(A1) * R, y: PIVOT.y + Math.sin(A1) * R }, v2: 10 };
    for (const v of [2, 5, 8]) {
      const f = createFrame(320, 320, 245);
      drawAnalogDial(f, PIVOT.x, PIVOT.y, R, deg(135 + (270 * v) / 10), { ticks: { from: deg(135), to: deg(405), count: 10 } });
      expect(guessBigArc(f, raw), String(v)).toBe(true);
    }
  });
});
