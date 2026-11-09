export interface CsvOptions {
  /** true: Semikolon + Dezimalkomma (deutsches Excel). */
  german?: boolean;
}

export function toCsv(table: { header: string[]; rows: (number | null)[][] }, opts: CsvOptions = {}): string {
  const sep = opts.german ? ';' : ',';
  const fmt = (v: number | null): string => {
    if (v === null) return '';
    const s = String(v);
    return opts.german ? s.replace('.', ',') : s;
  };
  const esc = (s: string): string => (/[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [table.header.map(esc).join(sep), ...table.rows.map((r) => r.map(fmt).join(sep))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
