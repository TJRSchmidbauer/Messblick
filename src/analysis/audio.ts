/**
 * Tonanalyse für das Mikrofon: Grundfrequenz (FFT mit Hann-Fenster und Parabel-Interpolation, deutlich genauer als der
 * Abstand der Frequenzstützstellen) und Pegel. Reine Zahlenarbeit ohne DOM, daher in Node testbar.
 */

/** In-place-FFT (radix 2). `re` und `im` haben dieselbe Länge, eine Zweierpotenz. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { // Bitumkehr
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export interface Peak {
  /** Frequenz in Hz. */
  freq: number;
  /** Stärke relativ zum stärksten Maximum in dB (0 = das stärkste). */
  db: number;
}

export interface AudioAnalysis {
  /** Grundfrequenz (stärkstes Maximum) in Hz; null bei Stille oder wenn kein Ton erkennbar ist. */
  freq: number | null;
  /** Pegel in dB relativ zur Vollaussteuerung (0 dB = Effektivwert 1), nach unten begrenzt auf −100 dB. */
  level: number;
  /** Effektivwert des Signals. */
  rms: number;
  /** Bis zu drei stärkste Maxima (Grundton und Obertöne), nach Frequenz sortiert. */
  peaks: Peak[];
  /** 0..1: wie deutlich das stärkste Maximum aus dem Spektrum herausragt. */
  confidence: number;
  /** Betragsspektrum (linear) für die Anzeige, Bins 0..N/2. */
  spectrum: Float32Array;
}

export const MIN_FREQ = 20;
/** Unter diesem Effektivwert gilt das Signal als Stille. */
export const SILENCE_RMS = 0.002;

const hann = (n: number): Float64Array => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
const windows = new Map<number, Float64Array>();

/** Analysiert einen Block Abtastwerte (Länge: Zweierpotenz, z. B. 8192) bei der Abtastrate `sampleRate`. */
export function analyzeBlock(samples: ArrayLike<number>, sampleRate: number): AudioAnalysis {
  const n = samples.length;
  if (n < 256 || (n & (n - 1)) !== 0) throw new Error('Blocklänge muss eine Zweierpotenz ≥ 256 sein.');
  let sum = 0, mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  for (let i = 0; i < n; i++) sum += (samples[i] - mean) ** 2;
  const rms = Math.sqrt(sum / n);
  const level = rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
  const half = n >> 1;
  const spectrum = new Float32Array(half + 1);
  const empty: AudioAnalysis = { freq: null, level, rms, peaks: [], confidence: 0, spectrum };
  if (rms < SILENCE_RMS) return empty;

  let w = windows.get(n);
  if (!w) { w = hann(n); windows.set(n, w); }
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (samples[i] - mean) * w[i];
  fft(re, im);
  for (let k = 0; k <= half; k++) spectrum[k] = Math.hypot(re[k], im[k]);

  const binHz = sampleRate / n;
  const kMin = Math.max(2, Math.ceil(MIN_FREQ / binHz));
  // lokale Maxima (über beide Nachbarn) oberhalb der Mindestfrequenz
  const maxima: { k: number; m: number }[] = [];
  for (let k = kMin; k < half; k++) {
    if (spectrum[k] > spectrum[k - 1] && spectrum[k] >= spectrum[k + 1]) maxima.push({ k, m: spectrum[k] });
  }
  if (!maxima.length) return empty;
  maxima.sort((a, b) => b.m - a.m);
  const top = maxima[0].m;
  const interp = (k: number): number => { // Parabel durch die logarithmierten Beträge
    const a = Math.log(spectrum[k - 1] + 1e-12), b = Math.log(spectrum[k] + 1e-12), c = Math.log(spectrum[k + 1] + 1e-12);
    const d = a - 2 * b + c;
    return (k + (d < -1e-12 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0)) * binHz;
  };
  const peaks: Peak[] = [];
  for (const p of maxima) {
    if (peaks.length === 3) break;
    const f = interp(p.k);
    if (peaks.some((q) => Math.abs(q.freq - f) < 3 * binHz)) continue; // gleiche Spitze (breiter Berg) nur einmal
    const db = 20 * Math.log10(p.m / top);
    if (db < -40) break;
    peaks.push({ freq: f, db });
  }
  peaks.sort((a, b) => a.freq - b.freq);
  const median = [...spectrum.subarray(kMin)].sort((a, b) => a - b)[Math.floor((half - kMin) / 2)] || 1e-12;
  const ratio = top / median;
  const confidence = Math.max(0, Math.min(1, Math.log10(ratio) / 3)); // Faktor 1000 über dem Rauschboden → 1; weißes Rauschen liegt bei ~0,25
  if (confidence < 0.45) return { ...empty, confidence };
  return { freq: interp(maxima[0].k), level, rms, peaks, confidence, spectrum };
}

/** Name des Tons zu einer Frequenz (A4 = 440 Hz), z. B. „A4“ oder „C♯5“, mit Abweichung in Cent. */
export function noteName(freq: number): { name: string; cents: number } {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
  const octave = Math.floor(nearest / 12) - 1;
  return { name: `${names[((nearest % 12) + 12) % 12]}${octave}`, cents: Math.round((midi - nearest) * 100) };
}
