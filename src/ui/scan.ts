/**
 * QR-Codes mit der Kamera lesen, ohne Internet und ohne Server: Das Bild bleibt im Browser.
 * Nutzt den eingebauten BarcodeDetector, wo es ihn gibt (Chrome auf Android), sonst jsQR (wird erst beim Scannen geladen).
 */

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export interface Scanner { stop(): void }

export async function startScanner(video: HTMLVideoElement, onText: (text: string) => void, opts: { stream?: MediaStream; forceJs?: boolean } = {}): Promise<Scanner> {
  if (!opts.stream && !navigator.mediaDevices?.getUserMedia) throw new Error('Kamerazugriff nicht möglich (HTTPS bzw. unterstützten Browser verwenden).');
  let stream: MediaStream;
  try {
    stream = opts.stream ?? await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  } catch {
    throw new Error('Die Kamera ist nicht freigegeben. Erlaube den Zugriff im Browser und versuche es erneut.');
  }
  video.srcObject = stream;
  video.muted = true;
  await video.play().catch(() => undefined);

  const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const native = !opts.forceJs && BD ? new BD({ formats: ['qr_code'] }) : null;
  const jsQR = native ? null : (await import('jsqr')).default;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let alive = true, timer = 0;

  const tick = async (): Promise<void> => {
    if (!alive) return;
    try {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (native) {
          const found = await native.detect(video);
          if (found[0]) onText(found[0].rawValue);
        } else if (ctx && jsQR) {
          const scale = Math.min(1, 800 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (r) onText(r.data);
        }
      }
    } catch { /* ein Bild ohne Treffer oder ein Lesefehler: weiter */ }
    if (alive) timer = window.setTimeout(() => void tick(), 150);
  };
  void tick();
  return {
    stop() {
      alive = false;
      window.clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
