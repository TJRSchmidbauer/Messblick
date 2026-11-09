import './style.css';
import type { Frame, Point, Rect } from './core/types';
import { buildAnalogCalibration, type AnalogRaw } from './readers/analog';
import { readChannel, type Calibration, type DigitalCalibration } from './readers';
import { Session, TIME_KEY } from './session/session';
import { toCsv } from './export/csv';
import { toXlsx } from './export/xlsx';
import { ResultChart } from './ui/chart';
import { openCamera, openVideoFile } from './source/video';
import { DemoSource, DEMO } from './source/demo';
import type { FrameSource } from './source/types';
import { analyzeFile, startLive, type ActiveChannel } from './sampler';

interface Chan {
  id: string;
  type: 'analog' | 'digital';
  name: string;
  unit: string;
  // analog
  raw: Partial<AnalogRaw>;
  bigArc: boolean;
  pointerDark: boolean;
  // digital
  roi?: Rect;
  digits: number;
  decimals: string;
  polarity: DigitalCalibration['polarity'];
  cal: Calibration | null;
  live: { value: number | null; confidence: number } | null;
}
type Step = 'pivot' | 'ref1' | 'ref2' | 'roi';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const session = new Session();
const chart = new ResultChart($<HTMLCanvasElement>('chart'));
const view = $<HTMLCanvasElement>('view');
const vctx = view.getContext('2d')!;

let source: FrameSource | null = null;
let chans: Chan[] = [];
let calib: { id: string; step: Step } | null = null;
let drag: { start: Point; cur: Point } | null = null;
let stopLive: (() => void) | null = null;
let abort: AbortController | null = null;
let lastFrame: Frame | null = null;
let nextId = 1;

// ---------- Hilfen ----------
function showError(msg: string | null): void {
  const el = $('error');
  el.hidden = !msg;
  el.textContent = msg ?? '';
}
function setHint(msg: string): void {
  $('hint').textContent = msg;
}
function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const chan = (id: string): Chan => chans.find((c) => c.id === id)!;
const fmt = (v: number | null): string => (v === null ? '–' : String(Math.round(v * 1e4) / 1e4));

function rebuildCal(c: Chan): void {
  if (c.type === 'analog') {
    const r = c.raw;
    c.cal = r.pivot && r.p1 && r.p2 && r.v1 !== undefined && r.v2 !== undefined && r.v1 !== r.v2
      ? buildAnalogCalibration(r as AnalogRaw, c.bigArc, c.pointerDark)
      : null;
  } else {
    const dec = c.decimals === '' ? null : Math.max(0, parseInt(c.decimals, 10) || 0);
    c.cal = c.roi && c.roi.w > 8 && c.roi.h > 8
      ? { type: 'digital', roi: c.roi, digits: c.digits, decimals: dec, polarity: c.polarity }
      : null;
  }
}

function pointer(e: PointerEvent): Point {
  const r = view.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * view.width, y: ((e.clientY - r.top) / r.height) * view.height };
}

// ---------- Quelle ----------
function setSource(src: FrameSource): void {
  stopRecording();
  source?.stop();
  source = src;
  view.width = src.width;
  view.height = src.height;
  const isFile = !!src.seek && src.duration !== null;
  $('scrub').hidden = !isFile;
  if (isFile) {
    const r = $<HTMLInputElement>('scrub-range');
    r.max = String(src.duration);
    r.value = '0';
    void src.seek!(0);
  }
  $('btn-analyze').hidden = !isFile;
  $('btn-live').hidden = src.kind === 'file';
  setHint('Messgerät kalibrieren: unten „＋ Zeigerinstrument“ oder „＋ Digitalanzeige“ wählen.');
  showError(null);
  updateButtons();
}

