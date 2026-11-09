/**
 * Vorhersage vor der Messung: Schüler zeichnen die erwartete Kurve, danach liegt die Messung darüber.
 * Die Vergleichsfunktion gibt keine Note, sondern eine Rückmeldung als Anstoß zum Nachdenken.
 */
export interface PredPoint {
  x: number;
  y: number;
}

export interface Prediction {
  /** x-Größe: 't' für die Zeit oder eine Kanal-ID. */
  xKey: string;
  /** y-Kanal. */
  yId: string;
  points: PredPoint[];
}

/**
 * Macht aus einem gezeichneten Zug eine Kurve y(x): nach x sortiert, doppelte x zusammengefasst (Mittel),
 * zu dichte Punkte ausgedünnt (kleinster Abstand = `minDx`).
 */
export function cleanPath(raw: PredPoint[], minDx: number): PredPoint[] {
  const pts = raw.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  const out: PredPoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && p.x - last.x < minDx) out[out.length - 1] = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    else out.push({ ...p });
  }
  return out;
}

/** Wert der Vorhersage bei x (linear zwischen den Punkten); null außerhalb des gezeichneten Bereichs. */
export function predictionAt(points: PredPoint[], x: number): number | null {
  if (points.length < 2 || x < points[0].x || x > points[points.length - 1].x) return null;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid].x <= x) lo = mid; else hi = mid; }
  const a = points[lo], b = points[hi];
  return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

export interface PredictionFeedback {
  /** Mittlere Abweichung (RMS) in Prozent der Spannweite der Messwerte; null, wenn nicht vergleichbar. */
  rmsPercent: number | null;
  /** Anteil der Messpunkte, die im gezeichneten Bereich liegen. */
  coverage: number;
  verdict: 'close' | 'rough' | 'different' | 'none';
  text: string;
}

/** Vergleicht Messpunkte mit der Vorhersage und formuliert eine Rückmeldung mit Denkanstoß. */
export function comparePrediction(points: PredPoint[], data: PredPoint[]): PredictionFeedback {
  const none = (text: string): PredictionFeedback => ({ rmsPercent: null, coverage: 0, verdict: 'none', text });
  if (points.length < 2) return none('Keine Vorhersage gezeichnet.');
  if (data.length < 3) return none('Noch zu wenige Messpunkte für einen Vergleich.');
  const ys = data.map((d) => d.y);
  const span = Math.max(...ys) - Math.min(...ys);
  const inRange = data.filter((d) => predictionAt(points, d.x) !== null);
  const coverage = inRange.length / data.length;
  if (inRange.length < 3) return none('Die Messung liegt kaum im Bereich deiner Vorhersage. Achsenbereiche prüfen.');
  if (!(span > 0)) return none('Die Messwerte sind konstant: kein Vergleich der Form möglich.');
  const rms = Math.sqrt(inRange.reduce((s, d) => s + (d.y - predictionAt(points, d.x)!) ** 2, 0) / inRange.length);
  const pct = (rms / span) * 100;
  const p = String(Number(pct.toFixed(1))).replace('.', ',');
  if (pct < 5) return { rmsPercent: pct, coverage, verdict: 'close', text: `Deine Vorhersage lag sehr nah an der Messung (mittlere Abweichung ${p} % der Messspanne). Woran hast du die Form erkannt?` };
  if (pct < 15) return { rmsPercent: pct, coverage, verdict: 'rough', text: `Grob richtig (mittlere Abweichung ${p} % der Messspanne). Wo weicht die Kurve ab, und was könnte der Grund sein?` };
  return { rmsPercent: pct, coverage, verdict: 'different', text: `Die Messung weicht deutlich von deiner Vorhersage ab (${p} % der Messspanne). Was hast du anders erwartet, und was erklärt den Unterschied?` };
}
