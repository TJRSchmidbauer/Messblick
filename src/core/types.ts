/** RGBA-Bild (wie ImageData, aber ohne DOM-Abhängigkeit – auch in Tests nutzbar). */
export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReadResult {
  /** Abgelesener Wert, null wenn nicht lesbar. */
  value: number | null;
  /** 0..1 – wie sicher die Ablesung ist. */
  confidence: number;
}

export function luminance(f: Frame, x: number, y: number): number {
  const i = (y * f.width + x) * 4;
  return 0.299 * f.data[i] + 0.587 * f.data[i + 1] + 0.114 * f.data[i + 2];
}