async function guarded(fn: () => Promise<FrameSource>): Promise<void> {
  try {
    setSource(await fn());
  } catch (e) {
    showError((e as Error).message);
  }
}
$('btn-camera').onclick = () => guarded(() => openCamera());
$('btn-demo').onclick = () => guarded(async () => new DemoSource());
$<HTMLInputElement>('file').onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void guarded(() => openVideoFile(f));
};
$<HTMLInputElement>('scrub-range').oninput = async (e) => {
  if (!source?.seek) return;
  const t = Number((e.target as HTMLInputElement).value);
  $('scrub-time').textContent = `${t.toFixed(1)} s`;
  await source.seek(t);
};

// ---------- Kanäle ----------
function addChannel(type: 'analog' | 'digital'): void {
  const id = `k${nextId++}`;
  const n = chans.length + 1;
  chans.push({
    id, type, name: `Gerät ${n}`, unit: type === 'analog' ? 'V' : 'A', raw: {}, bigArc: type === 'analog',
    pointerDark: true, digits: 4, decimals: '', polarity: 'auto', cal: null, live: null,
  });
  startCalibration(id);
}
$('add-analog').onclick = () => addChannel('analog');
$('add-digital').onclick = () => addChannel('digital');

function startCalibration(id: string): void {
  const c = chan(id);
  if (!source) return showError('Bitte zuerst eine Quelle wählen.');
  calib = { id, step: c.type === 'analog' ? 'pivot' : 'roi' };
  setHint(c.type === 'analog' ? 'Klicke auf den Drehpunkt des Zeigers.' : 'Ziehe ein Rechteck eng um die Ziffern.');
  renderChannels();
}

function onCalibClick(p: Point): void {
  if (!calib) return;
  const c = chan(calib.id);
  if (calib.step === 'pivot') {
    c.raw = { pivot: p };
    calib.step = 'ref1';
    setHint('Klicke auf einen Skalenstrich mit bekanntem Wert (z. B. Anfang der Skala).');
  } else if (calib.step === 'ref1' || calib.step === 'ref2') {
    const which = calib.step === 'ref1' ? 1 : 2;
    const ans = window.prompt(`Welcher Wert steht an diesem Skalenstrich (${c.unit})?`, which === 1 ? '0' : '10');
    const v = ans === null ? NaN : Number(ans.replace(',', '.'));
    if (!Number.isFinite(v)) return setHint('Ungültiger Wert – bitte den Skalenstrich erneut anklicken.');
    if (which === 1) {
      c.raw.p1 = p; c.raw.v1 = v; calib.step = 'ref2';
      setHint('Klicke auf einen zweiten Skalenstrich mit bekanntem Wert (möglichst weit entfernt).');
    } else {
      c.raw.p2 = p; c.raw.v2 = v; calib = null;
      setHint('Kalibrierung fertig. Zeigt „Live“ den richtigen Wert? Sonst „Großer Bogen“ umschalten.');
    }
  }
  rebuildCal(c);
  renderChannels();
  updateButtons();
}

function onRoi(r: Rect): void {
  if (!calib) return;
  const c = chan(calib.id);
  c.roi = r;
  calib = null;
  setHint('Prüfe die „Live“-Anzeige. Ziffernanzahl und Dezimalstellen bei Bedarf anpassen.');
  rebuildCal(c);
  renderChannels();
  updateButtons();
}

