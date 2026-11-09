/** Gleitender Median (ungerade Fensterbreite); null-Werte bleiben null und werden ignoriert. */
export function medianFilter(values: (number | null)[], window: number): (number | null)[] {
  if (window < 3) return values.slice();
  const half = window >> 1;
  return values.map((v, i) => {
    if (v === null) return null;
    const win: number[] = [];
    for (let k = Math.max(0, i - half); k <= Math.min(values.length - 1, i + half); k++) {
      const x = values[k];
      if (x !== null) win.push(x);
    }
    win.sort((a, b) => a - b);
    return win[win.length >> 1];
  });
}
