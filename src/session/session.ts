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

export const TIME_KEY = 't';

export class Session {
  channels: ChannelDef[] = [];
  samples: Sample[] = [];
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
  /** Manuelle Korrektur eines Wertes. */
  setValue(index: number, channelId: string, v: number | null): void {
    const s = this.samples[index];
    if (s) s.values[channelId] = { v, c: 1 };
  }

  private channelValues(id: string): (number | null)[] {
    const raw = this.samples.map((s) => s.values[id]?.v ?? null);
    return this.smoothing >= 3 ? medianFilter(raw, this.smoothing) : raw;
  }

  /** Wertetabelle (nach Glättung) – Grundlage für Export. */
  table(): { header: string[]; rows: (number | null)[][] } {
    const cols = this.channels.map((c) => this.channelValues(c.id));
    return {
      header: ['Zeit / s', ...this.channels.map((c) => (c.unit ? `${c.name} / ${c.unit}` : c.name))],
      rows: this.samples.map((s, i) => [s.t, ...cols.map((col) => col[i])]),
    };
  }

  /** Datenreihe für Diagramm: x = Zeit oder Kanal-ID, y = Kanal-ID. Punkte mit null fallen weg. */
  series(xKey: string, yId: string): SeriesPoint[] {
    const ys = this.channelValues(yId);
    const xs = xKey === TIME_KEY ? this.samples.map((s) => s.t) : this.channelValues(xKey);
    const out: SeriesPoint[] = [];
    this.samples.forEach((s, i) => {
      const x = xs[i], y = ys[i];
      if (x === null || y === null) return;
      out.push({ x, y, c: s.values[yId]?.c ?? 0 });
    });
    return out;
  }
}
