/**
 * Erkennt Sprünge um eine Zehnerpotenz in einer Messreihe. Typische Ursache am Multimeter: Messbereichswechsel
 * (Komma wandert, Einheit ändert sich) oder ein nicht erkannter Dezimalpunkt. Die Reihe sieht dann „plausibel“ aus
 * und verfälscht still die Auswertung.
 */
export interface Jump {
  /** Index (in der übergebenen Reihe) des ersten Wertes auf dem neuen Niveau. */
  index: number;
  /** Verhältnis neu/alt, gerundet auf eine Zehnerpotenz: 10, 0,1, 100, 0,01, 1000, 0,001. */
  factor: number;
}

export interface JumpOptions {
  /** Erlaubte Abweichung vom exakten Faktor 10^k (relativ). */
  tolerance?: number;
  /** So viele Werte (inkl. dem ersten) müssen auf dem neuen Niveau bleiben. */
  persist?: number;
  /** Größte erkannte Zehnerpotenz. */
  maxPower?: number;
}

const near = (ratio: number, k: number, tol: number): boolean => Math.abs(ratio / Math.pow(10, k) - 1) <= tol;

export function detectScaleJumps(values: (number | null)[], opts: JumpOptions = {}): Jump[] {
  const tol = opts.tolerance ?? 0.08, persist = opts.persist ?? 3, maxPower = opts.maxPower ?? 3;
  const idx: number[] = [];
  values.forEach((v, i) => { if (v !== null && Number.isFinite(v)) idx.push(i); });
  const jumps: Jump[] = [];
  let level = 0; // Position (in idx) des letzten Wertes auf dem bisherigen Niveau
  for (let n = 1; n < idx.length; n++) {
    const prev = values[idx[n - 1]] as number, cur = values[idx[n]] as number;
    if (prev === 0 || cur === 0 || Math.sign(prev) !== Math.sign(cur)) continue;
    const ratio = cur / prev;
    const k = Math.round(Math.log10(ratio));
    if (k === 0 || Math.abs(k) > maxPower || !near(ratio, k, tol)) continue;
    // Das neue Niveau muss bleiben: die folgenden Werte liegen nahe bei cur (nicht weiter im selben Verlauf)
    if (n + persist - 1 >= idx.length) continue;
    let steady = true;
    for (let m = n + 1; m < n + persist; m++) {
      const v = values[idx[m]] as number;
      if (Math.sign(v) !== Math.sign(cur) || Math.abs(v / cur - 1) > 0.5) { steady = false; break; }
    }
    // Das alte Niveau muss ebenfalls geherrscht haben (ein einzelner Ausreißer davor zählt nicht)
    if (steady && n - 1 > level) {
      const before = values[idx[n - 2]] as number | undefined;
      if (before !== undefined && (Math.sign(before) !== Math.sign(prev) || Math.abs(before / prev - 1) > 0.5)) steady = false;
    }
    if (!steady) continue;
    jumps.push({ index: idx[n], factor: Math.pow(10, k) });
    level = n;
  }
  return jumps;
}

/** Faktor als Text: „×10“, „×0,1“, „×100“ … */
export function factorLabel(f: number): string {
  return `×${String(f).replace('.', ',')}`;
}
