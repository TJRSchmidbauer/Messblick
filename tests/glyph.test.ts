import { describe, expect, it } from 'vitest';
import { readDigital, type DigitalCalibration } from '../src/readers/digital';
import { learnGlyphs, readGlyph } from '../src/readers/glyph';
import { addGradient, createFrame, drawDotMatrix, drawSevenSegment, shearRegion } from '../src/core/synth';
import type { Frame } from '../src/core/types';

const ROI = { x: 20, y: 20, w: 200, h: 80 };
const cal = (over: Partial<DigitalCalibration> = {}): DigitalCalibration => ({
  type: 'digital', roi: ROI, digits: 4, decimals: null, polarity: 'auto', style: 'glyph', ...over,
});
const dots = (text: string, cells: number, o: { fg?: number; bg?: number; dotScale?: number } = {}): Frame => {
  const f = createFrame(260, 140, 128);
  drawDotMatrix(f, ROI.x, ROI.y, ROI.w, ROI.h, text, cells, o);
  return f;
};
/** LCD: 7-Segment mit schwachem Kontrast, schräg und mit Lichtverlauf. */
const lcd = (text: string, o: { fg?: number; bg?: number; shear?: number; gradient?: number } = {}): Frame => {
  const f = createFrame(260, 140, 128);
  const bg = o.bg ?? 150;
  drawSevenSegment(f, ROI.x, ROI.y, ROI.w, ROI.h, text, 4, { fg: o.fg ?? 105, bg });
  if (o.shear) shearRegion(f, ROI.x, ROI.y, ROI.w, ROI.h, o.shear, ROI.w / 4, bg);
  if (o.gradient) addGradient(f, ROI.x, ROI.y, ROI.w, ROI.h, o.gradient);
  return f;
};
const noisy = (f: Frame, amp: number): Frame => {
  let seed = 7;
  for (let i = 0; i < f.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed >>> 24) / 255 - 0.5) * amp;
    for (let k = 0; k < 3; k++) f.data[i + k] = Math.max(0, Math.min(255, f.data[i + k] + n));
  }
  return f;
};