function renderChannels(): void {
  const host = $('channels');
  host.innerHTML = chans.map((c) => `
    <div class="chan ${calib?.id === c.id ? 'active' : ''}" data-id="${c.id}">
      <header>
        <strong>${c.type === 'analog' ? '🕘' : '🔢'}</strong>
        <input type="text" data-f="name" value="${c.name}" aria-label="Name" />
        <input type="text" data-f="unit" value="${c.unit}" aria-label="Einheit" style="width:4em" />
        <span class="live" id="live-${c.id}">–</span>
      </header>
      <div class="bar">
        ${c.type === 'analog'
          ? `<label><input type="checkbox" data-f="bigArc" ${c.bigArc ? 'checked' : ''}/> großer Bogen (&gt;180°)</label>
             <label><input type="checkbox" data-f="pointerDark" ${c.pointerDark ? 'checked' : ''}/> Zeiger dunkel</label>`
          : `<label>Ziffern <input type="number" data-f="digits" min="1" max="8" value="${c.digits}" style="width:4em"/></label>
             <label>Dezimalstellen <input type="number" data-f="decimals" min="0" max="6" value="${c.decimals}" placeholder="auto" style="width:5em"/></label>
             <label>Anzeige <select data-f="polarity">
               ${(['auto', 'dark-on-light', 'light-on-dark'] as const).map((p) => `<option value="${p}" ${p === c.polarity ? 'selected' : ''}>${{ auto: 'automatisch', 'dark-on-light': 'dunkle Ziffern', 'light-on-dark': 'helle Ziffern' }[p]}</option>`).join('')}
             </select></label>`}
        <button data-act="calib">${c.cal ? 'Neu kalibrieren' : 'Kalibrieren'}</button>
        <button data-act="remove">✕</button>
      </div>
    </div>`).join('');
  refreshSelects();
}

$('channels').addEventListener('input', (e) => onFieldChange(e.target as HTMLInputElement));
$('channels').addEventListener('change', (e) => onFieldChange(e.target as HTMLInputElement));
function onFieldChange(el: HTMLInputElement | HTMLSelectElement): void {
  const f = el.dataset.f;
  const box = el.closest<HTMLElement>('.chan');
  if (!f || !box) return;
  const c = chan(box.dataset.id!);
  const val = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
  if (f === 'name') c.name = String(val);
  else if (f === 'unit') c.unit = String(val);
  else if (f === 'bigArc') c.bigArc = val as boolean;
  else if (f === 'pointerDark') c.pointerDark = val as boolean;
  else if (f === 'digits') c.digits = Math.max(1, parseInt(String(val), 10) || 1);
  else if (f === 'decimals') c.decimals = String(val);
  else if (f === 'polarity') c.polarity = val as Chan['polarity'];
  const session_c = session.channels.find((s) => s.id === c.id);
  if (session_c) { session_c.name = c.name; session_c.unit = c.unit; }
  rebuildCal(c);
  if (f === 'name' || f === 'unit') refreshSelects(); else updateButtons();
  renderResults();
}
$('channels').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  const box = (e.target as HTMLElement).closest<HTMLElement>('.chan');
  if (!btn || !box) return;
  const id = box.dataset.id!;
  if (btn.dataset.act === 'calib') startCalibration(id);
  else if (btn.dataset.act === 'remove') {
    chans = chans.filter((c) => c.id !== id);
    session.removeChannel(id);
    if (calib?.id === id) calib = null;
    renderChannels();
    updateButtons();
    renderResults();
  }
});

// ---------- Anzeige-Schleife ----------
view.addEventListener('pointerdown', (e) => {
  if (!calib) return;
  const p = pointer(e);
  if (calib.step === 'roi') {
    view.setPointerCapture(e.pointerId);
    drag = { start: p, cur: p };
  } else onCalibClick(p);
});
view.addEventListener('pointermove', (e) => { if (drag) drag.cur = pointer(e); });
view.addEventListener('pointerup', () => {
  if (!drag) return;
  const { start, cur } = drag;
  drag = null;
  onRoi({ x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), w: Math.abs(cur.x - start.x), h: Math.abs(cur.y - start.y) });
});

