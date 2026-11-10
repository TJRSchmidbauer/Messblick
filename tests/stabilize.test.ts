import { describe, expect, it } from 'vitest';
import { Stabilizer, translateFrame } from '../src/readers/stabilize';
import { makeTemplate } from '../src/readers/track';
import { createFrame, fillDisc, fillRect, setGray } from '../src/core/synth';
import { readAnalog } from '../src/readers/analog';
import { buildAnalogCalibration } from '../src/readers/analog';
import type { Frame } from '../src/core/types';
import { luminance } from '../src/core/types';

/** Szene mit Bildanker (Schachbrett-Aufkleber), Zeigerinstrument und Verlauf; `ox, oy`: Verschiebung der ganzen Szene. */
function scene(ox = 0, oy = 0, theta = (60 * Math.PI) / 180): Frame {
  const f = createFrame(400, 260, 210);
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) setGray(f, x, y, 210 - 30 * (x / f.width));
  const X = (v: number): number => v + ox, Y = (v: number): number => v + oy;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) fillRect(f, X(30 + i * 8), Y(24 + j * 8), 8, 8, (i + j) % 2 ? 235 : 40); // Anker
  // Zeigerinstrument: Drehpunkt (250, 150), Skalenstriche, Zeiger
  fillDisc(f, X(250), Y(150), 6, 30);
  for (const a of [Math.PI * 0.75, Math.PI * 0.25]) {
    for (let r = 78; r <= 92; r++) fillDisc(f, X(250) + Math.cos(a) * r, Y(150) + Math.sin(a) * r, 1.2, 40);
  }
  for (let r = 0; r <= 80; r++) fillDisc(f, X(250) + Math.cos(theta) * r, Y(150) + Math.sin(theta) * r, 1.6, 20);
  return f;
}
const anchorCfg = () => {
  const t = makeTemplate(scene(), { x: 24, y: 18, w: 44, h: 44 });
  if ('error' in t) throw new Error(t.error);
  return { template: t.template, t0: 0, scale: null };
};
const maxDiff = (a: Frame, b: Frame, x0: number, y0: number, x1: number, y1: number): number => {
  let m = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m = Math.max(m, Math.abs(luminance(a, x, y) - luminance(b, x, y)));
  return m;
};

describe('Bild verschieben', () => {
  it('ganzzahlig: Inhalt wandert um genau (dx, dy), Rand wird fortgesetzt', () => {
    const f = scene();
    const g = translateFrame(f, 5, -3);
    expect(luminance(g, 100 + 5, 100 - 3)).toBeCloseTo(luminance(f, 100, 100), 6);
    expect(maxDiff(g, scene(5, -3), 20, 20, 380, 240)).toBeLessThan(3); // Rest: der Hintergrundverlauf bewegt sich in scene() nicht mit
  });
  it('mit Bruchteilen (bilinear): halber Bildpunkt liegt zwischen den Nachbarn', () => {
    const f = createFrame(10, 10, 0);
    fillRect(f, 5, 0, 5, 10, 200);
    const g = translateFrame(f, 0.5, 0);
    expect(luminance(g, 5, 5)).toBeCloseTo(100, 0);
    expect(luminance(g, 7, 5)).toBeCloseTo(200, 0);
  });
});

describe('Stabilisierung über einen Bildanker', () => {
  it('Verrutschen (7 / −5 Bildpunkte): Verschiebung wird erkannt, stabilisiertes Bild stimmt wieder mit dem Ausgangsbild überein', () => {
    const st = new Stabilizer(anchorCfg());
    st.apply(scene(), 0);
    const out = st.apply(scene(7, -5), 0.1);
    expect(st.shift.dx).toBeCloseTo(7, 1); // Verschiebung des Ankers gegenüber der Kalibrierung
    expect(st.shift.dy).toBeCloseTo(-5, 1);
    // Mitte der Szene (Zeiger): bis auf Unterpixel-Unschärfe gleich
    expect(maxDiff(out, scene(), 160, 80, 340, 230)).toBeLessThan(70);
    expect(st.lost).toBe(false);
  });

  it('Zeigerinstrument: Ablesung bleibt trotz Verrutschen stabil, ohne Anker nicht', () => {
    const thetaDeg = (v: number): number => (v * Math.PI) / 180;
    const cal = buildAnalogCalibration({ pivot: { x: 250, y: 150 }, p1: { x: 250 + 80 * Math.cos(thetaDeg(135)), y: 150 + 80 * Math.sin(thetaDeg(135)) }, v1: 0, p2: { x: 250 + 80 * Math.cos(thetaDeg(45)), y: 150 + 80 * Math.sin(thetaDeg(45)) }, v2: 10 }, true, true);
    const truth = readAnalog(scene(), cal).value!;
    const shifted = scene(12, 9);
    const without = readAnalog(shifted, cal).value!;
    const st = new Stabilizer(anchorCfg());
    st.apply(scene(), 0);
    const withAnchor = readAnalog(st.apply(shifted, 0.1), cal).value!;
    expect(Math.abs(without - truth)).toBeGreaterThan(0.2); // ohne Anker deutlich daneben
    expect(Math.abs(withAnchor - truth)).toBeLessThan(0.1); // mit Anker wieder genau
  });

  it('keine Verschiebung: dasselbe Bild kommt zurück (keine Kopie, kein Verlust)', () => {
    const st = new Stabilizer(anchorCfg());
    const f = scene();
    expect(st.apply(f, 0)).toBe(f);
  });

  it('Anker verdeckt: zuletzt bekannte Korrektur bleibt, lost wird gemeldet, danach wieder gefunden', () => {
    const st = new Stabilizer(anchorCfg());
    st.apply(scene(), 0);
    st.apply(scene(4, 3), 0.1);
    const cover = scene(4, 3);
    fillRect(cover, 0, 0, 120, 100, 120); // Anker überdeckt
    st.apply(cover, 0.2);
    expect(st.lost).toBe(true);
    expect(st.shift.dx).toBeCloseTo(4, 0);
    st.apply(scene(5, 3), 0.3);
    expect(st.lost).toBe(false);
    expect(st.shift.dx).toBeCloseTo(5, 0);
  });

  it('reset: wieder ohne Korrektur', () => {
    const st = new Stabilizer(anchorCfg());
    st.apply(scene(), 0);
    st.apply(scene(6, 6), 0.1);
    st.reset();
    expect(st.shift.dx).toBeCloseTo(0, 10);
    expect(st.shift.dy).toBeCloseTo(0, 10);
  });
});
