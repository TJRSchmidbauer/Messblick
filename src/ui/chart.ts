import { Chart, LinearScale, LogarithmicScale, LineController, PointElement, LineElement, ScatterController, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { SYMBOLS } from './icons';

Chart.register(LinearScale, LogarithmicScale, LineController, ScatterController, PointElement, LineElement, Tooltip, Legend, zoomPlugin);

export interface ChartSeries {
  label: string;
  color: string;
  slot: number;
  axis: 'y' | 'y2';
  /** gesicherte Reihe: blasser, gestrichelt */
  faded: boolean;
  points: { x: number; y: number; c: number; sy?: number }[];
  /** Fitkurve: nur Linie, ohne Punkte, ohne Fehlerbalken. */
  fit?: boolean;
  /** Gezeichnete Vorhersage: gepunktete Linie. */
  pred?: boolean;
}

export interface ChartInput {
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  y2Label: string;
  xLog: boolean;
  yLog: boolean;
  /** Linie nur sinnvoll, wenn x die Zeit ist. */
  line: boolean;
  /** Farben des aktuellen Themes. */
  ink: string;
  grid: string;
  /** Schriftgröße der Achsen in px (Beamer größer). */
  font: number;
  /** Farbe für unsichere Punkte (Themenfarbe). */
  danger: string;
  /** Gewählter Fitbereich in x (halbtransparentes Band). */
  band?: [number, number] | null;
}

const DASHES = [[], [6, 3], [2, 3], [10, 3, 2, 3]];

/** Fehlerbalken (vertikal, ±σ_y) in der Farbe der Reihe, mit kleinen Querstrichen. */
const errorBars = {
  id: 'errorBars',
  afterDatasetsDraw(chart: any): void {
    const { ctx, scales } = chart;
    chart.data.datasets.forEach((ds: any, i: number) => {
      const sy: (number | undefined)[] | undefined = ds._sy;
      if (!sy || !chart.isDatasetVisible(i)) return;
      const yScale = scales[ds.yAxisID] ?? scales.y;
      ctx.save();
      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = 1.5;
      ds.data.forEach((pt: { x: number; y: number }, k: number) => {
        const s = sy[k];
        if (!s) return;
        const x = scales.x.getPixelForValue(pt.x);
        const y0 = yScale.getPixelForValue(pt.y - s), y1 = yScale.getPixelForValue(pt.y + s);
        if (![x, y0, y1].every(Number.isFinite)) return;
        ctx.beginPath();
        ctx.moveTo(x, y0); ctx.lineTo(x, y1);
        ctx.moveTo(x - 3, y0); ctx.lineTo(x + 3, y0);
        ctx.moveTo(x - 3, y1); ctx.lineTo(x + 3, y1);
        ctx.stroke();
      });
      ctx.restore();
    });
  },
};

/** Markiert den gewählten Fitbereich mit einem halbtransparenten Band hinter den Daten. */
const rangeBand = {
  id: 'rangeBand',
  beforeDatasetsDraw(chart: any): void {
    const band: [number, number] | null | undefined = chart.options._band;
    if (!band) return;
    const { ctx, chartArea, scales } = chart;
    const a = scales.x.getPixelForValue(band[0]), b = scales.x.getPixelForValue(band[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    ctx.save();
    ctx.fillStyle = chart.options._bandColor ?? 'rgb(160 80 44 / .14)';
    ctx.fillRect(Math.min(a, b), chartArea.top, Math.abs(b - a), chartArea.bottom - chartArea.top);
    ctx.restore();
  },
};

Chart.register(errorBars, rangeBand);

export class ResultChart {
  private chart: Chart<'scatter'>;
  constructor(private canvas: HTMLCanvasElement) {
    this.chart = new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [] },
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: true },
        scales: { x: { type: 'linear', title: { display: true, text: '' } }, y: { type: 'linear', title: { display: true, text: '' } } },
        plugins: {
          legend: { display: true, labels: { usePointStyle: true, boxWidth: 8 } },
          zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }, pan: { enabled: true, mode: 'xy' } },
        },
      },
    });
  }

  update(d: ChartInput): void {
    const ch = this.chart;
    ch.data.datasets = d.series.map((s) => {
      const low = (p: { c: number }) => p.c < 0.4;
      if (s.pred) {
        return {
          label: s.label, data: s.points.map((p) => ({ x: p.x, y: p.y })), yAxisID: s.axis, showLine: true,
          borderColor: s.color, backgroundColor: s.color, borderWidth: 3, borderDash: [2, 6], pointRadius: 0, pointHoverRadius: 0,
        } as any;
      }
      if (s.fit) {
        return {
          label: s.label, data: s.points.map((p) => ({ x: p.x, y: p.y })), yAxisID: s.axis, showLine: true,
          borderColor: d.ink, backgroundColor: d.ink, borderWidth: 2.5, borderDash: [8, 4], pointRadius: 0, pointHoverRadius: 0,
        } as any;
      }
      return {
        _sy: s.points.map((p) => p.sy),
        label: s.label,
        data: s.points.map((p) => ({ x: p.x, y: p.y })),
        yAxisID: s.axis,
        showLine: d.line,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        borderDash: s.faded ? [3, 4] : DASHES[s.slot % 4],
        pointStyle: SYMBOLS[s.slot % SYMBOLS.length],
        pointRadius: s.points.map((p) => (low(p) ? 6 : s.points.length > 60 ? 2 : s.faded ? 3 : 4)),
        pointBorderColor: s.points.map((p) => (low(p) ? d.danger : s.color)),
        pointBorderWidth: s.points.map((p) => (low(p) ? 2 : 1)),
        pointBackgroundColor: s.faded ? s.color + '66' : s.color,
      } as any;
    });
    (ch.options as any)._band = d.band ?? null;
    const hasY2 = d.series.some((s) => s.axis === 'y2');
    const text = { color: d.ink, font: { size: d.font } };
    const grid = { color: d.grid };
    const sc = ch.options.scales as any;
    sc.x = { type: d.xLog ? 'logarithmic' : 'linear', title: { display: true, text: d.xLabel, color: d.ink, font: { size: d.font + 2 } }, ticks: text, grid, border: { color: d.ink } };
    sc.y = { type: d.yLog ? 'logarithmic' : 'linear', position: 'left', title: { display: true, text: d.yLabel, color: d.ink, font: { size: d.font + 2 } }, ticks: text, grid, border: { color: d.ink } };
    sc.y2 = { type: d.yLog ? 'logarithmic' : 'linear', position: 'right', display: hasY2, title: { display: hasY2, text: d.y2Label, color: d.ink, font: { size: d.font + 2 } }, ticks: text, grid: { drawOnChartArea: false }, border: { color: d.ink } };
    (ch.options.plugins!.legend as any).labels.color = d.ink;
    (ch.options.plugins!.legend as any).labels.font = { size: d.font };
    (ch.options.plugins!.tooltip as any) = {
      callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.x.toPrecision(4)} | ${c.parsed.y.toPrecision(4)}` },
    };
    ch.update();
  }

  resetZoom(): void {
    (this.chart as any).resetZoom?.();
  }

  /** Hebt einen Messpunkt der ersten Reihe hervor (Tastaturbedienung); null nimmt die Hervorhebung zurück. */
  highlight(index: number | null, dataset = 0): void {
    const ch = this.chart;
    const el = index === null ? [] : [{ datasetIndex: dataset, index }];
    ch.setActiveElements(el);
    ch.tooltip?.setActiveElements(el, { x: 0, y: 0 });
    ch.update();
  }

  /** Während der Bereichswahl pausieren Zoom und Verschieben, damit Ziehen das Band setzt. */
  setSelecting(on: boolean): void {
    const z = (this.chart.options.plugins as any).zoom;
    z.pan.enabled = !on;
    z.zoom.wheel.enabled = !on;
    z.zoom.pinch.enabled = !on;
    this.canvas.style.cursor = on ? 'col-resize' : '';
  }

  /** x-Wert an einer Mausposition (Seitenkoordinate); null, wenn nicht bestimmbar. */
  xAt(clientX: number): number | null {
    const v = (this.chart.scales.x as any).getValueForPixel(clientX - this.canvas.getBoundingClientRect().left);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  /** Graph als PNG-data:-URL auf weißem Grund (für das Protokoll). */
  toDataUrl(): string {
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(this.canvas, 0, 0);
    return out.toDataURL('image/png');
  }

  /** PNG mit Kopfzeile (Titel, Name, Datum) auf weißem Grund – direkt ins Heft/Protokoll. */
  toPngBlob(meta: { title: string; name: string; date: string; lines?: string[] }): Promise<Blob> {
    const lines = meta.lines ?? [];
    const pad = 16, head = (meta.title || meta.name ? 56 : 0) + lines.length * 22;
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height + head;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    if (head) {
      ctx.fillStyle = '#2e2a28';
      ctx.font = '700 22px "Space Grotesk", "Atkinson Hyperlegible", system-ui, sans-serif';
      ctx.fillText(meta.title || 'Messung', pad, 30);
      ctx.font = '400 15px "Atkinson Hyperlegible", system-ui, sans-serif';
      ctx.fillText([meta.name, meta.date].filter(Boolean).join(' · '), pad, 50);
      ctx.font = '400 15px "JetBrains Mono Variable", "JetBrains Mono", monospace';
      lines.forEach((l, i) => ctx.fillText(l, pad, 56 + 20 + i * 22));
    }
    // Chart hat transparenten Grund: Rasterfarben des Themes sind evtl. hell → auf Weiß zeichnen reicht für hellen Export.
    ctx.drawImage(this.canvas, 0, head);
    return new Promise((res) => out.toBlob((b) => res(b!), 'image/png'));
  }
}

/** Flacher Residuen-Graph unter dem Hauptgraphen (y − Fit über x) mit Nulllinie. */
export class ResidualChart {
  private chart: Chart<'scatter'>;
  constructor(canvas: HTMLCanvasElement) {
    this.chart = new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [] },
      options: { animation: false, maintainAspectRatio: false, parsing: false, plugins: { legend: { display: false }, tooltip: { enabled: true } }, scales: { x: { type: 'linear' }, y: { type: 'linear' } } },
    });
  }
  update(d: { points: { x: number; r: number }[]; xLabel: string; yLabel: string; color: string; ink: string; grid: string; font: number }): void {
    const xs = d.points.map((p) => p.x);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    this.chart.data.datasets = [
      { data: d.points.map((p) => ({ x: p.x, y: p.r })), showLine: false, borderColor: d.color, backgroundColor: d.color, pointRadius: 3 } as any,
      { data: [{ x: lo, y: 0 }, { x: hi, y: 0 }], showLine: true, borderColor: d.ink, borderWidth: 1, pointRadius: 0 } as any,
    ];
    const text = { color: d.ink, font: { size: d.font } };
    const sc = this.chart.options.scales as any;
    sc.x = { type: 'linear', title: { display: true, text: d.xLabel, color: d.ink, font: { size: d.font } }, ticks: text, grid: { color: d.grid }, border: { color: d.ink } };
    sc.y = { type: 'linear', title: { display: true, text: d.yLabel, color: d.ink, font: { size: d.font } }, ticks: text, grid: { color: d.grid }, border: { color: d.ink } };
    this.chart.update();
  }
}
