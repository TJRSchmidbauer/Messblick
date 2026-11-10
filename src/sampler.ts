import type { Calibration } from './readers';
import { readChannel } from './readers';
import type { Session } from './session/session';
import type { FrameSource } from './source/types';
import type { Tracker } from './readers/track';
import type { Frame, Rect } from './core/types';
import { luminance } from './core/types';

/**
 * Ein aktiver Kanal ist entweder ein abgelesenes Gerät (`cal`) oder eine Markerverfolgung (`track`).
 * Die Verfolgung liefert zwei Werte je Bild: unter `${id}x` und `${id}y` (z. B. id 'trk-' → 'trk-x', 'trk-y').
 */
export interface ActiveChannel {
  id: string;
  cal?: Calibration;
  track?: Tracker;
  /** Lichtschranke: mittlere Helligkeit (0..1) dieser Bildzone. */
  gate?: Rect;
}

/** Mittlere Helligkeit einer Bildzone, 0 (schwarz) bis 1 (weiß). */
export function meanBrightness(frame: Frame, r: Rect): number {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(frame.width, Math.ceil(r.x + r.w)), y1 = Math.min(frame.height, Math.ceil(r.y + r.h));
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += luminance(frame, x, y); n++; }
  return n ? sum / n / 255 : 0;
}

function sampleOnce(src: FrameSource, channels: ActiveChannel[], session: Session, t: number): void {
  const frame = src.grab();
  const values: Record<string, { v: number | null; c: number }> = {};
  for (const ch of channels) {
    if (ch.track) {
      const r = ch.track.update(frame, t);
      values[`${ch.id}x`] = { v: r.x, c: r.confidence };
      values[`${ch.id}y`] = { v: r.y, c: r.confidence };
    } else if (ch.gate) {
      values[ch.id] = { v: meanBrightness(frame, ch.gate), c: 1 };
    } else if (ch.cal) {
      const r = readChannel(frame, ch.cal);
      values[ch.id] = { v: r.value, c: r.confidence };
    }
  }
  session.addSample(t, values);
}

/** Videodatei Frame-genau abtasten (kann schneller als Echtzeit laufen). */
export async function analyzeFile(
  src: FrameSource, channels: ActiveChannel[], session: Session, hz: number,
  onProgress: (fraction: number) => void, signal: AbortSignal,
): Promise<void> {
  if (!src.seek || src.duration === null) throw new Error('Quelle unterstützt keine Dateiauswertung.');
  for (const ch of channels) ch.track?.reset();
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
  for (const ch of channels) ch.track?.reset();
  const t0 = src.time();
  const id = setInterval(() => {
    sampleOnce(src, channels, session, src.time() - t0);
    onSample();
  }, 1000 / hz);
  return () => clearInterval(id);
}
