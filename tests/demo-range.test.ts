import { describe, expect, it } from 'vitest';
import { createFrame, drawSevenSegment } from '../src/core/synth';
import { readDigital } from '../src/readers/digital';
import { DEMO, demoCurrent } from '../src/source/demo';

describe('Digital-Reader über den ganzen Demo-Wertebereich', () => {
  it('liest jeden Demo-Wert (0–30 s) exakt', () => {
    const s = DEMO.display;
    const bad: string[] = [];
    for (let t = 0; t <= 30; t += 0.05) {
      const f = createFrame(DEMO.width, DEMO.height, 215);
      drawSevenSegment(f, s.x, s.y, s.w, s.h, demoCurrent(t).toFixed(2), s.digits, { fg: 25, bg: 190 });
      const r = readDigital(f, { type: 'digital', roi: { x: 380, y: 140, w: 220, h: 90 }, digits: 4, decimals: null, polarity: 'auto' });
      if (r.value === null || Math.abs(r.value - Number(demoCurrent(t).toFixed(2))) > 1e-9) bad.push(`${t.toFixed(2)}: ${demoCurrent(t).toFixed(2)} -> ${r.value}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
