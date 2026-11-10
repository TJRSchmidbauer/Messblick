import type { Frame } from '../core/types';
import type { FrameSource } from './types';

const MAX_WIDTH = 960;
/** Hochformat: Höhe begrenzen, sonst werden 1080×1920-Bilder zu 960×1707 und die Verarbeitung zu langsam. */
const MAX_HEIGHT = 1280;

class VideoSource implements FrameSource {
  width: number;
  height: number;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;

  constructor(
    public kind: 'camera' | 'file',
    private video: HTMLVideoElement,
    public duration: number | null,
    private onStop: () => void,
  ) {
    this.width = 0;
    this.height = 0;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.layout();
    if (kind === 'file' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      this.scan = (hz, onFrame, signal) => new Promise<void>((resolve) => {
        const v = this.video, dt = 1 / hz;
        let next = 0, last = -1, rate = 1, finished = false;
        const done = (): void => { if (finished) return; finished = true; v.pause(); v.playbackRate = 1; resolve(); };
        const cb = (_now: number, meta: { mediaTime: number }): void => {
          if (signal.aborted) return done();
          const t = meta.mediaTime;
          if (t + 1e-3 >= next) {
            onFrame(t);
            next = (Math.floor((t + 1e-3) / dt) + 1) * dt;
          }
          // Bilder fehlen? Dann kommt die Verarbeitung nicht hinterher: langsamer abspielen.
          if (last >= 0 && t - last > 1.6 * Math.max(dt, 1 / 30) && rate > 0.25) { rate /= 2; v.playbackRate = rate; }
          last = t;
          if (!finished) v.requestVideoFrameCallback(cb);
        };
        v.addEventListener('ended', done, { once: true });
        v.addEventListener('error', done, { once: true });
        const start = (): void => { v.playbackRate = 1; v.requestVideoFrameCallback(cb); void v.play().catch(done); };
        if (Math.abs(v.currentTime) < 1e-3) start();
        else { v.addEventListener('seeked', start, { once: true }); v.currentTime = 0; }
      });
    }
    if (kind === 'file') {
      this.seek = (t: number): Promise<void> =>
        new Promise((resolve) => {
          if (Math.abs(video.currentTime - t) < 1e-3) return resolve();
          video.addEventListener('seeked', () => resolve(), { once: true });
          video.currentTime = t;
        });
    }
  }
  seek?: (t: number) => Promise<void>;

  /** Drehung des Bildes in Grad im Uhrzeigersinn (0, 90, 180, 270). */
  rotation = 0;
  /** Größe von Bild und Zeichenfläche nach Drehung und Verkleinerung (höchstens MAX_WIDTH breit). */
  private layout(): void {
    const turned = this.rotation % 180 !== 0;
    const w = turned ? this.video.videoHeight : this.video.videoWidth, h = turned ? this.video.videoWidth : this.video.videoHeight;
    const scale = Math.min(1, MAX_WIDTH / w, MAX_HEIGHT / h);
    this.width = Math.round(w * scale);
    this.height = Math.round(h * scale);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }
  /** Um 90° weiterdrehen (1 = im Uhrzeigersinn, −1 dagegen). */
  rotate(turns: 1 | -1 = 1): void {
    this.rotation = (this.rotation + 90 * turns + 360) % 360;
    this.layout();
  }

  /**
   * Abspielen und dabei Bilder abtasten (requestVideoFrameCallback). Springen kostet je Bild ein Dekodieren ab dem
   * letzten Schlüsselbild (hier etwa 180 ms); beim Abspielen kommt jedes Bild nach etwa 35 ms. Bleibt die Verarbeitung
   * hinter dem Video zurück (Bilder werden übersprungen), wird die Abspielgeschwindigkeit halbiert.
   */
  scan: FrameSource['scan'] = null;

  private t0 = performance.now();
  time(): number {
    return this.kind === 'file' ? this.video.currentTime : (performance.now() - this.t0) / 1000;
  }

  grab(): Frame {
    if (this.rotation === 0) this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
    else {
      // Quelle (unverdreht) auf die gedrehte Zeichenfläche abbilden: Mittelpunkt verschieben, drehen, Quelle zentriert zeichnen
      const turned = this.rotation % 180 !== 0;
      const dw = turned ? this.height : this.width, dh = turned ? this.width : this.height;
      this.ctx.save();
      this.ctx.translate(this.width / 2, this.height / 2);
      this.ctx.rotate((this.rotation * Math.PI) / 180);
      this.ctx.drawImage(this.video, -dw / 2, -dh / 2, dw, dh);
      this.ctx.restore();
    }
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  stop(): void {
    this.onStop();
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Video konnte nicht geladen werden.')), { once: true });
  });
}

export async function openCamera(facing: 'environment' | 'user' = 'environment'): Promise<FrameSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Kamerazugriff nicht möglich (HTTPS bzw. unterstützten Browser verwenden).');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 } }, audio: false,
    });
  } catch (e) {
    const name = (e as DOMException).name;
    throw new Error(
      name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert. Bitte im Browser erlauben.'
        : name === 'NotFoundError' ? 'Keine Kamera gefunden.'
          : `Kamera konnte nicht gestartet werden (${name}).`,
    );
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  await waitForMetadata(video);
  return new VideoSource('camera', video, null, () => stream.getTracks().forEach((t) => t.stop()));
}

export async function openVideoFile(file: File): Promise<FrameSource> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await waitForMetadata(video).catch(() => {
    URL.revokeObjectURL(url);
    throw new Error('Diese Videodatei kann der Browser nicht abspielen (am besten MP4/H.264 oder WebM).');
  });
  if (!Number.isFinite(video.duration)) throw new Error('Videodauer unbekannt – bitte andere Datei verwenden.');
  return new VideoSource('file', video, video.duration, () => URL.revokeObjectURL(url));
}
