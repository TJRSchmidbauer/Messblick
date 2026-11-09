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
  points: { x: number; y: number; c: number }[];
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
}

const DASHES = [[], [6, 3], [2, 3], [10, 3, 2, 3]];

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
      return {
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
        pointBorderColor: s.points.map((p) => (low(p) ? '#c92a2a' : s.color)),
        pointBorderWidth: s.points.map((p) => (low(p) ? 2 : 1)),
        pointBackgroundColor: s.faded ? s.color + '66' : s.color,
      } as any;
    });
    const hasY2 = d.series.some((s) => s.axis === 'y2');
    const text = { color: d.ink };
    const grid = { color: d.grid };
    const sc = ch.options.scales as any;
    sc.x = { type: d.xLog ? 'logarithmic' : 'linear', title: { display: true, text: d.xLabel, ...text }, ticks: text, grid, border: { color: d.ink } };
    sc.y = { type: d.yLog ? 'logarithmic' : 'linear', position: 'left', title: { display: true, text: d.yLabel, ...text }, ticks: text, grid, border: { color: d.ink } };
    sc.y2 = { type: d.yLog ? 'logarithmic' : 'linear', position: 'right', display: hasY2, title: { display: hasY2, text: d.y2Label, ...text }, ticks: text, grid: { drawOnChartArea: false }, border: { color: d.ink } };
    (ch.options.plugins!.legend as any).labels.color = d.ink;
    (ch.options.plugins!.tooltip as any) = {
      callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.x.toPrecision(4)} | ${c.parsed.y.toPrecision(4)}` },
    };
    ch.update();
  }

  resetZoom(): void {
    (this.chart as any).resetZoom?.();
  }

  /** PNG mit Kopfzeile (Titel, Name, Datum) auf weißem Grund – direkt ins Heft/Protokoll. */
  toPngBlob(meta: { title: string; name: string; date: string }): Promise<Blob> {
    const pad = 16, head = meta.title || meta.name ? 56 : 0;
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height + head;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    if (head) {
      ctx.fillStyle = '#0f1b2d';
      ctx.font = '600 22px "Atkinson Hyperlegible", system-ui, sans-serif';
      ctx.fillText(meta.title || 'Messung', pad, 30);
      ctx.font = '400 15px "Atkinson Hyperlegible", system-ui, sans-serif';
      ctx.fillText([meta.name, meta.date].filter(Boolean).join(' · '), pad, 50);
    }
    // Chart hat transparenten Grund: Rasterfarben des Themes sind evtl. hell → auf Weiß zeichnen reicht für hellen Export.
    ctx.drawImage(this.canvas, 0, head);
    return new Promise((res) => out.toBlob((b) => res(b!), 'image/png'));
  }
}
