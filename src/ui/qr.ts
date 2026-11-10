/**
 * Minimaler QR-Code-Kodierer (Byte-Modus, Fehlerkorrektur L, Version 1 bis 20) für Gruppenlinks der Klassenansicht.
 * Reine Zahlenarbeit ohne DOM. Aufbau nach ISO/IEC 18004; im Test mit einem unabhängigen Dekoder (jsQR) gegengeprüft.
 */

const ECC_PER_BLOCK = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28];
const NUM_BLOCKS = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8];
export const QR_MAX_VERSION = 20;

const rawModules = (ver: number): number => {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const a = Math.floor(ver / 7) + 2; r -= (25 * a - 10) * a - 55; if (ver >= 7) r -= 36; }
  return r;
};
const dataCodewords = (ver: number): number => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

/** Größte Textlänge in Bytes (UTF-8), die noch hineinpasst. */
export const qrCapacity = (ver = QR_MAX_VERSION): number => dataCodewords(ver) - (ver < 10 ? 2 : 3);

/* ---- Reed-Solomon über GF(256), Polynom 0x11D ---- */
const mul = (x: number, y: number): number => {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
};
const rsDivisor = (deg: number): number[] => {
  const r = new Array<number>(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = mul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = mul(root, 0x02);
  }
  return r;
};
const rsRemainder = (data: number[], div: number[]): number[] => {
  const r = new Array<number>(div.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift()!;
    r.push(0);
    div.forEach((c, i) => { r[i] ^= mul(c, f); });
  }
  return r;
};

const alignPositions = (ver: number): number[] => {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = size - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
  return r;
};

/** Kodiert Text als QR-Matrix (true = dunkel). Wirft, wenn der Text für Version 20 zu lang ist. */
export function encodeQr(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= QR_MAX_VERSION && bytes.length > qrCapacity(ver)) ver++;
  if (ver > QR_MAX_VERSION) throw new Error('Der Text ist für einen QR-Code zu lang.');

  // Datenbits
  const bits: number[] = [];
  const put = (v: number, n: number): void => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) data.push(pad);

  // Blöcke mit Fehlerkorrektur, verschränkt
  const nb = NUM_BLOCKS[ver], ecl = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const shortBlocks = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(ecl);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - ecl + (i < shortBlocks ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    const e = rsRemainder(d, div);
    if (i < shortBlocks) d.push(NaN); // Platzhalter, damit alle Blöcke gleich lang sind
    blocks.push([...d, ...e]);
  }
  const all: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= shortBlocks) all.push(b[i]); });

  // Matrix
  const size = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, v: boolean): void => { if (x >= 0 && x < size && y >= 0 && y < size) { m[y][x] = v; fn[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  }
  const ap = alignPositions(ver);
  ap.forEach((ay, i) => ap.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const formatBits = (mask: number): void => {
    const d = (0b01 << 3) | mask; // Stufe L
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412, bit = (i: number): boolean => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  formatBits(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3), c = ((v >>> i) & 1) !== 0; set(a, b, c); set(b, a, c); }
  }
  // Daten im Zickzack
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && bi < all.length * 8) { m[y][x] = ((all[bi >> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
    }
  }
  // beste Maske nach Strafpunkten
  const cond = [(x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  let best = 0, bestScore = Infinity, bestM: boolean[][] = m;
  for (let mask = 0; mask < 8; mask++) {
    const t = m.map((row, y) => row.map((v, x) => (!fn[y][x] && cond[mask](x, y) ? !v : v)));
    const s = penalty(t);
    if (s < bestScore) { bestScore = s; best = mask; bestM = t; }
  }
  const out = bestM;
  // Formatbits der gewählten Maske in die fertige Matrix schreiben
  m.forEach((row, y) => row.forEach((_v, x) => { m[y][x] = out[y][x]; }));
  formatBits(best);
  return m;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let s = 0, dark = 0;
  const runs = (get: (i: number, j: number) => boolean): void => {
    for (let i = 0; i < n; i++) {
      let run = 1, hist = '';
      for (let j = 0; j < n; j++) {
        hist += get(i, j) ? '1' : '0';
        if (j > 0 && get(i, j) === get(i, j - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1;
      }
      for (const p of ['10111010000', '00001011101']) { let k = -1; while ((k = hist.indexOf(p, k + 1)) >= 0) s += 40; }
    }
  };
  runs((i, j) => m[i][j]);
  runs((i, j) => m[j][i]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++;
    if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) s += 3;
  }
  s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return s;
}

/** SVG des QR-Codes (schwarz auf weiß, mit Ruhezone von 4 Modulen), skalierbar. */
export function qrSvg(m: boolean[][], label = 'QR-Code'): string {
  const n = m.length, q = 4, d: string[] = [];
  m.forEach((row, y) => { let x = 0; while (x < n) { if (!row[x]) { x++; continue; } let e = x; while (e < n && row[e]) e++; d.push(`M${x + q} ${y + q}h${e - x}v1h-${e - x}z`); x = e; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d.join('')}" fill="#000"/></svg>`;
}