function drawOverlay(): void {
  vctx.lineWidth = 2;
  vctx.font = '14px system-ui';
  for (const c of chans) {
    vctx.strokeStyle = vctx.fillStyle = calib?.id === c.id ? '#ff9800' : '#00c853';
    const r = c.raw;
    const dot = (p: Point | undefined) => { if (p) { vctx.beginPath(); vctx.arc(p.x, p.y, 4, 0, 7); vctx.fill(); } };
    if (c.type === 'analog') {
      dot(r.pivot); dot(r.p1); dot(r.p2);
      if (r.pivot) for (const p of [r.p1, r.p2]) if (p) { vctx.beginPath(); vctx.moveTo(r.pivot.x, r.pivot.y); vctx.lineTo(p.x, p.y); vctx.stroke(); }
      if (c.cal?.type === 'analog' && r.pivot) { vctx.beginPath(); vctx.arc(r.pivot.x, r.pivot.y, c.cal.radius, 0, 7); vctx.setLineDash([4, 6]); vctx.stroke(); vctx.setLineDash([]); }
    } else if (c.roi) {
      vctx.strokeRect(c.roi.x, c.roi.y, c.roi.w, c.roi.h);
      if (c.cal) {
        const cw = c.roi.w / c.digits;
        for (let i = 1; i < c.digits; i++) { vctx.beginPath(); vctx.moveTo(c.roi.x + i * cw, c.roi.y); vctx.lineTo(c.roi.x + i * cw, c.roi.y + c.roi.h); vctx.globalAlpha = 0.35; vctx.stroke(); vctx.globalAlpha = 1; }
      }
    }
    const pos = c.type === 'analog' ? r.pivot : c.roi;
    if (pos) vctx.fillText(c.name, pos.x + 8, ('h' in pos ? pos.y - 6 : pos.y - 10));
  }
  if (drag) {
    vctx.strokeStyle = '#ff9800';
    vctx.strokeRect(Math.min(drag.start.x, drag.cur.x), Math.min(drag.start.y, drag.cur.y), Math.abs(drag.cur.x - drag.start.x), Math.abs(drag.cur.y - drag.start.y));
  }
}

