import { describe, expect, it } from 'vitest';
import { TASK_LIMITS, parseTask, serializeTask, type TaskFile } from '../src/task';

const base = { title: 'Federkonstante bestimmen', text: 'Bestimme D.\n\nBegründe.', hints: ['Masse in g eintippen', 'T mehrmals messen'] };

describe('Aufgabendatei', () => {
  it('Rundlauf: speichern und wieder lesen ergibt dasselbe', () => {
    const t = parseTask(serializeTask({ ...base, templateId: 'federpendel', inputs: { Dnenn: { v: '20', rel: '2' } }, hideResults: true, channels: [{ type: 'digital', name: 'Zeit', unit: 's' }] })) as TaskFile;
    expect(t.title).toBe(base.title);
    expect(t.text).toBe(base.text);
    expect(t.hints).toEqual(base.hints);
    expect(t.templateId).toBe('federpendel');
    expect(t.inputs).toEqual({ Dnenn: { v: '20', rel: '2' } });
    expect(t.hideResults).toBe(true);
    expect(t.channels).toHaveLength(1);
  });

  it('fremde oder kaputte Dateien werden mit verständlicher Meldung abgelehnt', () => {
    expect((parseTask('kein json') as { error: string }).error).toMatch(/kein JSON/);
    expect((parseTask('{"kind":"pmw-calibration","version":1}') as { error: string }).error).toMatch(/keine Aufgabe/);
    expect((parseTask('null') as { error: string }).error).toMatch(/keine Aufgabe/);
    expect((parseTask(serializeTask({ ...base, title: '   ' })) as { error: string }).error).toMatch(/keinen Titel/);
  });

  it('kürzt zu lange Texte, begrenzt Hinweise, entfernt unbekannte Felder', () => {
    const t = parseTask(JSON.stringify({ kind: 'pmw-task', version: 1, title: 'x'.repeat(500), text: 'y'.repeat(9000), hints: Array.from({ length: 30 }, (_, i) => `Hinweis ${i}`.padEnd(400, '.')), evil: '<script>', templateId: 'gibt-es-nicht' })) as TaskFile;
    expect(t.title).toHaveLength(TASK_LIMITS.title);
    expect(t.text).toHaveLength(TASK_LIMITS.text);
    expect(t.hints).toHaveLength(TASK_LIMITS.hints);
    expect(t.hints[0].length).toBeLessThanOrEqual(TASK_LIMITS.hint);
    expect('evil' in t).toBe(false);
    expect(t.templateId).toBeUndefined();
  });

  it('Eingaben und Kanäle: nur Gültiges bleibt, höchstens vier Geräte', () => {
    const t = parseTask(JSON.stringify({
      kind: 'pmw-task', version: 1, title: 'T',
      inputs: { R: { v: '1000', rel: '1' }, kaputt: 5, ' ': { v: 'a'.repeat(100), rel: null } },
      channels: [{ type: 'analog', name: 'A', unit: 'V' }, { type: 'foo', name: 'B', unit: '' }, 7, { type: 'digital', name: 'C', unit: 'A' }, { type: 'digital', name: 'D', unit: 'A' }, { type: 'digital', name: 'E', unit: 'A' }, { type: 'digital', name: 'F', unit: 'A' }],
    })) as TaskFile;
    expect(Object.keys(t.inputs!)).toContain('R');
    expect(Object.keys(t.inputs!)).not.toContain('kaputt');
    const long = Object.values(t.inputs!).find((v) => v.v.length > 0 && v.v.startsWith('aaa'))!;
    expect(long.v).toHaveLength(TASK_LIMITS.input);
    expect(t.channels!.length).toBeLessThanOrEqual(TASK_LIMITS.channels);
    expect((t.channels as { type: string }[]).every((c) => c.type === 'analog' || c.type === 'digital')).toBe(true);
  });
});
