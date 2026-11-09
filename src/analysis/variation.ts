import { fitLine } from './fit/linear';
import type { Pt } from './fit/types';

/**
 * Parameterreihe: „eine Größe variieren“. Pro Durchgang ein Parameter p (z. B. Masse) und ein Messwert v (z. B. Periodendauer),
 * optional mit Unsicherheit. Daraus entstehen Auftragungen, bei denen ein Zusammenhang zur Geraden wird.
 */
export interface VarRow {
  p: number;
  v: number;
  /** Unsicherheit von v; null/fehlend = unbekannt. */
  s?: number | null;
}

export type Transform = 'id' | 'square' | 'inverse' | 'sqrt' | 'ln';
export const TRANSFORMS: Transform[] = ['id', 'square', 'inverse', 'sqrt', 'ln'];

/** Schreibweise einer Umrechnung für Achsenbeschriftungen. */
export function transformLabel(t: Transform, name: string): string {
  switch (t) {
    case 'id': return name;
    case 'square': return `${name}²`;
    case 'inverse': return `1/${name}`;
    case 'sqrt': return `√${name}`;
    case 'ln': return `ln(${name})`;
  }
}

/** Wert und Unsicherheit nach der Umrechnung (Gauß: σ' = |g'(v)|·σ). null, wenn die Umrechnung nicht definiert ist. */
export function applyTransform(t: Transform, v: number, s?: number | null): { v: number; s?: number } | null {
  let out: number, d: number;
  switch (t) {
    case 'id': out = v; d = 1; break;
    case 'square': out = v * v; d = 2 * v; break;
    case 'inverse': if (v === 0) return null; out = 1 / v; d = -1 / (v * v); break;
    case 'sqrt': if (v < 0) return null; out = Math.sqrt(v); d = v === 0 ? NaN : 1 / (2 * Math.sqrt(v)); break;
    case 'ln': if (v <= 0) return null; out = Math.log(v); d = 1 / v; break;
  }
  if (!Number.isFinite(out)) return null;
  const sig = s !== null && s !== undefined && Number.isFinite(d) ? Math.abs(d) * s : undefined;
  return { v: out, ...(sig !== undefined && sig > 0 ? { s: sig } : {}) };
}

/** Punkte der Auftragung: x = tx(p), y = ty(v) mit umgerechneter Unsicherheit. Ungültige Zeilen entfallen. */
export function toPoints(rows: VarRow[], tx: Transform, ty: Transform): Pt[] {
  const out: Pt[] = [];
  for (const r of rows) {
    const x = applyTransform(tx, r.p), y = applyTransform(ty, r.v, r.s);
    if (x && y) out.push({ x: x.v, y: y.v, ...(y.s !== undefined ? { sy: y.s } : {}) });
  }
  return out;
}

export interface PlotSuggestion {
  tx: Transform;
  ty: Transform;
  /** Bestimmtheitsmaß der Ausgleichsgeraden in dieser Auftragung. */
  r2: number;
  /** Ursprungsgerade passt: Achsenabschnitt innerhalb von 2σ von 0. */
  throughOrigin: boolean;
  n: number;
}

/**
 * Probiert alle Umrechnungen von x und y und rankt sie nach dem R² der Ausgleichsgeraden.
 * Bei (nahezu) gleichem R² gewinnt die einfachere Auftragung (weniger Umrechnungen). Braucht ≥ 3 gültige Punkte.
 */
export function suggestPlots(rows: VarRow[], max = 4): PlotSuggestion[] {
  const out: PlotSuggestion[] = [];
  for (const tx of TRANSFORMS) {
    for (const ty of TRANSFORMS) {
      const pts = toPoints(rows, tx, ty);
      if (pts.length < 3 || pts.length < rows.length) continue; // alle Zeilen müssen umrechenbar sein, sonst ist der Vergleich unfair
      const xs = pts.map((p) => p.x);
      if (Math.max(...xs) === Math.min(...xs)) continue;
      const l = fitLine(pts.map((p) => ({ x: p.x, y: p.y })));
      if (!l) continue;
      const mean = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const ssTot = pts.reduce((s, p) => s + (p.y - mean) ** 2, 0);
      if (ssTot === 0) continue;
      const r2 = 1 - l.chi2 / ssTot;
      out.push({ tx, ty, r2, throughOrigin: Math.abs(l.b) <= 2 * l.sb, n: pts.length });
    }
  }
  const cost = (s: PlotSuggestion): number => (s.tx === 'id' ? 0 : 1) + (s.ty === 'id' ? 0 : 1);
  out.sort((a, b) => (Math.abs(a.r2 - b.r2) < 1e-4 ? cost(a) - cost(b) : b.r2 - a.r2));
  return out.slice(0, max);
}

/** Mittelwert und Unsicherheit des Mittelwerts aus mehreren Ablesungen; σ kombiniert Gerät und Streuung. */
export function averageReadings(values: number[], deviceSigma?: number | null): { v: number; s: number | null; n: number } | null {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  const n = v.length;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const std = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const stat = n > 2 ? std / Math.sqrt(n) : 0;
  const dev = deviceSigma ?? 0;
  const s = Math.hypot(stat, dev);
  return { v: mean, s: s > 0 ? s : null, n };
}
