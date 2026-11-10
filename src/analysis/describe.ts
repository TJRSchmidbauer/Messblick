/**
 * Beschreibt einen Graphen in Worten (für Screenreader und zum Vorlesen) und bereitet die Hörbarmachung vor.
 * Die Beschreibung bleibt vorsichtig: Sie nennt Zahlen und Verlauf, keine physikalische Deutung.
 */
export interface DescPoint {
  x: number;
  y: number;
}

export interface DescribeOptions {
  xName: string;
  xUnit: string;
  yName: string;
  yUnit: string;
  /** Ergebniszeile eines Fits, falls vorhanden. */
  fit?: string;
}

/** Zahl mit 3 gültigen Stellen, deutsches Komma. */
export const num = (v: number): string => String(Number(v.toPrecision(3))).replace('.', ',');
const withUnit = (v: number, unit: string): string => `${num(v)}${unit ? ` ${unit}` : ''}`;

export type Trend = 'rising' | 'falling' | 'flat' | 'oscillating';

export interface SeriesShape {
  trend: Trend;
  /** Bei Schwingung: Zahl der Maxima und mittlerer Abstand der Maxima in x. */
  maxima: number;
  period: number | null;
  /** Bei monotonem Verlauf: wird flacher, gleichmäßig oder steiler. */
  curve: 'flattening' | 'steady' | 'steepening' | null;
}

