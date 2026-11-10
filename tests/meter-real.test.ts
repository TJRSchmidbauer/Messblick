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

describe('Verdeckter Drehpunkt', () => {
  it('Drehpunkt aus drei Skalenstrichen, auch mit ungenauen Klicks', async () => {
    const { pivotFromScale, pivotMismatch } = await import('../src/readers/analog');
    const on = (a: number, r = R * 0.9, jx = 0, jy = 0) => ({ x: PIV.x + Math.cos(a) * r + jx, y: PIV.y + Math.sin(a) * r + jy });
    const exact = pivotFromScale(on(A0), on(deg(-90)), on(A1))!;
    expect(Math.hypot(exact.x - PIV.x, exact.y - PIV.y)).toBeLessThan(1e-6);
    // Klicks um 2–3 Bildpunkte daneben: Ablesung bleibt auf ±0,5 V (5 %) bei kleiner Skala
    const p = pivotFromScale(on(A0, R * 0.9, 2, -3), on(deg(-95), R * 0.9, -3, 2), on(A1, R * 0.9, 3, 2))!;
    const c = buildAnalogCalibration({ pivot: p, p1: on(A0), v1: 0, p2: on(A1), v2: 10 }, false);
    for (const v of [0, 3, 5, 7, 10]) expect(Math.abs((readAnalog(realMeter(v, { shadow: true }), c).value ?? NaN) - v), String(v)).toBeLessThan(0.5); // kleine Skala (180 px): je größer im Bild, desto genauer
    expect(pivotFromScale(on(A0), { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
    expect(pivotFromScale({ x: 0, y: 0 }, { x: 50, y: 0.0001 }, { x: 100, y: 0 })).toBeNull();
    // Warnung: Klick aufs sichtbare Zeigerende statt auf den verdeckten Drehpunkt
    expect(pivotMismatch({ pivot: PIV, p1: on(A0), v1: 0, p2: on(A1), v2: 10 })).toBeLessThan(0.01);
    expect(pivotMismatch({ pivot: { x: PIV.x - 60, y: PIV.y - 40 }, p1: on(A0), v1: 0, p2: on(A1), v2: 10 })).toBeGreaterThan(0.15);
  });
});

describe('Roter Zeiger zwischen schwarzer Beschriftung (Schulmessgerät)', () => {
  /** Weißes Skalenblatt, schwarzer Buchstabe „V“ und Skalenstriche, dünner roter Zeiger, Drehpunkt unter dem Fenster. */
  const redMeter = (value: number): Frame => {
    const f = createFrame(640, 400, 235);
    for (let i = 0; i <= 50; i++) {
      const a = A0 + ((A1 - A0) * i) / 50, long = i % 10 === 0;
      drawLine(f, PIV.x + Math.cos(a) * R * (long ? 0.93 : 0.96), PIV.y + Math.sin(a) * R * (long ? 0.93 : 0.96), PIV.x + Math.cos(a) * R * 1.02, PIV.y + Math.sin(a) * R * 1.02, long ? 3 : 1.3, 20);
    }
    // dicker schwarzer Buchstabe mitten im Zeigerbereich (senkrecht über dem Drehpunkt, etwa bei der Skalenmitte)
    fillRect(f, PIV.x - 14, PIV.y - 0.62 * R, 8, 70, 15); fillRect(f, PIV.x + 6, PIV.y - 0.62 * R, 8, 70, 15); drawLine(f, PIV.x - 12, PIV.y - 0.62 * R + 60, PIV.x, PIV.y - 0.62 * R + 72, 8, 15);
    const th = A0 + ((A1 - A0) * value) / 10;
    // roter Zeiger: Farbe schreiben
    for (let r = 0.3 * R; r <= 0.95 * R; r += 0.5) {
      for (const w of [-0.6, 0, 0.6]) {
        const x = Math.round(PIV.x + Math.cos(th) * r - Math.sin(th) * w), y = Math.round(PIV.y + Math.sin(th) * r + Math.cos(th) * w);
        const i = (y * f.width + x) * 4; f.data[i] = 230; f.data[i + 1] = 50; f.data[i + 2] = 50;
      }
    }
    return f;
  };
  it('nach Helligkeit rastet der Leser auf den Buchstaben ein, nach Farbe liest er den Zeiger', async () => {
    const { guessRedPointer } = await import('../src/readers/analog');
    const dark = buildAnalogCalibration(raw, false, true, false), red = buildAnalogCalibration(raw, false, true, true);
    for (const v of [1, 2.5, 7, 9]) {
      const f = redMeter(v);
      const rr = readAnalog(f, red);
      expect(Math.abs((rr.value ?? NaN) - v), `rot ${v}`).toBeLessThan(0.15);
      expect(rr.confidence).toBeGreaterThan(0.6);
      expect(guessRedPointer(f, dark)).toBe(true);
    }
    // Zeiger auf der Skalenmitte würde den Buchstaben verdecken: dann sieht der Helligkeitsleser den Buchstaben, nicht den Zeiger
    const away = redMeter(2);
    expect(Math.abs((readAnalog(away, dark).value ?? 0) - 2)).toBeGreaterThan(0.5);
    // schwarzer Zeiger ohne Rot: kein roter Zeiger erkannt
    expect(guessRedPointer(realMeter(5), dark)).toBe(false);
  });
});

describe('Drehpunkt aus den Zeigerlinien (roter Zeiger, Drehpunkt hinter der Frontplatte)', () => {
  it('findet den Drehpunkt auf wenige Bildpunkte genau, wenn der Zeiger über einen Bereich läuft; warnt bei zu kleinem Bereich', async () => {
    const { needleLineRed, pivotFromLines } = await import('../src/readers/analog');
    // Drehpunkt weit von der Skalenmitte entfernt (wie bei den Schulmessgeräten: Skalenbogen nicht konzentrisch)
    const pivot = { x: 330, y: 340 };
    const frameAt = (deg: number): Frame => {
      const f = createFrame(640, 400, 236); const th = deg * Math.PI / 180;
      for (let r = 120; r <= 230; r += 0.4) for (const w of [-0.7, 0, 0.7]) {
        const x = Math.round(pivot.x + Math.cos(th) * r - Math.sin(th) * w), y = Math.round(pivot.y + Math.sin(th) * r + Math.cos(th) * w);
        const i = (y * f.width + x) * 4; f.data[i] = 225; f.data[i + 1] = 60; f.data[i + 2] = 60;
      }
      // schwarze Beschriftung im selben Fenster stört nicht
      fillRect(f, 300, 150, 12, 60, 10);
      return f;
    };
    const box = { x: 150, y: 80, w: 340, h: 280 };
    const wide = [-110, -104, -98, -92, -86, -80, -74].map((d) => needleLineRed(frameAt(d), box)!);
    expect(wide.every(Boolean)).toBe(true);
    const r = pivotFromLines(wide)!;
    expect(Math.hypot(r.pivot.x - pivot.x, r.pivot.y - pivot.y)).toBeLessThan(2);
    expect(r.spread).toBeGreaterThan(30);
    const narrow = [-91, -90.6, -90.2, -89.8].map((d) => needleLineRed(frameAt(d), box)!);
    expect(pivotFromLines(narrow)!.spread).toBeLessThan(3);
    // ohne Rot keine Gerade
    expect(needleLineRed(createFrame(640, 400, 236), box)).toBeNull();
  });
});
