import { analyzeBlock, noteName, type AudioAnalysis } from '../analysis/audio';
import { createFrame, drawLine, fillRect, setGray } from '../core/synth';
import type { Frame } from '../core/types';
import type { FrameSource } from './types';

/**
 * Tonquellen: Mikrofon und ein Demo-Ton. Beide liefern Blöcke von Abtastwerten, die gleich analysiert werden
 * (Frequenz, Pegel), und zeichnen als „Bild“ ein Oszilloskop und ein Spektrum, damit sie wie die Kamera in der Anzeige stehen.
 */
const BLOCK = 8192;
const W = 640, H = 360;
const F_LO = 20, F_HI = 5000;

export interface AudioReader {
  /** Letzte Analyse; null, solange noch keine Daten da sind. */
  read(): AudioAnalysis | null;
}

abstract class AudioSource implements FrameSource, AudioReader {
  kind = 'audio' as const;
  width = W;
  height = H;
  duration = null;
  protected abstract sampleRate: number;
  protected block = new Float32Array(BLOCK);
  latest: AudioAnalysis | null = null;
  private lastAt = -1e9;
  protected t0 = performance.now();

  time(): number {
    return (performance.now() - this.t0) / 1000;
  }
  /** Füllt `block` mit den letzten BLOCK Abtastwerten. */
  protected abstract fill(): void;
  abstract stop(): void;

  /** Analyse höchstens alle 50 ms erneuern (die Anzeige fragt viel öfter). */
  private refresh(): void {
    const now = performance.now();
    if (now - this.lastAt < 50) return;
    this.lastAt = now;
    this.fill();
    this.latest = analyzeBlock(this.block, this.sampleRate);
  }
  read(): AudioAnalysis | null {
    this.refresh();
    return this.latest;
  }

  grab(): Frame {
    this.refresh();
    const f = createFrame(W, H, 28);
    const a = this.latest;
    // Oszilloskop (oben): ab einem steigenden Nulldurchgang, damit das Bild steht
    const mid = 90, amp = 70, n = 1024;
    let start = 0;
    const b = this.block;
    for (let i = 1; i < BLOCK - n - 1 && i < 2048; i++) if (b[i - 1] < 0 && b[i] >= 0) { start = i; break; }
    fillRect(f, 0, mid, W, 1, 70);
    let px = 0, py = mid;
    for (let x = 0; x < W; x++) {
      const v = b[start + Math.floor((x / W) * n)] ?? 0;
      const y = Math.max(8, Math.min(172, mid - v * amp));
      if (x > 0) drawLine(f, px, py, x, y, 1.6, 235);
      px = x; py = y;
    }
    // Spektrum (unten): logarithmische Frequenzachse 20 Hz … 5 kHz, Pegel 70 dB unter dem Maximum bis Maximum
    const top = 190, bottom = 350;
    const binHz = this.sampleRate / BLOCK;
    const x = (hz: number): number => ((Math.log(hz / F_LO)) / Math.log(F_HI / F_LO)) * (W - 1);
    for (const g of [100, 1000]) fillRect(f, x(g), top, 1, bottom - top, 70);
    if (a) {
      const spec = a.spectrum;
      let max = 1e-12;
      for (let k = 1; k < spec.length; k++) if (spec[k] > max) max = spec[k];
      for (let col = 0; col < W; col++) {
        const lo = F_LO * Math.pow(F_HI / F_LO, col / (W - 1)), hi = F_LO * Math.pow(F_HI / F_LO, (col + 1) / (W - 1));
        let m = 0;
        for (let k = Math.max(1, Math.floor(lo / binHz)); k <= Math.min(spec.length - 1, Math.max(Math.floor(lo / binHz), Math.floor(hi / binHz))); k++) m = Math.max(m, spec[k]);
        const db = 20 * Math.log10(m / max + 1e-9);
        const h = Math.max(0, Math.min(1, (db + 70) / 70)) * (bottom - top);
        if (h > 0.5) fillRect(f, col, bottom - h, 1, h, 150);
      }
      if (a.freq) {
        const px2 = Math.round(x(a.freq));
        fillRect(f, px2 - 1, top, 3, bottom - top, 250);
        for (let yy = top - 6; yy < top; yy++) setGray(f, px2, yy, 250);
      }
    }
    return f;
  }
}

/** Demo-Ton: ein gleitender Ton (440 Hz ± 110 Hz in 12 s) mit schwankender Lautstärke und etwas Rauschen. */
export const DEMO_TONE = { base: 440, swing: 110, period: 12, ampPeriod: 7 };
export const demoToneFreq = (t: number): number => DEMO_TONE.base + DEMO_TONE.swing * Math.sin((2 * Math.PI * t) / DEMO_TONE.period);
export const demoToneAmp = (t: number): number => 0.5 * (0.6 + 0.4 * Math.sin((2 * Math.PI * t) / DEMO_TONE.ampPeriod));
/** Phase des Demo-Tons: Integral der Frequenz, damit der Ton ohne Sprünge gleitet. */
const demoPhase = (t: number): number => {
  const p = DEMO_TONE;
  return 2 * Math.PI * p.base * t - p.period * p.swing * Math.cos((2 * Math.PI * t) / p.period);
};

export class ToneDemoSource extends AudioSource {
  protected sampleRate = 44100;
  private seed = 7;
  /** Festgehaltene Zeit (Prüfungen); null = Uhrzeit. */
  private fixed: number | null = null;
  setTime(t: number | null): void { this.fixed = t; }
  time(): number { return this.fixed ?? super.time(); }
  protected fill(): void {
    const t = this.time();
    for (let i = 0; i < BLOCK; i++) {
      const ts = t - (BLOCK - 1 - i) / this.sampleRate;
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      this.block[i] = demoToneAmp(ts) * Math.sin(demoPhase(ts)) + ((this.seed >>> 24) / 255 - 0.5) * 0.004;
    }
  }
  stop(): void {}
}

export class MicSource extends AudioSource {
  protected sampleRate: number;
  private constructor(private ctx: AudioContext, private stream: MediaStream, private analyser: AnalyserNode) {
    super();
    this.sampleRate = ctx.sampleRate;
  }
  /** Öffnet das Mikrofon ohne Echo-Unterdrückung, Rauschfilter und automatische Lautstärke (sie würden die Messung verfälschen). */
  static async open(): Promise<MicSource> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Mikrofonzugriff nicht möglich (HTTPS bzw. unterstützten Browser verwenden).');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      throw new Error('Das Mikrofon ist nicht freigegeben. Erlaube den Zugriff im Browser und versuche es erneut.');
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = BLOCK;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    return new MicSource(ctx, stream, analyser);
  }
  protected fill(): void {
    this.analyser.getFloatTimeDomainData(this.block);
  }
  stop(): void {
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}

/** Beschriftung der Anzeige: Frequenz mit Tonname. */
export function toneLabel(a: AudioAnalysis | null): string {
  if (!a || a.freq === null) return 'kein Ton erkannt';
  const n = noteName(a.freq);
  return `${a.freq.toFixed(1).replace('.', ',')} Hz (${n.name}${n.cents ? `, ${n.cents > 0 ? '+' : '−'}${Math.abs(n.cents)} Cent` : ''})`;
}