/** Erkennt die Grundform: steigend, fallend, gleichbleibend oder schwingend. Punkte müssen nach x sortiert sein. */
export function analyzeShape(pts: DescPoint[]): SeriesShape {
  const none: SeriesShape = { trend: 'flat', maxima: 0, period: null, curve: null };
  if (pts.length < 3) return none;
  const ys = pts.map((p) => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo;
  // praktisch konstant: Spanne winzig im Vergleich zum Niveau
  if (!(span > 0) || span < 0.02 * Math.max(Math.abs(hi), Math.abs(lo))) return none;
  // geglättet (Mittel über 3); Umkehrpunkte erst, wenn der Wert um mehr als 25 % der Spanne zurückgeht
  const sm = ys.map((_, i) => (ys[Math.max(0, i - 1)] + ys[i] + ys[Math.min(ys.length - 1, i + 1)]) / 3);
  const thr = 0.25 * span;
  const ext: { i: number; max: boolean }[] = [];
  let state: 'up' | 'down' | null = null, e = 0;
  for (let i = 1; i < sm.length; i++) {
    const v = sm[i];
    if (state === null) {
      if (v - sm[e] > thr) { state = 'up'; e = i; } else if (sm[e] - v > thr) { state = 'down'; e = i; }
    } else if (state === 'up') {
      if (v > sm[e]) e = i;
      else if (sm[e] - v > thr) { ext.push({ i: e, max: true }); state = 'down'; e = i; }
    } else {
      if (v < sm[e]) e = i;
      else if (v - sm[e] > thr) { ext.push({ i: e, max: false }); state = 'up'; e = i; }
    }
  }
  const maxima = ext.filter((e) => e.max);
  if (ext.length >= 3) {
    const xs = maxima.map((e) => pts[e.i].x);
    const period = xs.length >= 2 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : null;
    return { trend: 'oscillating', maxima: maxima.length, period, curve: null };
  }
  const net = ys[ys.length - 1] - ys[0];
  if (Math.abs(net) < 0.1 * span) return { trend: 'flat', maxima: 0, period: null, curve: null };
  const third = Math.max(1, Math.floor(pts.length / 3));
  const slope = (a: number, b: number): number => (pts[b].y - pts[a].y) / ((pts[b].x - pts[a].x) || 1);
  const s1 = Math.abs(slope(0, third)), s3 = Math.abs(slope(pts.length - 1 - third, pts.length - 1));
  const curve = s3 < 0.5 * s1 ? 'flattening' : s3 > 2 * s1 ? 'steepening' : 'steady';
  return { trend: net > 0 ? 'rising' : 'falling', maxima: 0, period: null, curve };
}

/** Sätze zur Beschreibung des Graphen; `text` ist alles zusammen. */
export function describeSeries(points: DescPoint[], o: DescribeOptions): { lines: string[]; text: string } {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  if (pts.length < 2) {
    const lines = ['Der Graph hat noch zu wenige Messpunkte für eine Beschreibung.'];
    return { lines, text: lines[0] };
  }
  const first = pts[0], last = pts[pts.length - 1];
  const ys = pts.map((p) => p.y);
  const iMax = ys.indexOf(Math.max(...ys)), iMin = ys.indexOf(Math.min(...ys));
  const x = (v: number): string => withUnit(v, o.xUnit), y = (v: number): string => withUnit(v, o.yUnit);
  const shape = analyzeShape(pts);
  const lines: string[] = [];
  lines.push(`Graph von ${o.yName} über ${o.xName} mit ${pts.length} Messpunkten. ${o.xName} reicht von ${x(first.x)} bis ${x(last.x)}.`);
  lines.push(`${o.yName} liegt zwischen ${y(ys[iMin])} (bei ${o.xName} = ${x(pts[iMin].x)}) und ${y(ys[iMax])} (bei ${o.xName} = ${x(pts[iMax].x)}). Am Anfang ${y(first.y)}, am Ende ${y(last.y)}.`);
  switch (shape.trend) {
    case 'rising':
      lines.push(`Der Verlauf steigt${shape.curve === 'flattening' ? ' und wird dabei flacher' : shape.curve === 'steepening' ? ' und wird dabei steiler' : ' gleichmäßig'}.`);
      break;
    case 'falling':
      lines.push(`Der Verlauf fällt${shape.curve === 'flattening' ? ' und nähert sich einem Wert an, er wird flacher' : shape.curve === 'steepening' ? ' und wird dabei steiler' : ' gleichmäßig'}.`);
      break;
    case 'oscillating':
      lines.push(`Der Verlauf schwingt auf und ab: ${shape.maxima} Maxima${shape.period ? `, im Mittel ${x(shape.period)} auseinander` : ''}.`);
      break;
    default:
      lines.push('Der Verlauf bleibt im Wesentlichen gleich.');
  }
  if (o.fit) lines.push(o.fit);
  return { lines, text: lines.join(' ') };
}

/* ----------------------------- Hörbarmachung ----------------------------- */

export interface Note {
  /** Zeitpunkt in s ab Start. */
  at: number;
  /** Frequenz in Hz. */
  freq: number;
}

/** Wert → Tonhöhe: exponentiell (gleiche Verhältnisse = gleiche Intervalle), tiefster Wert unten, höchster oben. */
export function frequencyFor(v: number, min: number, max: number, fLow = 220, fHigh = 880): number {
  if (!(max > min)) return Math.sqrt(fLow * fHigh);
  const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
  return fLow * Math.pow(fHigh / fLow, t);
}

/**
 * Plant die Töne: Die Kurve wird gleichmäßig in x abgetastet (`notesPerSecond`) und in `seconds` Sekunden abgespielt.
 * Der Abstand der Messpunkte in x spielt dadurch keine Rolle (Zeit im Ton entspricht x).
 */
export function sonificationSchedule(points: DescPoint[], seconds: number, notesPerSecond = 30): Note[] {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  if (pts.length < 2 || !(seconds > 0)) return [];
  const ys = pts.map((p) => p.y), min = Math.min(...ys), max = Math.max(...ys);
  const x0 = pts[0].x, span = pts[pts.length - 1].x - x0;
  if (!(span > 0)) return [];
  const n = Math.max(2, Math.round(seconds * notesPerSecond));
  const notes: Note[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1), x = x0 + f * span;
    while (j < pts.length - 2 && pts[j + 1].x < x) j++;
    const a = pts[j], b = pts[j + 1];
    const y = b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    notes.push({ at: f * seconds, freq: frequencyFor(y, min, max) });
  }
  return notes;
}

/** Satz für den Screenreader beim Durchgehen der Messpunkte per Tastatur. */
export function announcePoint(i: number, n: number, p: DescPoint, o: DescribeOptions): string {
  return `Messpunkt ${i + 1} von ${n}: ${o.xName} = ${withUnit(p.x, o.xUnit)}, ${o.yName} = ${withUnit(p.y, o.yUnit)}.`;
}
