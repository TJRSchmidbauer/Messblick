import type { Calibration } from './readers';
import type { ChannelDef, Run, Sample } from './session/session';

export const STORAGE_KEY = 'pmw.v1';

export interface SavedChannel {
  id: string;
  type: 'analog' | 'digital';
  name: string;
  unit: string;
  cal: Calibration | null;
  /** Rohdaten für verschiebbare Punkte / Rechteck. */
  raw: unknown;
  bigArc: boolean;
  pointerDark: boolean;
  /** Drehpunkt aus drei Skalenpunkten berechnet (fehlt in älteren Dateien). */
  pivotHidden?: boolean;
  /** Roter Zeiger, nach Farbe gelesen (fehlt in älteren Dateien). */
  pointerRed?: boolean;
  roi: unknown;
  digits: number;
  decimals: string;
  polarity: string;
  /** Leseverfahren der Digitalanzeige; fehlt in älteren Dateien (dann Segmentabtastung). */
  style?: string;
  /** Angelernte Zeichen (Digitalanzeige). */
  learned?: { ch: string; grid: string }[];
  /** Messunsicherheit (Modus und Eingaben als Text). */
  unc?: unknown;
}

export interface SavedState {
  version: 1;
  channels: SavedChannel[];
  nextId: number;
  hz: number;
  theme: string;
  smoothing: number;
  /** Parameterreihe (siehe main.ts); fehlt in älteren Sitzungen. */
  variation?: unknown;
  /** Gewählte Versuchsvorlage mit Eingaben; fehlt in älteren Sitzungen. */
  template?: unknown;
  /** Gezeichnete Vorhersage (siehe analysis/prediction.ts); fehlt in älteren Sitzungen. */
  prediction?: unknown;
  /** Markerverfolgung (Vorlage, Startzeit, Maßstab); fehlt in älteren Sitzungen. */
  track?: unknown;
  /** Lichtschranke (Zone, Name, Breite); fehlt in älteren Sitzungen. */
  gate?: unknown;
  /** Geladene Aufgabe (siehe task.ts) und ob das Ergebnis schon aufgedeckt wurde; fehlt in älteren Sitzungen. */
  task?: unknown;
  /** Bildanker (Vorlage und Position); fehlt in älteren Sitzungen. */
  anchor?: unknown;
  session: { channels: ChannelDef[]; samples: Sample[]; runs: Run[] };
}

export function serialize(state: SavedState): string {
  return JSON.stringify(state);
}

/** Liest gespeicherten Zustand; bei beschädigten oder fremden Daten null (nie werfen). */
export function parseState(text: string | null): SavedState | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text) as Partial<SavedState>;
    if (s.version !== 1 || !Array.isArray(s.channels) || !s.session) return null;
    return s as SavedState;
  } catch {
    return null;
  }
}

/** Nur die Kalibrierung (ohne Messwerte) als Datei zum Weitergeben. */
export function calibrationFile(channels: SavedChannel[]): string {
  return JSON.stringify({ kind: 'pmw-calibration', version: 1, channels }, null, 2);
}

export function parseCalibrationFile(text: string): SavedChannel[] | null {
  try {
    const o = JSON.parse(text) as { kind?: string; version?: number; channels?: SavedChannel[] };
    if (o.kind !== 'pmw-calibration' || o.version !== 1 || !Array.isArray(o.channels)) return null;
    return o.channels;
  } catch {
    return null;
  }
}