let lastRead = 0;
function loop(now: number): void {
  if (source) {
    try {
      const frame = source.grab();
      lastFrame = frame;
      vctx.putImageData(new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
      drawOverlay();
      if (now - lastRead > 250) {
        lastRead = now;
        for (const c of chans) {
          if (!c.cal) continue;
          c.live = readChannel(frame, c.cal);
          const el = document.getElementById(`live-${c.id}`);
          if (el) {
            el.textContent = `${fmt(c.live.value)} ${c.unit}`;
            el.classList.toggle('low', c.live.confidence < 0.4);
          }
        }
      }
    } catch { /* Frame noch nicht verfügbar */ }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Messen ----------
const active = (): ActiveChannel[] => chans.filter((c) => c.cal).map((c) => ({ id: c.id, cal: c.cal! }));

function syncSessionChannels(): void {
  for (const c of chans) {
    if (c.cal && !session.channels.some((s) => s.id === c.id)) session.addChannel({ id: c.id, name: c.name, unit: c.unit });
  }
  refreshSelects();
}

function updateButtons(): void {
  const ready = !!source && active().length > 0;
  const recording = !!stopLive || !!abort;
  $<HTMLButtonElement>('btn-live').disabled = !ready && !stopLive;
  $<HTMLButtonElement>('btn-analyze').disabled = !ready || recording;
  $<HTMLButtonElement>('btn-clear').disabled = session.samples.length === 0 || recording;
  const has = session.samples.length > 0;
  for (const id of ['dl-csv', 'dl-xlsx', 'dl-png']) $<HTMLButtonElement>(id).disabled = !has;
}

function stopRecording(): void {
  stopLive?.();
  stopLive = null;
  abort?.abort();
  abort = null;
  $('btn-live').textContent = '● Aufnahme starten';
  $('btn-live').classList.remove('primary');
  $<HTMLProgressElement>('progress').hidden = true;
  updateButtons();
}

$('btn-live').onclick = () => {
  if (stopLive) return stopRecording();
  if (!source) return;
  if (source instanceof DemoSource) source.live();
  syncSessionChannels();
  const hz = Number($<HTMLSelectElement>('hz').value);
  stopLive = startLive(source, active(), session, hz, () => { renderResults(); });
  $('btn-live').textContent = '■ Aufnahme beenden';
  $('btn-live').classList.add('primary');
  updateButtons();
};

$('btn-analyze').onclick = async () => {
  if (!source) return;
  syncSessionChannels();
  const hz = Number($<HTMLSelectElement>('hz').value);
  abort = new AbortController();
  const bar = $<HTMLProgressElement>('progress');
  bar.hidden = false;
  updateButtons();
  try {
    await analyzeFile(source, active(), session, hz, (f) => { bar.value = f; }, abort.signal);
  } catch (e) {
    showError((e as Error).message);
  }
  abort = null;
  bar.hidden = true;
  updateButtons();
  renderResults();
};

$('btn-clear').onclick = () => { session.clear(); updateButtons(); renderResults(); };

// ---------- Auswertung ----------
function refreshSelects(): void {
  const xs = $<HTMLSelectElement>('xsel'), ys = $<HTMLSelectElement>('ysel');
  const px = xs.value, py = ys.value;
  const ch = session.channels;
  xs.innerHTML = `<option value="${TIME_KEY}">Zeit</option>` + ch.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  ys.innerHTML = ch.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  if ([...xs.options].some((o) => o.value === px)) xs.value = px;
  if ([...ys.options].some((o) => o.value === py)) ys.value = py;
  else if (ch.length) ys.value = ch[0].id;
}
$('xsel').onchange = $('ysel').onchange = () => renderResults();
$<HTMLInputElement>('smooth').onchange = (e) => {
  session.smoothing = (e.target as HTMLInputElement).checked ? 3 : 0;
  renderResults();
};

function label(id: string): string {
  if (id === TIME_KEY) return 'Zeit / s';
  const c = session.channels.find((s) => s.id === id);
  return c ? (c.unit ? `${c.name} / ${c.unit}` : c.name) : '';
}

function renderResults(): void {
  updateButtons();
  const x = $<HTMLSelectElement>('xsel').value, y = $<HTMLSelectElement>('ysel').value;
  if (!y || !session.channels.some((c) => c.id === y)) { chart.update({ points: [], xLabel: '', yLabel: '', line: true }); renderTable(); return; }
  chart.update({ points: session.series(x || TIME_KEY, y), xLabel: label(x || TIME_KEY), yLabel: label(y), line: x === TIME_KEY || x === '' });
  renderTable();
}

function renderTable(): void {
  const host = $('table');
  if (!session.samples.length) { host.innerHTML = '<em>Noch keine Messwerte.</em>'; return; }
  const total = session.samples.length;
  const from = Math.max(0, total - 100);
  const t = session.table();
  let html = `<table><thead><tr><th>#</th>${t.header.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;
  for (let i = from; i < total; i++) {
    const s = session.samples[i];
    html += `<tr><td>${i + 1}</td><td>${fmt(s.t)}</td>${session.channels.map((c) => {
      const cell = s.values[c.id];
      return `<td class="${cell && cell.c < 0.4 ? 'low' : ''}"><input data-i="${i}" data-c="${c.id}" value="${cell?.v ?? ''}" /></td>`;
    }).join('')}</tr>`;
  }
  host.innerHTML = html + '</tbody></table>' + (from > 0 ? `<p>… nur die letzten 100 von ${total} Zeilen angezeigt.</p>` : '');
}
$('table').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.i === undefined) return;
  const v = el.value.trim() === '' ? null : Number(el.value.replace(',', '.'));
  session.setValue(Number(el.dataset.i), el.dataset.c!, v !== null && Number.isFinite(v) ? v : null);
  renderResults();
});

$('dl-csv').onclick = () => download(new Blob([toCsv(session.table(), { german: $<HTMLInputElement>('german').checked })], { type: 'text/csv;charset=utf-8' }), 'messwerte.csv');
$('dl-xlsx').onclick = () => download(new Blob([toXlsx(session.table()) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'messwerte.xlsx');
$('dl-png').onclick = async () => download(await chart.toPngBlob(), 'graph.png');

renderChannels();
renderResults();
void lastFrame; void DEMO;
