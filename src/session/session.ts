import { medianFilter } from './smooth';
import { derivative, evalWithError, integral, parseExpression, type Expression } from '../analysis/derive';
import { sigmaOf, type UncertaintyConfig } from '../analysis/uncertainty';

/** Abgeleiteter Kanal: Werte werden aus anderen Kanälen berechnet (siehe Session.recompute). */
export interface DerivedDef {
  kind: 'derivative' | 'integral' | 'formula';
  /** Quellkanal (Ableitung, Integral). */
  of?: string;
  /** Formel mit Kanalnamen (Leerzeichen als _), nur bei kind 'formula'. */
  expr?: string;
}

export interface ChannelDef {
  id: string;
  name: string;
  unit: string;
  /** Messunsicherheit des Geräts; fehlt = unbekannt. */
  uncertainty?: UncertaintyConfig;
  derived?: DerivedDef;
}

export interface Sample {
  /** Sekunden seit Aufnahmebeginn. */
  t: number;
  /** v: Wert, c: Ablesesicherheit, s: Unsicherheit (nur bei abgeleiteten Kanälen berechnet). */
  values: Record<string, { v: number | null; c: number; s?: number | null }>;
}

export interface SeriesPoint {
  x: number;
  y: number;
  /** Ablesesicherheit (0..1) des Punktes, bei manueller Korrektur 1. */
  c: number;
  /** Unsicherheit des y-Wertes, falls bekannt. */
  sy?: number;
}

/** Gesicherte Messreihe (zum Vergleich im Graphen). */
export interface Run {
  name: string;
  channels: ChannelDef[];
  samples: Sample[];
}

export const TIME_KEY = 't';

function columnOf(samples: Sample[], id: string, smoothing: number): (number | null)[] {
  const raw = samples.map((s) => s.values[id]?.v ?? null);
  return smoothing >= 3 ? medianFilter(raw, smoothing) : raw;
}

/** Datenreihe aus beliebigen Samples: x = Zeit oder Kanal-ID, y = Kanal-ID. Punkte mit null fallen weg. */
export function seriesOf(samples: Sample[], xKey: string, yId: string, smoothing = 0, defs: ChannelDef[] = []): SeriesPoint[] {
  const unc = defs.find((d) => d.id === yId)?.uncertainty;
  const ys = columnOf(samples, yId, smoothing);
  const xs = xKey === TIME_KEY ? samples.map((s) => s.t) : columnOf(samples, xKey, smoothing);
  const out: SeriesPoint[] = [];
  samples.forEach((s, i) => {
    const x = xs[i], y = ys[i];
    if (x === null || y === null) return;
    const sy = s.values[yId]?.s ?? sigmaOf(unc, y);
    out.push({ x, y, c: s.values[yId]?.c ?? 0, ...(sy !== null && sy !== undefined ? { sy } : {}) });
  });
  return out;
}

export function tableOf(
  channels: ChannelDef[], samples: Sample[], smoothing = 0,
): { header: string[]; rows: (number | null)[][] } {
  const cols = channels.map((c) => columnOf(samples, c.id, smoothing));
  return {
    header: ['Zeit / s', ...channels.map((c) => (c.unit ? `${c.name} / ${c.unit}` : c.name))],
    rows: samples.map((s, i) => [s.t, ...cols.map((col) => col[i])]),
  };
}

export class Session {
  channels: ChannelDef[] = [];
  samples: Sample[] = [];
  runs: Run[] = [];
  /** Fensterbreite des Median-Filters (0/1 = aus). */
  smoothing = 0;

