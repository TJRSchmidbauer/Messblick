/** Vergleich eines Messergebnisses mit einem Literaturwert (oder Sollwert aus der Theorie). */
export interface Comparison {
  /** Messwert − Literaturwert. */
  diff: number;
  /** Abweichung in Prozent des Literaturwerts; null bei Literaturwert 0. */
  percent: number | null;
  /** Abweichung in Einheiten der kombinierten Unsicherheit; null, wenn keine Unsicherheit bekannt ist. */
  z: number | null;
  verdict: 'compatible' | 'incompatible' | 'unknown';
  /** Satz für Anzeige und Protokoll. */
  text: string;
}

const fmt = (v: number, digits = 3): string => {
  const a = Math.abs(v);
  const t = a !== 0 && (a >= 1e6 || a < 1e-4) ? v.toExponential(digits - 1).replace('e+', 'e') : String(Number(v.toPrecision(digits)));
  return t.replace('.', ',');
};

/**
 * Verträglichkeit: |Messwert − Literaturwert| ≤ 2·σ_kombiniert (σ_kombiniert = √(σ² + σ_lit²)).
 * Ohne Unsicherheit des Messwerts lässt sich nur die Abweichung in Prozent nennen.
 */
export function compareToLiterature(value: number, sigma: number | null, lit: number, litSigma: number | null = null): Comparison {
  const diff = value - lit;
  const percent = lit === 0 ? null : (diff / Math.abs(lit)) * 100;
  const known = sigma !== null && Number.isFinite(sigma) && sigma > 0;
  const comb = known ? Math.hypot(sigma, litSigma ?? 0) : null;
  const z = comb ? Math.abs(diff) / comb : null;
  const pct = percent === null ? '' : ` (${fmt(percent, 2)} %)`;
  if (z === null) {
    return { diff, percent, z, verdict: 'unknown', text: `Abweichung vom Literaturwert: ${fmt(diff)}${pct}. Ohne Messunsicherheit lässt sich nicht sagen, ob das verträglich ist.` };
  }
  if (z <= 2) {
    return { diff, percent, z, verdict: 'compatible', text: `Verträglich mit dem Literaturwert (Abweichung ${fmt(z, 2)}σ${pct}).` };
  }
  return {
    diff, percent, z, verdict: 'incompatible',
    text: `Nicht verträglich mit dem Literaturwert (Abweichung ${fmt(z, 2)}σ${pct}). Mögliche systematische Fehler prüfen: Kalibrierung, Ablesung, Messbereich, Störungen.`,
  };
}
