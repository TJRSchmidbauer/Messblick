import type { Frame } from '../core/types';

export interface FrameSource {
  kind: 'camera' | 'file' | 'demo';
  width: number;
  height: number;
  /** Dauer in s; null bei Livequellen. */
  duration: number | null;
  /** Aktuelle Zeit in s (Livequellen: seit Start). */
  time(): number;
  grab(): Frame;
  /** Nur Dateien/Demo: auf Zeitpunkt springen (Frame-genau auswertbar). */
  seek?(t: number): Promise<void>;
  stop(): void;
}