  addChannel(def: ChannelDef): void {
    this.channels.push(def);
  }
  removeChannel(id: string): void {
    this.channels = this.channels.filter((c) => c.id !== id);
    for (const s of this.samples) delete s.values[id];
  }
  addSample(t: number, values: Sample['values']): void {
    this.samples.push({ t, values });
  }
  clear(): void {
    this.samples = [];
  }
  /** Aktuelle Messreihe unter einem Namen sichern und für eine neue Aufnahme leeren. */
  archive(name: string): void {
    if (!this.samples.length) return;
    this.runs.push({
      name,
      channels: this.channels.map((c) => ({ ...c })),
      samples: this.samples,
    });
    this.samples = [];
  }
  /** Manuelle Korrektur eines Wertes. */
  setValue(index: number, channelId: string, v: number | null): void {
    const s = this.samples[index];
    if (s) s.values[channelId] = { v, c: 1 };
  }

  table(): { header: string[]; rows: (number | null)[][] } {
    return tableOf(this.channels, this.samples, this.smoothing);
  }
  series(xKey: string, yId: string): SeriesPoint[] {
    return seriesOf(this.samples, xKey, yId, this.smoothing, this.channels);
  }

  /** Bezeichner in Formeln: Kanalname mit `_` statt Leerzeichen (z. B. `Gerät_1`). */
  static identOf(name: string): string {
    return name.trim().replace(/\s+/g, '_');
  }

  /**
   * Berechnet die Werte aller abgeleiteten Kanäle neu (Reihenfolge der Definition, spätere dürfen auf frühere zugreifen).
   * Ableitung auf der geglätteten Reihe, wenn Glättung aktiv ist. Liefert je Kanal eine Meldung, falls etwas nicht berechenbar war.
   */
  recompute(): Record<string, string> {
    const problems: Record<string, string> = {};
    for (const ch of this.channels) {
      const d = ch.derived;
      if (!d) continue;
      for (const s of this.samples) delete s.values[ch.id];
      if (d.kind === 'formula') {
        let expr: Expression;
        try { expr = parseExpression(d.expr ?? ''); } catch (e) { problems[ch.id] = (e as Error).message; continue; }
        const byIdent = new Map(this.channels.filter((c) => c.id !== ch.id).map((c) => [Session.identOf(c.name), c]));
        const missing = expr.vars.filter((v) => !byIdent.has(v));
        if (missing.length) { problems[ch.id] = `Unbekannte Größe: ${missing.join(', ')}.`; continue; }
        let skipped = 0;
        for (const s of this.samples) {
          const vals: Record<string, number> = {}, sigs: Record<string, number | null> = {};
          let ok = true, conf = 1;
          for (const v of expr.vars) {
            const src = byIdent.get(v)!;
            const cell = s.values[src.id];
            if (!cell || cell.v === null) { ok = false; break; }
            vals[v] = cell.v;
            sigs[v] = cell.s ?? sigmaOf(src.uncertainty, cell.v);
            conf = Math.min(conf, cell.c);
          }
          const r = ok ? evalWithError(expr, vals, sigs) : null;
          if (!r || !Number.isFinite(r.value)) { skipped++; s.values[ch.id] = { v: null, c: 0 }; continue; }
          s.values[ch.id] = { v: r.value, c: conf, s: r.sigma };
        }
        if (skipped) problems[ch.id] = `${skipped} Punkt(e) nicht berechenbar (fehlender Wert oder Division durch 0).`;
      } else {
        const src = this.channels.find((c) => c.id === d.of);
        if (!src) { problems[ch.id] = 'Quellgröße fehlt.'; continue; }
        const col = columnOf(this.samples, src.id, this.smoothing);
        const idx: number[] = [];
        const pts = this.samples.flatMap((s, i) => (col[i] === null ? [] : (idx.push(i), [{ x: s.t, y: col[i] as number }])));
        const out = d.kind === 'derivative' ? derivative(pts) : integral(pts);
        idx.forEach((si, k) => {
          this.samples[si].values[ch.id] = Number.isFinite(out[k]) ? { v: out[k], c: this.samples[si].values[src.id]?.c ?? 0 } : { v: null, c: 0 };
        });
      }
    }
    return problems;
  }
}