describe('Zeichenvergleich: Punktmatrix', () => {
  it.each([
    ['1234', 4, 1234],
    ['12.34', 5, 12.34],
    ['-0.50', 5, -0.5],
    ['  7.8', 5, 7.8],
    ['9086', 4, 9086],
    ['5.0', 3, 5],
  ])('erkennt "%s"', (text, cells, expected) => {
    const r = readGlyph(dots(text, cells), cal({ digits: cells }));
    expect(r.value).toBeCloseTo(expected, 6);
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it('helle Punkte auf dunklem Grund (Hintergrundbeleuchtung)', () => {
    const r = readGlyph(dots('42.7', 4 + 1, { fg: 240, bg: 25 }), cal({ digits: 5 }));
    expect(r.value).toBeCloseTo(42.7, 6);
  });

  it('größere, fast quadratische Punkte', () => {
    expect(readGlyph(dots('360', 3, { dotScale: 0.95 }), cal({ digits: 3 })).value).toBe(360);
  });

  it('verrauschtes Bild', () => {
    expect(readGlyph(noisy(dots('18.6', 5), 50), cal({ digits: 5 })).value).toBeCloseTo(18.6, 6);
  });

  it('feste Nachkommastellen ohne sichtbaren Punkt', () => {
    expect(readGlyph(dots('1234', 4), cal({ decimals: 2 })).value).toBeCloseTo(12.34, 6);
  });
});

describe('Zeichenvergleich: LCD mit schwachem Kontrast', () => {
  it.each(['12.34', '0.05', '-1.50', '86.20'])('erkennt "%s" bei Kontrast 45, Schrägschrift und Lichtverlauf', (text) => {
    const f = lcd(text, { shear: 0.15, gradient: 40 });
    const r = readGlyph(f, cal());
    expect(r.value).toBeCloseTo(Number(text), 6);
  });

  it('Modus "auto" übernimmt, wo die Segmentabtastung scheitert', () => {
    const f = lcd('31.41', { shear: 0.2, gradient: 60 });
    const seg = readDigital(f, cal({ style: 'segment' }));
    const auto = readDigital(f, cal({ style: 'auto' }));
    expect(auto.value).toBeCloseTo(31.41, 6);
    // Die Segmentabtastung allein ist hier schlechter (falscher oder fehlender Wert, oder unsicherer)
    expect(seg.value === null || seg.value !== 31.41 || seg.confidence < auto.confidence).toBe(true);
  });
});

describe('Modus "auto" und Abwärtskompatibilität', () => {
  it('gute 7-Segment-Anzeige bleibt bei der Segmentabtastung (gleiches Ergebnis wie ohne Stil)', () => {
    const f = createFrame(260, 140, 128);
    drawSevenSegment(f, ROI.x, ROI.y, ROI.w, ROI.h, '12.34', 4);
    const old = readDigital(f, cal({ style: undefined }));
    const auto = readDigital(f, cal({ style: 'auto' }));
    expect(old.value).toBeCloseTo(12.34, 6);
    expect(auto).toEqual(old);
  });

  it('Punktmatrix wird mit "auto" erkannt, obwohl die Segmentabtastung nichts Sinnvolles liefert', () => {
    const r = readDigital(dots('25.4', 5), cal({ style: 'auto', digits: 5 }));
    expect(r.value).toBeCloseTo(25.4, 6);
  });

  it('leeres Bild und zu wenig Kontrast → keine Ablesung', () => {
    expect(readGlyph(createFrame(260, 140, 128), cal()).value).toBeNull();
    expect(readGlyph(lcd('12.34', { fg: 140, bg: 150 }), cal()).value).toBeNull();
  });

  it('Rauschen allein wird nicht als Zahl gelesen', () => {
    expect(readGlyph(noisy(createFrame(260, 140, 128), 120), cal()).value).toBeNull();
  });
});

describe('Anlernen eigener Zeichen', () => {
  // stark geneigte Schrift (0,4): außerhalb dessen, was die eingebauten Vorlagen abdecken
  const slanted = (text: string): Frame => {
    const f = createFrame(260, 140, 128);
    drawSevenSegment(f, ROI.x, ROI.y, ROI.w, ROI.h, text, 4, { fg: 20, bg: 235 });
    shearRegion(f, ROI.x, ROI.y, ROI.w, ROI.h, 0.4, ROI.w / 4, 235);
    return f;
  };

  it('angelernte Zeichen verbessern das Ergebnis und bleiben als Text speicherbar', () => {
    const base = cal();
    const out = learnGlyphs(slanted('1234'), base, '1234');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.added).toBe(4);
    const trained = cal({ learned: JSON.parse(JSON.stringify(out.learned)) });
    const after = readGlyph(slanted('4321'), trained);
    expect(after.value).toBe(4321);
    expect(after.confidence).toBeGreaterThan(0.8);
    expect(after.confidence).toBeGreaterThan(readGlyph(slanted('4321'), base).confidence);
    expect(readGlyph(slanted('2143'), trained).value).toBe(2143);
  });

  it('Dezimalpunkt in der Zelle zählt beim Anlernen nicht als Zeichen', () => {
    const out = learnGlyphs(slanted('1234'), cal(), '12.34');
    expect(out.ok && out.added).toBe(4);
  });

  it('zu viele Zeichen, Leereingabe und unlesbarer Ausschnitt melden verständliche Fehler', () => {
    const f = slanted('1234');
    const tooMany = learnGlyphs(f, cal(), '123456');
    expect(!tooMany.ok && tooMany.error).toMatch(/mehr Zeichen als Ziffern/);
    const empty = learnGlyphs(f, cal(), '  ');
    expect(!empty.ok && empty.error).toMatch(/eintippen/);
    const blank = learnGlyphs(createFrame(260, 140, 128), cal(), '1234');
    expect(!blank.ok && blank.error).toMatch(/nicht lesbar/);
  });

  it('pro Zeichen bleiben höchstens vier Muster erhalten; kaputte Einträge stören nicht', () => {
    let c = cal();
    for (let i = 0; i < 6; i++) {
      const out = learnGlyphs(slanted('1111'), c, '1111');
      if (out.ok) c = { ...c, learned: out.learned };
    }
    expect(c.learned!.filter((l) => l.ch === '1').length).toBe(4);
    const broken = cal({ learned: [{ ch: '7', grid: 'xyz' }, { ch: 5 as unknown as string, grid: '' }] });
    expect(readGlyph(dots('1234', 4), broken).value).toBe(1234);
  });
});
