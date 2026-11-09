import type { Calibration } from './readers';
import { readChannel } from './readers';
import type { Session } from './session/session';
import type { FrameSource } from './source/types';

export interface ActiveChannel {
  id: string;
  cal: Calibration;
}

function sampleOnce(src: FrameSource, channels: ActiveChannel[], session: Session, t: number): void {
  const frame = src.grab();
  const values: Record<string, { v: number | null; c: number }> = {};
  for (const ch of channels) {
    const r = readChannel(frame, ch.cal);
    values[ch.id] = { v: r.value, c: r.confidence };
  }
  session.addSample(t, values);
}

/** Videodatei Frame-genau abtasten (kann schneller als Echtzeit laufen). */
export async function analyzeFile(
  src: FrameSource, channels: ActiveChannel[], session: Session, hz: number,
  onProgress: (fraction: number) => void, signal: AbortSignal,
): Promise<void> {
  if (!src.seek || src.duration === null) throw new Error('Quelle unterstützt keine Dateiauswertung.');
  const dt = 1 / hz;
  const n = Math.floor(src.duration / dt);
  for (let i = 0; i <= n; i++) {
    if (signal.aborted) return;
    const t = Math.min(i * dt, src.duration);
    await src.seek(t);
    sampleOnce(src, channels, session, t);
    onProgress(i / n);
    if (i % 5 === 0) await new Promise((r) => setTimeout(r)); // UI atmen lassen
  }
}

/** Live-Aufnahme; gibt eine Stop-Funktion zurück. t = Sekunden seit Start. */
export function startLive(
  src: FrameSource, channels: ActiveChannel[], session: Session, hz: number, onSample: () => void,
): () => void {
  const t0 = src.time();
  const id = setInterval(() => {
    sampleOnce(src, channels, session, src.time() - t0);
    onSample();
  }, 1000 / hz);
  return () => clearInterval(id);
}
