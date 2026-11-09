import { fitLine } from './linear';
import type { Pt } from './types';

export interface Model {
  id: string;
  name: string;
  /** Anzeigetext der Formel. */
  formula: string;
  params: string[];
  f: (x: number, p: number[]) => number;
  /** Geschlossene Lösung statt Iteration (Gerade, Ursprungsgerade). */
  linear?: 'line' | 'prop';
  /** Verlangt x > 0 und y > 0 (Potenz). */
  positive?: boolean;
  /** Bringt Parameter in eine eindeutige Form (z. B. Phase in (−π, π]). */
  normalize?: (p: number[]) => number[];
  /** Startwerte; mehrere Startwerte werden alle versucht, der beste Fit gewinnt. */
  starts: (pts: Pt[]) => number[][];
}

const sorted = (pts: Pt[]): Pt[] => [...pts].sort((a, b) => a.x - b.x);
const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const tail = (pts: Pt[]): number => mean(pts.slice(-Math.max(1, Math.floor(pts.length * 0.1))).map((p) => p.y));

/** Abstand bis zum Erreichen des Bruchteils `frac` der Gesamtänderung, vom ersten Punkt aus. */
function timeConstant(s: Pt[], base: number, amp: number, frac: number): number {
  const span = s[s.length - 1].x - s[0].x || 1;
  for (const p of s) if (Math.abs(p.y - base) <= Math.abs(amp) * frac) return Math.max(p.x - s[0].x, span / 100);
  return span / 3;
}

function sineStarts(pts: Pt[], damped: boolean): number[][] {
  const s = sorted(pts);
  const ys = s.map((p) => p.y);
  const C = mean(ys), A = Math.max((Math.max(...ys) - Math.min(...ys)) / 2, 1e-9);
  const L = s[s.length - 1].x - s[0].x || 1;
  let crossings = 0;
  for (let i = 1; i < s.length; i++) if ((s[i - 1].y - C) * (s[i].y - C) < 0) crossings++;
  const omega = crossings >= 1 ? (Math.PI * crossings) / L : (2 * Math.PI) / L;
  const out: number[][] = [];
  for (const phi of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const phase = phi - omega * s[0].x;
    out.push(damped ? [A, 1 / L, omega, phase, C] : [A, omega, phase, C]);
  }
  return out;
}

/** Eindeutige Form von A·sin(ω·x + φ): A > 0, ω > 0, φ in [−π, π). Gleichwertige Lösungen sehen sonst verwirrend verschieden aus. */
function canonicalWave(A: number, w: number, phi: number): { A: number; w: number; phi: number } {
  if (w < 0) { w = -w; A = -A; phi = -phi; }
  if (A < 0) { A = -A; phi += Math.PI; }
  phi = ((((phi + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return { A, w, phi };
}

export const MODELS: Model[] = [
  {
    id: 'line', name: 'Gerade', formula: 'a·x + b', params: ['a', 'b'], linear: 'line',
    f: (x, [a, b]) => a * x + b,
    starts: (pts) => { const l = fitLine(pts); return [l ? [l.a, l.b] : [1, 0]]; },
  },
  {
    id: 'prop', name: 'Proportional', formula: 'a·x', params: ['a'], linear: 'prop',
    f: (x, [a]) => a * x,
    starts: () => [[1]],
  },
  {
    id: 'decay', name: 'Zerfall mit Offset', formula: 'A·e^(−x/τ) + C', params: ['A', 'τ', 'C'],
    f: (x, [A, tau, C]) => A * Math.exp(-x / tau) + C,
    starts: (pts) => {
      const s = sorted(pts), C = tail(s), A = s[0].y - C || (Math.max(...s.map((p) => p.y)) - Math.min(...s.map((p) => p.y)));
      const tau = timeConstant(s, C, A, 1 / Math.E);
      // x-Ursprung: Modell läuft ab x = 0, daher A auf x = 0 zurückrechnen
      return [[A * Math.exp(s[0].x / tau), tau, C]];
    },
  },
  {
    id: 'saturation', name: 'Sättigung', formula: 'A·(1 − e^(−x/τ)) + C', params: ['A', 'τ', 'C'],
    f: (x, [A, tau, C]) => A * (1 - Math.exp(-x / tau)) + C,
    starts: (pts) => {
      const s = sorted(pts), C = s[0].y, A = tail(s) - C || 1;
      const tau = timeConstant(s, tail(s), A, 1 - 0.632);
      return [[A, tau, C]];
    },
  },
  {
    id: 'power', name: 'Potenz', formula: 'a·x^b', params: ['a', 'b'], positive: true,
    f: (x, [a, b]) => a * Math.pow(x, b),
    starts: (pts) => {
      const l = fitLine(pts.filter((p) => p.x > 0 && p.y > 0).map((p) => ({ x: Math.log(p.x), y: Math.log(p.y) })));
      return [l ? [Math.exp(l.b), l.a] : [1, 1]];
    },
  },
  {
    id: 'sine', name: 'Sinus mit Offset', formula: 'A·sin(ω·x + φ) + C', params: ['A', 'ω', 'φ', 'C'],
    f: (x, [A, w, phi, C]) => A * Math.sin(w * x + phi) + C,
    starts: (pts) => sineStarts(pts, false),
    normalize: ([A, w, phi, C]) => { const c = canonicalWave(A, w, phi); return [c.A, c.w, c.phi, C]; },
  },
  {
    id: 'dampedsine', name: 'Gedämpfter Sinus', formula: 'A·e^(−δ·x)·sin(ω·x + φ) + C', params: ['A', 'δ', 'ω', 'φ', 'C'],
    f: (x, [A, d, w, phi, C]) => A * Math.exp(-d * x) * Math.sin(w * x + phi) + C,
    starts: (pts) => sineStarts(pts, true),
    normalize: ([A, d, w, phi, C]) => { const c = canonicalWave(A, w, phi); return [c.A, d, c.w, c.phi, C]; },
  },
];

export const modelById = (id: string): Model | undefined => MODELS.find((m) => m.id === id);
