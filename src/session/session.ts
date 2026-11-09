import { medianFilter } from './smooth';

export interface ChannelDef {
  id: string;
  name: string;
  unit: string;
}

export interface Sample {
  /** Sekunden seit Aufnahmebeginn. */
  t: number;
  values: Record<string, { v: number | null; c: number }>;
}

export interface SeriesPoint {
  x: number;
  y: number;
  /** Ablesesicherheit (0..1) des Punktes, bei manueller Korrektur 1. */
  c: number;
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
export function seriesOf(samples: Sample[], xKey: string, yId: string, smoothing = 0): SeriesPoint[] {
  const ys = columnOf(samples, yId, smoothing);
  const xs = xKey === TIME_KEY ? samples.map((s) => s.t) : columnOf(samples, xKey, smoothing);
  const out: SeriesPoint[] = [];
  samples.forEach((s, i) => {
    const x = xs[i], y = ys[i];
    if (x === null || y === null) return;
    out.push({ x, y, c: s.values[yId]?.c ?? 0 });
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
    return seriesOf(this.samples, xKey, yId, this.smoothing);
  }
}
