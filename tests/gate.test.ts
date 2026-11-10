import { describe, expect, it } from 'vitest';
import { detectGate, stats, type GateSample } from '../src/analysis/gate';

/** Helligkeit 0,8 mit dunklen Durchgängen (0,2) zu den Zeiten `passes`, Dauer `dur`, Bildabstand `dt`, Rauschen `noise`. */
function pulses(passes: number[], dur: number, dt: number, total: number, opts: { dark?: boolean; noise?: number } = {}): GateSample[] {
  const dark = opts.dark ?? true;
  let seed = 3;
  const out: GateSample[] = [];
  for (let t = 0; t <= total + 1e-9; t += dt) {
    const inside = passes.some((p) => t >= p && t < p + dur);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = opts.noise ? ((seed >>> 24) / 255 - 0.5) * opts.noise : 0;
    out.push({ t, v: (dark ? (inside ? 0.2 : 0.8) : inside ? 0.8 : 0.2) + n });
  }
  return out;
}

describe('Lichtschranke aus der Kamera', () => {
  it('erkennt Durchgänge, Zeitabstände und jede zweite Periode', () => {
    const r = detectGate(pulses([1, 3, 5, 7, 9], 0.2, 1 / 30, 11));
    expect(r.blocks).toHaveLength(5);
    expect(r.polarity).toBe('dark');
    expect(r.intervals).toHaveLength(4);
    r.intervals.forEach((x) => expect(x).toBeCloseTo(2, 1));
    expect(r.periods).toHaveLength(3);
    r.periods.forEach((x) => expect(x).toBeCloseTo(4, 1));
  });

  it('Zeit auf unter ein Bild genau (Interpolation), Dauer des Durchgangs', () => {
    const r = detectGate(pulses([1.013, 3.013, 5.013], 0.2, 1 / 30, 7));
    expect(r.blocks[0].tIn).toBeGreaterThan(1.0);
    expect(r.blocks[0].tIn).toBeLessThan(1.05);
    expect(r.blocks[0].width).toBeGreaterThan(0.15);
    expect(r.blocks[0].width).toBeLessThan(0.25);
    expect(stats(r.intervals)!.mean).toBeCloseTo(2, 2);
  });

  it('helle Durchgänge vor dunklem Grund', () => {
    const r = detectGate(pulses([1, 2, 3], 0.1, 1 / 50, 5, { dark: false }));
    expect(r.polarity).toBe('bright');
    expect(r.blocks).toHaveLength(3);
  });

  it('verträgt Rauschen ohne Doppelzählung', () => {
    const r = detectGate(pulses([1, 2.5, 4, 5.5], 0.25, 1 / 30, 7, { noise: 0.12 }));
    expect(r.blocks).toHaveLength(4);
    r.intervals.forEach((x) => expect(x).toBeCloseTo(1.5, 1));
  });

  it('zu grobe Bildrate: Warnung, Zeiten grob', () => {
    const r = detectGate(pulses([1.05, 3.05, 5.05, 7.05], 0.2, 0.1, 9));
    expect(r.warnings.join(' ')).toMatch(/Bildrate/);
    expect(r.frameDt).toBeCloseTo(0.1, 6);
  });

  it('konstante Helligkeit, zu kurze Reihe, nur Rauschen → keine Durchgänge mit Hinweis', () => {
    expect(detectGate(pulses([], 0.1, 0.1, 5)).blocks).toEqual([]);
    expect(detectGate(pulses([], 0.1, 0.1, 5)).warnings.join(' ')).toMatch(/kaum/);
    expect(detectGate([{ t: 0, v: 1 }]).warnings.join(' ')).toMatch(/Zu wenige/);
    expect(detectGate(pulses([], 0.1, 1 / 30, 5, { noise: 0.05 })).blocks).toEqual([]);
  });

  it('ein Durchgang am Ende der Reihe (nicht beendet) zählt nicht', () => {
    const r = detectGate(pulses([1, 4.9], 0.5, 0.05, 5));
    expect(r.blocks).toHaveLength(1);
  });

  it('Reihe beginnt mitten im Durchgang: dieser unvollständige Durchgang zählt nicht', () => {
    const r = detectGate(pulses([-0.1, 2, 4], 0.3, 1 / 30, 6));
    expect(r.blocks).toHaveLength(2);
    expect(r.intervals[0]).toBeCloseTo(2, 1);
  });

  it('Statistik', () => {
    const s = stats([2, 4, 6])!;
    expect(s.mean).toBe(4);
    expect(s.std).toBeCloseTo(2, 10);
    expect(s.sem).toBeCloseTo(2 / Math.sqrt(3), 10);
    expect(stats([5])!.sem).toBeNull();
    expect(stats([])).toBeNull();
  });
});
