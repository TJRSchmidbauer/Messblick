import type { Pt } from './types';

export interface LinearFit {
  a: number;
  b: number;
  sa: number;
  sb: number;
  /** Kovarianz von a und b (0 bei Ursprungsgerade). */
  cov: number;
  chi2: number;
  dof: number;
}

const weightsOf = (pts: Pt[]): { w: number[]; known: boolean } => {
  const known = pts.every((p) => p.sy !== undefined && p.sy > 0 && Number.isFinite(p.sy));
  return { w: pts.map((p) => (known ? 1 / (p.sy! * p.sy!) : 1)), known };
};

/**
 * Gewichtete lineare Regression y = a·x + b in geschlossener Form.
 * Mit bekannten σ gelten die Formeln direkt; ohne σ skaliert die Residuenstreuung die Unsicherheiten.
 */
export function fitLine(pts: Pt[]): LinearFit | null {
  const n = pts.length;
  if (n < 2) return null;
  const { w, known } = weightsOf(pts);
  let S = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
  pts.forEach((p, i) => { S += w[i]; Sx += w[i] * p.x; Sy += w[i] * p.y; Sxx += w[i] * p.x * p.x; Sxy += w[i] * p.x * p.y; });
  const D = S * Sxx - Sx * Sx;
  if (Math.abs(D) < 1e-300 * Math.max(1, S * Sxx)) return null;
  const a = (S * Sxy - Sx * Sy) / D, b = (Sxx * Sy - Sx * Sxy) / D;
  let chi2 = 0;
  pts.forEach((p, i) => { chi2 += w[i] * (p.y - a * p.x - b) ** 2; });
  const dof = n - 2;
  const scale = known || dof <= 0 ? 1 : chi2 / dof;
  return { a, b, sa: Math.sqrt((S / D) * scale), sb: Math.sqrt((Sxx / D) * scale), cov: (-Sx / D) * scale, chi2, dof };
}

/** Ursprungsgerade y = a·x. */
export function fitProportional(pts: Pt[]): LinearFit | null {
  const n = pts.length;
  if (n < 1) return null;
  const { w, known } = weightsOf(pts);
  let Sxx = 0, Sxy = 0;
  pts.forEach((p, i) => { Sxx += w[i] * p.x * p.x; Sxy += w[i] * p.x * p.y; });
  if (Sxx <= 0) return null;
  const a = Sxy / Sxx;
  let chi2 = 0;
  pts.forEach((p, i) => { chi2 += w[i] * (p.y - a * p.x) ** 2; });
  const dof = n - 1;
  const scale = known || dof <= 0 ? 1 : chi2 / dof;
  return { a, b: 0, sa: Math.sqrt(scale / Sxx), sb: 0, cov: 0, chi2, dof };
}
