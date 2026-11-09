import * as XLSX from 'xlsx';

export function toXlsx(table: { header: string[]; rows: (number | null)[][] }, sheetName = 'Messwerte'): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([table.header, ...table.rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
