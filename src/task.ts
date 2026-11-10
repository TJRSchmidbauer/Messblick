import { templateById } from './templates';

/**
 * Aufgabe für Schülerinnen und Schüler: eine Datei, die die Lehrkraft aus ihrem Aufbau erzeugt.
 * Sie enthält Aufgabenstellung, Hinweise, die gewählte Versuchsvorlage mit Eingaben und die Kalibrierung der Geräte.
 * Beim Laden wird alles eingestellt. Die Datei ist Text (JSON) und wird beim Einlesen geprüft und gekürzt.
 */
export interface TaskInputs {
  [id: string]: { v: string; rel: string };
}

export interface TaskFile {
  kind: 'pmw-task';
  version: 1;
  title: string;
  /** Aufgabenstellung, Absätze durch Leerzeilen. */
  text: string;
  /** Hinweise oder Schritte, je ein Satz. */
  hints: string[];
  templateId?: string;
  inputs?: TaskInputs;
  /** Ergebnis der Vorlage zunächst ausblenden (Schüler rechnen selbst und prüfen dann). */
  hideResults?: boolean;
  /** Kalibrierung der Geräte im Format der Kalibrierdatei. */
  channels?: unknown[];
}

export const TASK_LIMITS = { title: 120, text: 4000, hints: 12, hint: 300, input: 30, channels: 4 };

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');

export function serializeTask(t: Omit<TaskFile, 'kind' | 'version'>): string {
  const file: TaskFile = { kind: 'pmw-task', version: 1, ...t };
  return JSON.stringify(file, null, 2);
}

/** Liest eine Aufgabendatei; unbekannte Felder fallen weg, zu lange Texte werden gekürzt. */
export function parseTask(text: string): TaskFile | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: 'Die Datei ist keine gültige Aufgabendatei (kein JSON).' }; }
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o.kind !== 'pmw-task' || o.version !== 1) return { error: 'Diese Datei ist keine Aufgabe dieser App.' };
  const title = clip(o.title, TASK_LIMITS.title).trim();
  if (!title) return { error: 'Die Aufgabe hat keinen Titel.' };
  const task: TaskFile = {
    kind: 'pmw-task', version: 1, title,
    text: clip(o.text, TASK_LIMITS.text),
    hints: Array.isArray(o.hints) ? o.hints.slice(0, TASK_LIMITS.hints).map((h) => clip(h, TASK_LIMITS.hint).trim()).filter(Boolean) : [],
  };
  if (typeof o.templateId === 'string' && templateById(o.templateId)) task.templateId = o.templateId;
  if (o.inputs && typeof o.inputs === 'object') {
    const inputs: TaskInputs = {};
    for (const [k, v] of Object.entries(o.inputs as Record<string, unknown>).slice(0, 12)) {
      const e = v as { v?: unknown; rel?: unknown } | null;
      if (e && typeof e === 'object') inputs[clip(k, 20)] = { v: clip(e.v, TASK_LIMITS.input), rel: clip(e.rel, TASK_LIMITS.input) };
    }
    if (Object.keys(inputs).length) task.inputs = inputs;
  }
  if (o.hideResults === true) task.hideResults = true;
  if (Array.isArray(o.channels)) {
    const ok = o.channels.slice(0, TASK_LIMITS.channels).filter((c): c is Record<string, unknown> => {
      const e = c as Record<string, unknown> | null;
      return !!e && typeof e === 'object' && (e.type === 'analog' || e.type === 'digital') && typeof e.name === 'string' && typeof e.unit === 'string';
    });
    if (ok.length) task.channels = ok;
  }
  return task;
}
