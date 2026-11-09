import { createFrame, drawAnalogDial, drawSevenSegment } from '../core/synth';
import type { Frame } from '../core/types';
import type { FrameSource } from './types';

/**
 * Demo-Quelle: Zeigerinstrument (Spannung 0–10 V) und Digitalanzeige (Strom) mit sinusförmigem Verlauf.
 * Verhält sich wie Kamera (Uhrzeit) und Datei (30 s, seek).
 */
export const DEMO = {
  width: 640, height: 360, duration: 30,
  dial: { cx: 190, cy: 220, r: 120, a0: 135, a1: 405, vmax: 10 },
  display: { x: 380, y: 140, w: 220, h: 90, digits: 4 },
};
export const demoVoltage = (t: number): number => 5 + 4 * Math.sin(t / 3);
export const demoCurrent = (t: number): number => Math.round(demoVoltage(t) * 0.2 * 100) / 100 + 0.1;

export class DemoSource implements FrameSource {
  kind = 'demo' as const;
  width = DEMO.width;
  height = DEMO.height;
  duration = DEMO.duration;
  private start = performance.now();
  private fixed: number | null = null;

  time(): number {
    return this.fixed ?? (performance.now() - this.start) / 1000;
  }
  async seek(t: number): Promise<void> {
    this.fixed = t;
  }
  stop(): void {}
  /** Zurück auf Uhrzeit-Betrieb (Livemodus). */
  live(): void {
    if (this.fixed !== null) {
      this.start = performance.now() - this.fixed * 1000;
      this.fixed = null;
    }
  }

  grab(): Frame {
    const t = this.time();
    const f = createFrame(DEMO.width, DEMO.height, 215);
    const d = DEMO.dial;
    const rad = (x: number) => (x * Math.PI) / 180;
    const theta = rad(d.a0 + ((d.a1 - d.a0) * demoVoltage(t)) / d.vmax);
    drawAnalogDial(f, d.cx, d.cy, d.r, theta, { ticks: { from: rad(d.a0), to: rad(d.a1), count: 10 } });
    const s = DEMO.display;
    drawSevenSegment(f, s.x, s.y, s.w, s.h, demoCurrent(t).toFixed(2), s.digits, { fg: 25, bg: 190 });
    return f;
  }
}
