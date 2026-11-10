/**
 * Klassen-Sammelansicht: Jede Gruppe teilt ihr Ergebnis als kurzen Text-Code (oder Link). Die Lehrkraft fügt die Codes
 * zusammen, die App zeigt alle Werte nebeneinander und rechnet Mittelwert, Streuung und Ausreißer.
 * Ohne Server: der Code enthält nur Vorlage, Gruppenname und die Ergebniszeilen, keine Messdaten.
 */

export interface SharedLine {
  label: string;
  unit: string;
  value: number;
  sigma: number | null;
}
export interface SharedResult {
  tpl: string;
  group: string;
  lines: SharedLine[];
}

const PREFIX = 'PMW1.';
const MAX_CODE = 4000;

const toB64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string): string => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeShare(r: SharedResult): string {
  return PREFIX + toB64(JSON.stringify([r.tpl, r.group, r.lines.map((l) => [l.label, l.unit, l.value, l.sigma])]));
}

/** Liest einen Code; null, wenn er ungültig ist (nie eine Ausnahme, die Eingabe kommt von Fremden). */
export function decodeShare(code: string): SharedResult | null {
  try {
    const t = code.trim();
    const i = t.indexOf(PREFIX);
    if (i < 0) return null;
    const body = /^[A-Za-z0-9_-]+/.exec(t.slice(i + PREFIX.length))?.[0] ?? '';
    if (!body || body.length > MAX_CODE) return null;
    const a = JSON.parse(fromB64(body));
    if (!Array.isArray(a) || typeof a[0] !== 'string' || typeof a[1] !== 'string' || !Array.isArray(a[2]) || a[2].length > 8) return null;
    const lines: SharedLine[] = [];
    for (const l of a[2]) {
      if (!Array.isArray(l) || typeof l[0] !== 'string' || typeof l[1] !== 'string' || typeof l[2] !== 'number' || !Number.isFinite(l[2])) return null;
      const sigma = typeof l[3] === 'number' && Number.isFinite(l[3]) && l[3] >= 0 ? l[3] : null;
      lines.push({ label: l[0].slice(0, 80), unit: l[1].slice(0, 20), value: l[2], sigma });
    }
    if (!lines.length) return null;
    return { tpl: a[0].slice(0, 40), group: a[1].slice(0, 40), lines };
  } catch {
    return null;
  }
}

/** Findet alle Codes in einem eingefügten Text (durch Leerzeichen, Zeilen oder Links getrennt); doppelte Gruppen zählen einmal (der letzte gilt). */
export function parseShares(text: string): SharedResult[] {
  const out = new Map<string, SharedResult>();
  for (const m of text.matchAll(/PMW1\.[A-Za-z0-9_-]+/g)) {
    const r = decodeShare(m[0]);
    if (r) out.set(`${r.tpl}|${r.group}|${r.lines[0].label}`, r);
  }
  return [...out.values()];
}

export interface ClassSummary {
  label: string;
  unit: string;
  n: number;
  mean: number;
  /** Standardabweichung der Gruppenwerte (n ≥ 2). */
  sd: number | null;
  /** Standardfehler des Mittelwerts. */
  sem: number | null;
  /** Gewichteter Mittelwert (Gewicht 1/σ²) über die Gruppen, die σ angegeben haben; sonst null. */
  weighted: { value: number; sigma: number } | null;
  /** Gruppen, deren Wert mehr als 2 Standardabweichungen vom Mittel der übrigen abweicht. */
  outliers: string[];
}

/** Fasst die Ergebniszeile gleichen Namens aller Gruppen zusammen. */
export function summarize(results: SharedResult[]): ClassSummary[] {
  const by = new Map<string, { unit: string; items: { group: string; value: number; sigma: number | null }[] }>();
  for (const r of results) for (const l of r.lines) {
    const e = by.get(l.label) ?? { unit: l.unit, items: [] };
    e.items.push({ group: r.group, value: l.value, sigma: l.sigma });
    by.set(l.label, e);
  }
  const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
  const sdOf = (a: number[]): number | null => (a.length < 2 ? null : Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)));
  return [...by.entries()].map(([label, { unit, items }]) => {
    const v = items.map((i) => i.value);
    const sd = sdOf(v);
    const w = items.filter((i) => i.sigma !== null && i.sigma > 0);
    const weighted = w.length >= 2 ? (() => {
      const ws = w.map((i) => 1 / (i.sigma! * i.sigma!)), sw = ws.reduce((a, b) => a + b, 0);
      return { value: w.reduce((s, i, k) => s + i.value * ws[k], 0) / sw, sigma: Math.sqrt(1 / sw) };
    })() : null;
    const outliers: string[] = [];
    if (items.length >= 4) {
      items.forEach((it, k) => {
        const rest = v.filter((_, j) => j !== k), s = sdOf(rest);
        if (s !== null && s > 0 && Math.abs(it.value - mean(rest)) > 2 * s) outliers.push(it.group);
      });
    }
    return { label, unit, n: v.length, mean: mean(v), sd, sem: sd === null ? null : sd / Math.sqrt(v.length), weighted, outliers };
  });
}
