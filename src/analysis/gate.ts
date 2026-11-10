/**
 * Lichtschranke aus dem Kamerabild: Die mittlere Helligkeit einer kleinen Bildzone wird über der Zeit aufgenommen.
 * Läuft etwas durch die Zone, ändert sich die Helligkeit. Aus den Durchgängen ergeben sich Zeitabstände,
 * Periodendauern und (mit der Breite des durchlaufenden Körpers) Geschwindigkeiten.
 */
export interface GateSample {
  t: number;
  v: number;
}

export interface GateBlock {
  /** Eintritt und Austritt in s (linear zwischen den Bildern interpoliert, an der halben Höhe). */
  tIn: number;
  tOut: number;
  /** Dauer des Durchgangs in s. */
  width: number;
  /** Anzahl Bilder innerhalb des Durchgangs; wenige Bilder bedeuten grobe Zeiten. */
  frames: number;
}

export interface GateResult {
  blocks: GateBlock[];
  /** 'dark': etwas Dunkles läuft vor hellem Grund; 'bright': Helles vor dunklem Grund. */
  polarity: 'dark' | 'bright';
  /** Zeitabstände zwischen aufeinanderfolgenden Eintritten. */
  intervals: number[];
  /** Abstände zwischen jedem zweiten Eintritt (Periodendauer bei Pendel mit Schranke in der Mitte). */
  periods: number[];
  /** Größter Bildabstand (s): so genau sind die Zeiten höchstens. */
  frameDt: number;
  warnings: string[];
}

export interface Stats {
  n: number;
  mean: number;
  /** Standardabweichung der Einzelwerte. */
  std: number;
  /** Unsicherheit des Mittelwerts (std/√n); null bei n < 2. */
  sem: number | null;
}

export function stats(values: number[]): Stats | null {
  if (!values.length) return null;
  const n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
  const std = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, std, sem: n > 1 ? std / Math.sqrt(n) : null };
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mindesthub (Anteil des Messbereichs 0..1), unter dem kein Durchgang erkannt wird. */
const MIN_CONTRAST = 0.04;

export function detectGate(samples: GateSample[]): GateResult {
  const out: GateResult = { blocks: [], polarity: 'dark', intervals: [], periods: [], frameDt: 0, warnings: [] };
  const s = samples.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (s.length < 5) { out.warnings.push('Zu wenige Messpunkte für die Lichtschranke.'); return out; }
  for (let i = 1; i < s.length; i++) out.frameDt = Math.max(out.frameDt, s[i].t - s[i - 1].t);
  const base = median(s.map((p) => p.v));
  const hi = Math.max(...s.map((p) => p.v)) - base, lo = base - Math.min(...s.map((p) => p.v));
  out.polarity = lo >= hi ? 'dark' : 'bright';
  const contrast = Math.max(hi, lo);
  if (contrast < MIN_CONTRAST) { out.warnings.push('Die Helligkeit ändert sich kaum. Zone kleiner und genau dort wählen, wo der Körper durchläuft, oder für mehr Kontrast sorgen.'); return out; }
  const sign = out.polarity === 'dark' ? -1 : 1;
  const dev = s.map((p) => (sign * (p.v - base)) / contrast); // 0 = Grundhelligkeit, 1 = stärkster Ausschlag
  const ON = 0.5, OFF = 0.4;
  const cross = (i: number): number => { // Zeit des Durchgangs durch ON zwischen Bild i−1 und i
    const a = dev[i - 1], b = dev[i];
    return b === a ? s[i].t : s[i - 1].t + ((ON - a) / (b - a)) * (s[i].t - s[i - 1].t);
  };
  let inBlock = false, partial = false, tIn = 0, startIdx = 0, lastAbove = 0;
  for (let i = 0; i < s.length; i++) {
    if (!inBlock && dev[i] >= ON) {
      inBlock = true; startIdx = i; lastAbove = i;
      partial = i === 0; // die Reihe beginnt mitten im Durchgang: Eintritt unbekannt, nicht werten
      tIn = partial ? s[0].t : cross(i);
    } else if (inBlock) {
      if (dev[i] >= ON) lastAbove = i;
      if (dev[i] <= OFF || i === s.length - 1) {
        if (dev[i] > OFF) continue; // Reihe endet mitten im Durchgang: nicht werten
        const j = lastAbove;
        const a = dev[j], b = dev[j + 1];
        const tOut = b === a ? s[j].t : s[j].t + ((a - ON) / (a - b)) * (s[j + 1].t - s[j].t);
        if (!partial) out.blocks.push({ tIn, tOut, width: tOut - tIn, frames: lastAbove - startIdx + 1 });
        inBlock = false;
      }
    }
  }
  out.intervals = out.blocks.slice(1).map((b, i) => b.tIn - out.blocks[i].tIn);
  out.periods = out.blocks.slice(2).map((b, i) => b.tIn - out.blocks[i].tIn);
  if (out.blocks.some((b) => b.frames <= 2)) out.warnings.push('Manche Durchgänge dauern nur ein bis zwei Bilder. Höhere Bildrate wählen, sonst sind die Zeiten grob (bis ±1 Bildabstand).');
  if (!out.blocks.length) out.warnings.push('Kein Durchgang erkannt. Die Zone liegt vielleicht neben der Bahn des Körpers.');
  return out;
}
