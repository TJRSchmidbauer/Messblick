import { fitLine, fitProportional } from './linear';
import { levenbergMarquardt } from './lm';
import { MODELS, type Model } from './models';
import type { Pt } from './types';

export interface FitParam {
  name: string;
  value: number;
  sigma: number;
}

export interface FitSuccess {
  ok: true;
  model: Model;
  params: FitParam[];
  /** Bestimmtheitsmaß (ungewichtet). */
  r2: number;
  /** χ² je Freiheitsgrad; null ohne Freiheitsgrade. */
  chi2red: number | null;
  n: number;
  dof: number;
  weighted: boolean;
  /** Verlässlich konvergiert; sonst als „nicht belastbar“ anzeigen. */
  reliable: boolean;
  residuals: { x: number; r: number }[];
  warnings: string[];
  range: [number, number];
  curve: (x: number) => number;
}
export type FitResult = FitSuccess | { ok: false; error: string };

export interface FitOptions {
  /** Nur Punkte mit x im Bereich verwenden. */
  range?: [number, number];
}

export function fitModel(model: Model, points: Pt[], opts: FitOptions = {}): FitResult {
  const warnings: string[] = [];
  let pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (opts.range) {
    const [lo, hi] = [Math.min(...opts.range), Math.max(...opts.range)];
    pts = pts.filter((p) => p.x >= lo && p.x <= hi);
  }
  if (model.positive) {
    const before = pts.length;
    pts = pts.filter((p) => p.x > 0 && p.y > 0);
    if (pts.length < before) warnings.push(`${before - pts.length} Punkt(e) mit x ≤ 0 oder y ≤ 0 ausgelassen.`);
  }
  const k = model.params.length;
  const need = k + 1;
  if (pts.length < need) {
    return { ok: false, error: `Zu wenige Punkte im Bereich (n = ${pts.length}, nötig ≥ ${need}). Bereich größer wählen.` };
  }
  const weighted = pts.every((p) => p.sy !== undefined && p.sy > 0 && Number.isFinite(p.sy));
  if (!weighted) warnings.push('Keine Messunsicherheit angegeben: Fehler der Parameter stammen aus der Streuung der Punkte.');

  let params: number[], sigmas: number[], reliable = true, chi2: number;
  if (model.linear) {
    const l = model.linear === 'line' ? fitLine(pts) : fitProportional(pts);
    if (!l) return { ok: false, error: 'Die Punkte lassen keine Ausgleichsgerade zu (alle x gleich?).' };
    params = model.linear === 'line' ? [l.a, l.b] : [l.a];
    sigmas = model.linear === 'line' ? [l.sa, l.sb] : [l.sa];
    chi2 = l.chi2;
  } else {
    let best: ReturnType<typeof levenbergMarquardt> = null;
    for (const start of model.starts(pts)) {
      const r = levenbergMarquardt(model.f, start, pts);
      if (!r) continue;
      const better = !best || (r.converged && !best.converged) || (r.converged === best.converged && r.chi2 < best.chi2);
      if (better) best = r;
    }
    if (!best) return { ok: false, error: 'Der Fit konnte nicht gestartet werden. Anderes Modell oder anderen Bereich wählen.' };
    params = best.p; sigmas = best.sp; chi2 = best.chi2; reliable = best.converged;
    if (!reliable) warnings.push('Nicht belastbar: Der Fit hat nicht sauber konvergiert. Anderes Modell oder anderen Bereich wählen.');
  }

  const dof = pts.length - k;
  if (dof <= 0) warnings.push('Keine Freiheitsgrade: Die Unsicherheit der Parameter lässt sich nicht bestimmen.');
  const f = (x: number): number => model.f(x, params);
  const meanY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let ssRes = 0, ssTot = 0;
  for (const p of pts) { ssRes += (p.y - f(p.x)) ** 2; ssTot += (p.y - meanY) ** 2; }
  const xs = pts.map((p) => p.x);
  return {
    ok: true, model, n: pts.length, dof, weighted, reliable, warnings,
    params: params.map((value, i) => ({ name: model.params[i], value, sigma: sigmas[i] })),
    r2: ssTot > 0 ? 1 - ssRes / ssTot : NaN,
    chi2red: dof > 0 ? chi2 / dof : null,
    residuals: pts.map((p) => ({ x: p.x, r: p.y - f(p.x) })),
    range: [Math.min(...xs), Math.max(...xs)],
    curve: f,
  };
}

export { MODELS };
