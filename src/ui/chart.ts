import { Chart, LinearScale, LineController, PointElement, LineElement, ScatterController, Tooltip, Legend } from 'chart.js';

Chart.register(LinearScale, LineController, ScatterController, PointElement, LineElement, Tooltip, Legend);

export interface ChartData {
  points: { x: number; y: number; c: number }[];
  xLabel: string;
  yLabel: string;
  /** Linie nur sinnvoll, wenn x die Zeit ist. */
  line: boolean;
}

export class ResultChart {
  private chart: Chart<'scatter'>;
  constructor(private canvas: HTMLCanvasElement) {
    this.chart = new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [{ label: '', data: [], borderColor: '#1b6ca8', backgroundColor: '#1b6ca8' }] },
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        scales: { x: { type: 'linear', title: { display: true, text: '' } }, y: { type: 'linear', title: { display: true, text: '' } } },
        plugins: { legend: { display: false } },
      },
    });
  }
  update(d: ChartData): void {
    const ds = this.chart.data.datasets[0] as any;
    ds.data = d.points.map((p) => ({ x: p.x, y: p.y }));
    ds.showLine = d.line;
    ds.pointRadius = d.points.map((p) => (p.c < 0.4 ? 4 : 2));
    ds.pointBackgroundColor = d.points.map((p) => (p.c < 0.4 ? '#e08a00' : '#1b6ca8'));
    ds.label = d.yLabel;
    const sc = this.chart.options.scales as any;
    sc.x.title.text = d.xLabel;
    sc.y.title.text = d.yLabel;
    this.chart.update();
  }
  /** PNG mit weißem Hintergrund. */
  toPngBlob(): Promise<Blob> {
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(this.canvas, 0, 0);
    return new Promise((res) => out.toBlob((b) => res(b!), 'image/png'));
  }
}
