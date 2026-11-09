import type { Frame, Rect } from './core/types';
import { luminance } from './core/types';

export interface QualityReport {
  /** Klartext-Hinweise für Lehrkraft/Schüler; leer = alles in Ordnung. */
  issues: string[];
}

/**
 * Prüft den Bildausschnitt eines Messgeräts auf typische Aufnahmeprobleme
 * (Unschärfe, Über-/Unterbelichtung, zu wenig Kontrast, zu kleine Darstellung).
 */
export function assessRegion(frame: Frame, region: Rect, opts: { minFeature: number }): QualityReport {
  const x0 = Math.max(1, Math.floor(region.x)), y0 = Math.max(1, Math.floor(region.y));
  const x1 = Math.min(frame.width - 2, Math.ceil(region.x + region.w)), y1 = Math.min(frame.height - 2, Math.ceil(region.y + region.h));
  const issues: string[] = [];
  if (x1 - x0 < 8 || y1 - y0 < 8) return { issues: ['Ausschnitt liegt (teilweise) außerhalb des Bildes.'] };

  let n = 0, sum = 0, sum2 = 0, clipHi = 0, clipLo = 0, lapSum = 0, lapSum2 = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const l = luminance(frame, x, y);
      n++; sum += l; sum2 += l * l;
      if (l > 250) clipHi++;
      if (l < 5) clipLo++;
      const lap = 4 * l - luminance(frame, x - 1, y) - luminance(frame, x + 1, y) - luminance(frame, x, y - 1) - luminance(frame, x, y + 1);
      lapSum += lap; lapSum2 += lap * lap;
    }
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const lapVar = lapSum2 / n - (lapSum / n) ** 2;

  if (std < 18) issues.push('Kontrast zu gering – Licht verbessern oder näher heran.');
  else if (lapVar < 40 * (std / 60)) issues.push('Bild wirkt unscharf – Fokus prüfen (Antippen) oder Kamera ruhiger halten.');
  if (clipHi / n > 0.25) issues.push('Überbelichtet oder Spiegelung – Kamera leicht neigen, Blitz/Fensterreflex vermeiden.');
  if (clipLo / n > 0.4) issues.push('Zu dunkel – mehr Licht auf das Gerät.');
  if (opts.minFeature < 12) issues.push('Gerät erscheint sehr klein im Bild – näher heranrücken oder zoomen.');
  return { issues };
}
