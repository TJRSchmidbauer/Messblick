/**
 * Messunsicherheit je Messgerät. Modi:
 * - class: Güteklasse (Zeigerinstrument): σ = Klasse/100 × Messbereichsendwert, optional mit Ablesefehler quadratisch addiert
 * - digits: Digitalanzeige: σ = Anzahl Ziffernschritte × Wert der letzten Stelle
 * - abs: fester ±-Wert
 * - poisson: Zählrate, σ = √N
 * - none: unbekannt (Standard)
 */
export type UncertaintyConfig =
  | { mode: 'none' }
  | { mode: 'class'; cls: number; range: number; read?: number }
  | { mode: 'digits'; steps: number; decimals: number }
  | { mode: 'abs'; value: number }
  | { mode: 'poisson' };

export const NO_UNCERTAINTY: UncertaintyConfig = { mode: 'none' };

/** σ für einen Messwert; null, wenn unbekannt oder nicht berechenbar. */
export function sigmaOf(cfg: UncertaintyConfig | undefined, value: number): number | null {
  if (!cfg || cfg.mode === 'none' || !Number.isFinite(value)) return null;
  let s: number;
  switch (cfg.mode) {
    case 'class': s = Math.hypot((cfg.cls / 100) * cfg.range, cfg.read ?? 0); break;
    case 'digits': s = cfg.steps * Math.pow(10, -cfg.decimals); break;
    case 'abs': s = cfg.value; break;
    case 'poisson': s = Math.sqrt(Math.max(value, 0)); break;
  }
  return Number.isFinite(s) && s > 0 ? s : null;
}

/** Kurzbeschreibung für Anzeige und Export, z. B. „Klasse 1,5 bei 10 V“. */
export function describeUncertainty(cfg: UncertaintyConfig | undefined, unit: string): string {
  if (!cfg || cfg.mode === 'none') return 'unbekannt';
  const n = (v: number): string => String(v).replace('.', ',');
  switch (cfg.mode) {
    case 'class': return `Klasse ${n(cfg.cls)} bei ${n(cfg.range)} ${unit}`.trim() + (cfg.read ? `, Ablesefehler ±${n(cfg.read)} ${unit}` : '');
    case 'digits': return `${cfg.steps} Ziffernschritt(e) bei ${cfg.decimals} Dezimalstelle(n)`;
    case 'abs': return `±${n(cfg.value)} ${unit}`.trim();
    case 'poisson': return 'Zählrate, √N';
  }
}
