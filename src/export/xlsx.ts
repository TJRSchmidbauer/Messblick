import * as XLSX from 'xlsx';

type Table = { header: string[]; rows: (number | string | null)[][] };

/** Blattnamen: max. 31 Zeichen, ohne \ / ? * [ ] : und eindeutig. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Messwerte';
  let name = base, n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 28)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
}

export function toXlsx(sheets: { name: string; table: Table }[] | Table, sheetNameOne = 'Messwerte'): Uint8Array {
  const list = Array.isArray(sheets) ? sheets : [{ name: sheetNameOne, table: sheets }];
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of list) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.table.header, ...s.table.rows]), sheetName(s.name, used));
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
