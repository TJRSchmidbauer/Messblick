import type { Frame } from '../core/types';
import type { FrameSource } from './types';

const MAX_WIDTH = 960;

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
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    this.width = Math.round(video.videoWidth * scale);
    this.height = Math.round(video.videoHeight * scale);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
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

  private t0 = performance.now();
  time(): number {
    return this.kind === 'file' ? this.video.currentTime : (performance.now() - this.t0) / 1000;
  }

  grab(): Frame {
    this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
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
