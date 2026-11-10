import { describe, expect, it } from 'vitest';
import { Tracker, makeTemplate, type TrackConfig } from '../src/readers/track';
import { createFrame, fillDisc, fillRect, setGray } from '../src/core/synth';
import type { Frame } from '../src/core/types';

/** Dunkle Kugel mit hellem Punkt (gute Struktur) auf Hintergrund mit Verlauf und optionalem Rauschen. */
function scene(cx: number, cy: number, opts: { gain?: number; noise?: number; seed?: number; bg?: number } = {}): Frame {
  const f = createFrame(320, 200, opts.bg ?? 200);
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) setGray(f, x, y, (opts.bg ?? 200) - 40 * (x / f.width));
  fillRect(f, 20, 150, 280, 4, 60); // Schiene als Störstruktur
  fillDisc(f, cx, cy, 10, 40);
  fillDisc(f, cx + 3, cy - 3, 4, 235);
  const gain = opts.gain ?? 1;
  let seed = opts.seed ?? 5;
  for (let i = 0; i < f.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = opts.noise ? ((seed >>> 24) / 255 - 0.5) * opts.noise : 0;
    for (let k = 0; k < 3; k++) f.data[i + k] = Math.max(0, Math.min(255, f.data[i + k] * gain + n));
  }
  return f;
}
const cfgAt = (cx: number, cy: number, extra: Partial<TrackConfig> = {}): TrackConfig => {
  const t = makeTemplate(scene(cx, cy), { x: cx - 14, y: cy - 14, w: 28, h: 28 });
  if ('error' in t) throw new Error(t.error);
  return { template: t.template, t0: 0, scale: null, ...extra };
};

describe('Markerverfolgung', () => {
  it('findet den Marker unter einem Bildpunkt genau, auch bei Rauschen', () => {
    const tr = new Tracker(cfgAt(60, 80));
    const path = [[60, 80], [72.3, 83.6], [86.8, 90.2], [102, 100], [117.5, 111.4], [130.1, 122.9]];
    path.forEach(([x, y], i) => {
      const r = tr.update(scene(x, y, { noise: 24, seed: i + 1 }), i * 0.2);
      expect(r.px!).toBeCloseTo(x, 0);
      expect(Math.abs(r.px! - x)).toBeLessThan(0.7);
      expect(Math.abs(r.py! - y)).toBeLessThan(0.7);
      expect(r.confidence).toBeGreaterThan(0.85);
    });
  });

  it('Koordinaten: Ursprung am ersten Punkt, y nach oben, Maßstab in Metern je Bildpunkt', () => {
    const tr = new Tracker(cfgAt(60, 80, { scale: 0.005 }));
    tr.update(scene(60, 80), 0);
    const r = tr.update(scene(100, 60), 0.5);
    expect(r.x!).toBeCloseTo(40 * 0.005, 2); // 0,2 m nach rechts
    expect(r.y!).toBeCloseTo(20 * 0.005, 2); // 0,1 m nach oben (Bild-y nimmt ab)
  });

  it('unempfindlich gegen Helligkeitsänderung (Beleuchtung wechselt)', () => {
    const tr = new Tracker(cfgAt(60, 80));
    tr.update(scene(60, 80), 0);
    const r = tr.update(scene(75, 85, { gain: 0.6 }), 0.2);
    expect(Math.abs(r.px! - 75)).toBeLessThan(1);
    expect(r.confidence).toBeGreaterThan(0.85);
  });

  it('folgt einer schnellen gleichförmigen Bewegung dank Vorhersage (35 Bildpunkte je Schritt)', () => {
    const tr = new Tracker(cfgAt(40, 70));
    for (let i = 0; i < 6; i++) {
      const x = 40 + 35 * i;
      const r = tr.update(scene(x, 70 + 3 * i), i * 0.1);
      expect(r.px, `Schritt ${i}`).not.toBeNull();
      expect(Math.abs(r.px! - x)).toBeLessThan(1);
    }
  });

  it('Verlust und Wiederfinden: Marker verlässt das Bild, kommt zurück', () => {
    const tr = new Tracker(cfgAt(60, 80));
    tr.update(scene(60, 80), 0);
    const empty = createFrame(320, 200, 160); // Marker weg
    expect(tr.update(empty, 0.2).px).toBeNull();
    expect(tr.update(empty, 0.4).confidence).toBeLessThan(0.6);
    const back = tr.update(scene(70, 82), 0.6);
    expect(back.px).not.toBeNull();
    expect(Math.abs(back.px! - 70)).toBeLessThan(1);
  });

  it('vor t0 keine Werte; reset beginnt wieder an der gewählten Stelle', () => {
    const tr = new Tracker(cfgAt(60, 80, { t0: 1 }));
    expect(tr.update(scene(60, 80), 0.5).x).toBeNull();
    expect(tr.update(scene(60, 80), 1).px).not.toBeNull();
    tr.update(scene(90, 80), 1.2);
    tr.reset();
    const r = tr.update(scene(62, 81), 1);
    expect(Math.abs(r.px! - 62)).toBeLessThan(1);
    expect(r.x).toBeCloseTo(0, 6); // neuer Ursprung
  });

  it('Vorlage: zu klein, zu groß, ohne Kontrast → verständliche Fehler', () => {
    const f = scene(100, 100);
    expect((makeTemplate(f, { x: 90, y: 90, w: 5, h: 5 }) as { error: string }).error).toMatch(/zu klein/);
    expect((makeTemplate(f, { x: 10, y: 10, w: 100, h: 100 }) as { error: string }).error).toMatch(/zu groß/);
    expect((makeTemplate(createFrame(100, 100, 128), { x: 10, y: 10, w: 30, h: 30 }) as { error: string }).error).toMatch(/Kontrast/);
    expect('template' in makeTemplate(f, { x: 86, y: 86, w: 28, h: 28 })).toBe(true);
  });
});

