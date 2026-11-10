import type { Note } from '../analysis/describe';

/** Spielt eine Tonfolge (Tonhöhe folgt der Kurve) mit der Web-Audio-Schnittstelle; alles lokal, keine Dateien. */
export class Sonifier {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private timer = 0;

  get playing(): boolean {
    return this.ctx !== null;
  }

  /** Startet die Wiedergabe; `onEnd` kommt am Ende oder nach `stop()`. Gibt false zurück, wenn der Browser keinen Ton kann. */
  play(notes: Note[], onEnd: () => void): boolean {
    this.stop();
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC || notes.length < 2) return false;
    const ctx = new AC();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    const t0 = ctx.currentTime + 0.05;
    osc.frequency.setValueAtTime(notes[0].freq, t0);
    for (const n of notes) osc.frequency.linearRampToValueAtTime(n.freq, t0 + n.at);
    const end = t0 + notes[notes.length - 1].at;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.18, t0 + 0.04);
    gain.gain.setValueAtTime(0.18, end);
    gain.gain.linearRampToValueAtTime(0, end + 0.08);
    osc.start(t0);
    osc.stop(end + 0.1);
    this.ctx = ctx; this.osc = osc; this.gain = gain;
    this.timer = window.setTimeout(() => { this.stop(); onEnd(); }, (end + 0.15 - ctx.currentTime) * 1000);
    return true;
  }

  stop(): void {
    window.clearTimeout(this.timer);
    try { this.osc?.stop(); } catch { /* schon beendet */ }
    this.osc?.disconnect(); this.gain?.disconnect();
    void this.ctx?.close();
    this.ctx = null; this.osc = null; this.gain = null;
  }
}

/** Deutsche Stimme, die lokal auf dem Gerät läuft (keine Cloud-Stimme: Text soll das Gerät nicht verlassen). */
export function localGermanVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('de') && v.localService) ?? null;
}
