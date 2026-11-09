import { invert, solve } from './linalg';
import type { Pt } from './types';

export interface LmResult {
  p: number[];
  /** Standardabweichungen der Parameter. */
  sp: number[];
  chi2: number;
  dof: number;
  iterations: number;
  converged: boolean;
}

type Fn = (x: number, p: number[]) => number;

function chiSquare(f: Fn, p: number[], pts: Pt[], w: number[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const r = pts[i].y - f(pts[i].x, p);
    s += w[i] * r * r;
  }
  return Number.isFinite(s) ? s : Infinity;
}

function jacobian(f: Fn, p: number[], pts: Pt[]): number[][] {
  return pts.map((pt) => p.map((pk, k) => {
    const h = 1e-6 * Math.max(Math.abs(pk), 1e-3);
    const hi = p.slice(), lo = p.slice();
    hi[k] = pk + h;
    lo[k] = pk - h;
    return (f(pt.x, hi) - f(pt.x, lo)) / (2 * h);
  }));
}

/**
 * Gewichtetes Levenberg–Marquardt. Mit bekannten σ_y gilt Gewicht 1/σ²; sonst Gewicht 1,
 * und die Kovarianz wird mit χ²_red skaliert (Unsicherheit aus der Streuung der Residuen).
 */
export function levenbergMarquardt(f: Fn, p0: number[], pts: Pt[], maxIter = 200): LmResult | null {
  const n = pts.length, m = p0.length;
  if (n < m) return null;
  const known = pts.every((p) => p.sy !== undefined && p.sy > 0 && Number.isFinite(p.sy));
  const w = pts.map((p) => (known ? 1 / (p.sy! * p.sy!) : 1));
  let p = p0.slice();
  let chi2 = chiSquare(f, p, pts, w);
  if (!Number.isFinite(chi2)) return null;
  let lambda = 1e-3, iterations = 0, converged = false;

  for (; iterations < maxIter; iterations++) {
    const J = jacobian(f, p, pts);
    const A: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const g = new Array<number>(m).fill(0);
    for (let i = 0; i < n; i++) {
      const r = pts[i].y - f(pts[i].x, p);
      for (let a = 0; a < m; a++) {
        g[a] += w[i] * J[i][a] * r;
        for (let b = 0; b < m; b++) A[a][b] += w[i] * J[i][a] * J[i][b];
      }
    }
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const Ad = A.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12) : v)));
      const step = solve(Ad, g);
      if (!step) { lambda *= 10; continue; }
      const pn = p.map((v, k) => v + step[k]);
      const cn = chiSquare(f, pn, pts, w);
      if (cn < chi2) {
        const rel = (chi2 - cn) / Math.max(chi2, 1e-300);
        const small = step.every((s, k) => Math.abs(s) <= 1e-9 * (Math.abs(p[k]) + 1e-9));
        p = pn; chi2 = cn; lambda = Math.max(lambda / 10, 1e-12); improved = true;
        if (rel < 1e-12 || small) converged = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved) { converged = true; break; } // kein Schritt verbessert mehr: Minimum erreicht
    if (converged) break;
  }

  const J = jacobian(f, p, pts);
  const H: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++) for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) H[a][b] += w[i] * J[i][a] * J[i][b];
  const cov = invert(H);
  const dof = n - m;
  const scale = known || dof <= 0 ? 1 : chi2 / dof;
  if (!cov) return { p, sp: p.map(() => NaN), chi2, dof, iterations, converged: false };
  const sp = p.map((_, k) => Math.sqrt(Math.max(0, cov[k][k] * scale)));
  return { p, sp, chi2, dof, iterations, converged: converged && sp.every(Number.isFinite) };
}