describe('Markerverfolgung: Geschwindigkeit und gleichmäßiger Lauf', () => {
  const big = (x: number, y = 200): Frame => {
    const f = createFrame(640, 360, 205);
    fillDisc(f, x, y, 14, 40);
    fillDisc(f, x + 4, y - 4, 5, 235);
    return f;
  };
  const cfg = (): TrackConfig => {
    const t = makeTemplate(big(320), { x: 296, y: 176, w: 48, h: 48 });
    if ('error' in t) throw new Error(t.error);
    return { template: t.template, t0: 0, scale: null };
  };

  it('Pendelbewegung mit 60 Bildern je Sekunde: Fehler unter 0,7 Bildpunkten, jedes Bild gefunden', () => {
    const tr = new Tracker(cfg());
    let worst = 0;
    for (let i = 0; i < 180; i++) {
      const t = i / 60, x = 320 + 80 * Math.sin((2 * Math.PI * t) / 4);
      const r = tr.update(big(x), t);
      expect(r.px, `Bild ${i}`).not.toBeNull();
      worst = Math.max(worst, Math.abs(r.px! - x));
    }
    expect(worst).toBeLessThan(0.7);
  });

  it('Rechenzeit je Bild: im Mittel unter 6 ms bei 640 × 360 und 48 × 48 Bildpunkten (vorher etwa 30 ms)', () => {
    const tr = new Tracker(cfg());
    const frames = Array.from({ length: 60 }, (_, i) => big(320 + 80 * Math.sin((2 * Math.PI * i) / 240)));
    tr.update(frames[0], 0); // Aufwärmen
    const t0 = performance.now();
    frames.forEach((f, i) => tr.update(f, (i + 1) / 60));
    const per = (performance.now() - t0) / frames.length;
    console.log(`Rechenzeit je Bild: ${per.toFixed(2)} ms`);
    expect(per).toBeLessThan(6);
  });

  it('plötzlicher Sprung um 80 Bildpunkte: wird mit großem Fenster wiedergefunden', () => {
    const tr = new Tracker(cfg());
    tr.update(big(320), 0); tr.update(big(321), 1 / 30);
    const r = tr.update(big(401, 230), 2 / 30);
    expect(r.px).not.toBeNull();
    expect(Math.abs(r.px! - 401)).toBeLessThan(1);
    expect(Math.abs(r.py! - 230)).toBeLessThan(1);
  });

  it('Video zurückgespult: Suche beginnt wieder am Startort', () => {
    const tr = new Tracker(cfg());
    tr.update(big(320), 0); tr.update(big(330), 0.5); tr.update(big(340), 1);
    const r = tr.update(big(322), 0.1); // Zeit läuft zurück
    expect(Math.abs(r.px! - 322)).toBeLessThan(1);
  });
});
