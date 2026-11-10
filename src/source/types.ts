import type { Frame } from '../core/types';

export interface FrameSource {
  kind: 'camera' | 'file' | 'demo' | 'audio';
  width: number;
  height: number;
  /** Dauer in s; null bei Livequellen. */
  duration: number | null;
  /** Aktuelle Zeit in s (Livequellen: seit Start). */
  time(): number;
  grab(): Frame;
  /** Nur Dateien/Demo: auf Zeitpunkt springen (Frame-genau auswertbar). */
  seek?(t: number): Promise<void>;
  /**
   * Nur Videodateien: Video abspielen und bei jedem dargestellten Bild (höchstens `hz` je Sekunde) `onFrame(t)` rufen,
   * t = echte Zeit des Bildes. Etwa fünfmal schneller als je Bild zu springen. null, wenn der Browser es nicht kann.
   */
  scan?: ((hz: number, onFrame: (t: number) => void, signal: AbortSignal) => Promise<void>) | null;
  /** Bild um 90° drehen (1 = im Uhrzeigersinn, −1 dagegen), für Geräte, die im Bild quer liegen. Danach ändern sich width und height. */
  rotate?(turns?: 1 | -1): void;
  /** Aktuelle Drehung in Grad (0, 90, 180, 270). */
  rotation?: number;
  stop(): void;
}
