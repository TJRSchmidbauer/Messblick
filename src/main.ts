import type { Frame, Point, Rect } from './core/types';
import { buildAnalogCalibration, guessBigArc, type AnalogRaw } from './readers/analog';
import { readChannel, type Calibration, type DigitalCalibration, type LearnedGlyph } from './readers';
import { learnGlyphs } from './readers/glyph';
import { Session, TIME_KEY, seriesOf, tableOf, type ChannelDef } from './session/session';
import { toCsv } from './export/csv';
import { toXlsx } from './export/xlsx';
import { buildProtocolHtml, type ProtocolData } from './export/protocol';
import { ResidualChart, ResultChart, type ChartSeries } from './ui/chart';
import { MODELS, fitModel, type FitSuccess } from './analysis/fit/fit';
import { modelById } from './analysis/fit/models';
import { parseExpression } from './analysis/derive';
import { TRANSFORMS, averageReadings, suggestPlots, toPoints, transformLabel, type Transform, type VarRow } from './analysis/variation';
import { sigmaOf } from './analysis/uncertainty';
import { detectScaleJumps, factorLabel } from './analysis/jumps';
import { cleanPath, comparePrediction, type Prediction } from './analysis/prediction';
import { detectGate, stats as gateStats, type GateResult } from './analysis/gate';
import { announcePoint, describeSeries, sonificationSchedule, type DescribeOptions } from './analysis/describe';
import { Sonifier, localGermanVoice } from './ui/sonify';
import { Tracker, makeTemplate, type TrackConfig } from './readers/track';
import { parseTask, serializeTask, type TaskFile } from './task';
import { Stabilizer } from './readers/stabilize';
import type { TrackResult } from './readers/track';
import { encodeQr, qrSvg } from './ui/qr';
import { startScanner, type Scanner } from './ui/scan';
import { encodeShare, parseShares, summarize, type SharedLine } from './analysis/classview';
import { TEMPLATES, evalTemplateResults, templateById, type Template, type TplResultLine } from './templates';
import { describeUncertainty, type UncertaintyConfig } from './analysis/uncertainty';
import { icon, symbol, SYMBOLS } from './ui/icons';
import { openCamera, openVideoFile } from './source/video';
import { MicSource, ToneDemoSource, toneLabel, type AudioReader } from './source/audio';
import { noteName } from './analysis/audio';
import { DemoSource } from './source/demo';
import type { FrameSource } from './source/types';
import { analyzeFile, startLive, type ActiveChannel } from './sampler';
import { assessRegion } from './quality';
import { STORAGE_KEY, calibrationFile, parseCalibrationFile, parseState, serialize, type SavedChannel, type SavedState } from './storage';

/* ============================== Zustand ============================== */

type PointKey = 'pivot' | 'p1' | 'p2' | 'roi';
type Step = 'pivot' | 'ref1' | 'ref2' | 'roi';

interface Chan {
  id: string;
  /** 0..3 – bestimmt Registerfarbe und Symbol überall. */
  slot: number;
  type: 'analog' | 'digital';
  name: string;
  unit: string;
  raw: Partial<AnalogRaw>;
  bigArc: boolean;
  pointerDark: boolean;
  roi?: Rect;
  digits: number;
  decimals: string;
  polarity: DigitalCalibration['polarity'];
  style: NonNullable<DigitalCalibration['style']>;
  learned: LearnedGlyph[];
  /** Messunsicherheit: Modus und Eingaben als Text (Bedeutung je Modus, siehe uncOf). */
  unc: { mode: UncertaintyConfig['mode']; a: string; b: string; c: string };
  cal: Calibration | null;
  live: { value: number | null; confidence: number } | null;
  issues: string[];
  hist: string[];
}

const MAX_CHANNELS = 4;
const session = new Session();
let source: FrameSource | null = null;
let chans: Chan[] = [];
let nextId = 1;
let currentStep = 1;
let calib: { id: string; step: Step } | null = null;
let sel: { id: string; key: PointKey } | null = null;
let dragging: { id: string; key: PointKey; grab: Point; before: string } | null = null;
let roiDraw: { start: Point; cur: Point } | null = null;
/** Fit: gewähltes Modell ('' = keiner), gewählter Bereich, laufende Bereichswahl, letztes Ergebnis. */
let fitModelId = '';
let fitRange: [number, number] | null = null;
let selecting: { from: number } | null = null;
let selectMode = false;
let lastFit: FitSuccess | null = null;
/** Parameterreihe: Zeilen (Parameter p, Messwert v ± σ), Beschriftungen und gewählte Auftragung. */
interface VarState { pname: string; punit: string; vname: string; vunit: string; src: string; rows: VarRow[]; tx: Transform; ty: Transform; model: string }
const freshVariation = (): VarState => ({ pname: '', punit: '', vname: '', vunit: '', src: '', rows: [], tx: 'id', ty: 'id', model: 'line' });
let variation: VarState = freshVariation();
/** Letzte Ablesungen je Gerät (für den Mittelwert beim Übernehmen). */
const liveBuf = new Map<string, number[]>();
let lastVarFit: FitSuccess | null = null;
/** Versuchsvorlage: gewählte Kennung, Eingaben (Wert und relative Unsicherheit in %), Achsenwahl, die beim nächsten Rendern gesetzt wird. */
let tplId = '';
let tplInputs: Record<string, { v: string; rel: string }> = {};
let tplAxes: { x: 'time' | 'dev0'; y: 'dev0' | 'dev1' } | null = null;
let tplLines: TplResultLine[] = [];
/** Bereichswechsel: ignorierte Hinweise, letzte Korrektur (zum Zurücknehmen), Zeitpunkt der letzten Live-Warnung je Gerät. */
const ignoredJumps = new Set<string>();
let lastRescale: { id: string; from: number; to: number; factor: number } | null = null;
const jumpWarnAt = new Map<string, number>();
/** Vorhersage: gezeichnete Kurve und Achsenbereiche des Zeichenfelds. */
let prediction: Prediction | null = null;
/** Markerverfolgung: gewählter Marker samt Startzeit und Maßstab; Zeichenmodus und laufende Auswahl. */
interface TrackState { name: string; cfg: TrackConfig | null; scaleP: Point[]; meters: number | null }
const freshTrack = (): TrackState => ({ name: 'Marker', cfg: null, scaleP: [], meters: null });
let trackSt: TrackState = freshTrack();
let trackMode: 'marker' | 'gate' | 'anchor' | 'scale1' | 'scale2' | null = null;
/** Lichtschranke: Zone im Bild, Name, Breite des Körpers (m) für die Geschwindigkeit. */
interface GateState { name: string; rect: Rect | null; width: string; unit: string; factor: string }
const freshGate = (): GateState => ({ name: 'Lichtschranke', rect: null, width: '', unit: '', factor: '' });
/** Umrechnung der relativen Helligkeit (0 bis 1) in eine eigene Einheit, z. B. Lux: Wert = Faktor · Helligkeit. */
const gateFactor = (): number => { const f = Number(gateSt.factor.trim().replace(',', '.')); return gateSt.factor.trim() && Number.isFinite(f) && f > 0 ? f : 1; };
const gateUnit = (): string => gateSt.unit.trim() || (gateFactor() === 1 ? 'rel.' : '');
let gateSt: GateState = freshGate();
let drawKind: 'marker' | 'gate' | 'anchor' = 'marker';
let gateLast: { r: GateResult; intervals: ReturnType<typeof gateStats>; periods: ReturnType<typeof gateStats> } | null = null;
/** Anzahl der Größen, die schon belegt sind (Geräte, Marker x/y, Lichtschranke, abgeleitete Größen). */
const usedChannelCount = (): number => chans.length + session.channels.filter((c) => c.derived).length + (trackSt.cfg ? 2 : 0) + (gateSt.rect ? 1 : 0) + audioChannelCount();
let trkDraw: { start: Point; cur: Point } | null = null;
let trackerCache: { cfg: TrackConfig; tracker: Tracker } | null = null;
/** Vorschau der Markerverfolgung in jedem Anzeigebild (eigener Tracker, unabhängig von der Aufnahme): sonst hinkt das Fadenkreuz der Messrate hinterher. */
let previewCache: { cfg: TrackConfig; tracker: Tracker } | null = null;
let previewRes: TrackResult | null = null;
/** Geladene Aufgabe der Lehrkraft; `taskRevealed`: Ergebnis der Vorlage wurde aufgedeckt. */
let task: TaskFile | null = null;
let taskRevealed = false;
/** Bildanker: Konfiguration, ein Stabilisierer für Anzeige und Vorschau und einer für Aufnahme und Auswertung (getrennter Zustand). */
let anchorCfg: TrackConfig | null = null;
let loopStab: { cfg: TrackConfig; stab: Stabilizer } | null = null;
let recStab: { cfg: TrackConfig; stab: Stabilizer } | null = null;
const predRange = { xmin: 0, xmax: 30, ymin: 0, ymax: 10 };
let stopLive: (() => void) | null = null;
let abort: AbortController | null = null;
let beamer = false;
let recStart = 0;
let lastKeyHist = 0;

/* ============================== Hilfen ============================== */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const view = $<HTMLCanvasElement>('view');
const vctx = view.getContext('2d')!;
const chart = new ResultChart($<HTMLCanvasElement>('chart'));
const root = document.documentElement;

const de = (v: number | null, max = 4): string => (v === null ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: max }));
const chan = (id: string): Chan => chans.find((c) => c.id === id)!;
const cssVar = (name: string): string => getComputedStyle(root).getPropertyValue(name).trim();
const chanColor = (slot: number): string => cssVar(`--ch${(slot % 4) + 1}`);

function hydrateIcons(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon!, Number(el.dataset.size ?? 20));
    el.removeAttribute('data-icon');
  });
}

function setHint(msg: string): void {
  $('hint').innerHTML = `${icon('info')}<span>${msg}</span>`;
}
function showError(msg: string | null): void {
  const el = $('error');
  el.hidden = !msg;
  el.textContent = msg ?? '';
}
function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = (): string => new Date().toISOString().slice(0, 10);
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function rebuildCal(c: Chan): void {
  if (c.type === 'analog') {
    const r = c.raw;
    c.cal = r.pivot && r.p1 && r.p2 && r.v1 !== undefined && r.v2 !== undefined && r.v1 !== r.v2
      ? buildAnalogCalibration(r as AnalogRaw, c.bigArc, c.pointerDark)
      : null;
  } else {
    const dec = c.decimals === '' ? null : Math.max(0, parseInt(c.decimals, 10) || 0);
    c.cal = c.roi && c.roi.w > 8 && c.roi.h > 8
      ? { type: 'digital', roi: c.roi, digits: c.digits, decimals: dec, polarity: c.polarity, style: c.style, learned: c.learned }
      : null;
  }
}

const num = (t: string): number => Number(t.trim().replace(',', '.'));
/** Messunsicherheit aus den Eingabefeldern; unvollständige oder ungültige Eingaben ergeben „unbekannt“. */
function uncOf(c: Chan): UncertaintyConfig {
  const { mode, a, b, c: cc } = c.unc;
  const ok = (t: string): boolean => t.trim() !== '' && Number.isFinite(num(t));
  if (mode === 'class' && ok(a) && ok(b) && num(a) > 0 && num(b) > 0) return { mode, cls: num(a), range: num(b), ...(ok(cc) && num(cc) > 0 ? { read: num(cc) } : {}) };
  if (mode === 'digits' && ok(a) && num(a) > 0) return { mode, steps: num(a), decimals: ok(b) ? Math.max(0, Math.round(num(b))) : parseInt(c.decimals, 10) || 0 };
  if (mode === 'abs' && ok(a) && num(a) > 0) return { mode, value: num(a) };
  if (mode === 'poisson') return { mode };
  return { mode: 'none' };
}

const active = (): ActiveChannel[] => [
  ...chans.filter((c) => c.cal).map((c) => ({ id: c.id, cal: c.cal! })),
  ...(trackSt.cfg ? [{ id: 'trk-', track: trackerOf(trackSt.cfg) }] : []),
  ...(gateSt.rect ? [{ id: 'gate', gate: gateSt.rect, gateScale: gateFactor() }] : []),
  ...(source?.kind === 'audio' && audioChannelCount() > 0 ? [{ id: 'mic-', audio: source as unknown as AudioReader }] : []),
];
/** Ein Tracker je Marker-Konfiguration; der Sampler setzt ihn beim Start einer Aufnahme zurück. */
function trackerOf(cfg: TrackConfig): Tracker {
  if (trackerCache?.cfg !== cfg) trackerCache = { cfg, tracker: new Tracker(cfg) };
  return trackerCache.tracker;
}

/* ============================== Thema ============================== */

const themeSel = $<HTMLSelectElement>('theme');
const dark = matchMedia('(prefers-color-scheme: dark)');
const contrast = matchMedia('(prefers-contrast: more)');
function applyTheme(): void {
  const v = themeSel.value;
  const resolved = v === 'auto' ? (contrast.matches ? 'contrast' : dark.matches ? 'dark' : 'light') : v;
  root.dataset.theme = resolved;
  renderResults();
}
themeSel.onchange = () => { applyTheme(); scheduleSave(); };
dark.addEventListener('change', applyTheme);
contrast.addEventListener('change', applyTheme);


/* ---- Startweg in Schritt 1 ---- */
type Route = 'free' | 'tpl' | 'task';
function setRoute(r: Route): void {
  for (const k of ['free', 'tpl', 'task'] as const) $(`route-${k}`).setAttribute('aria-pressed', String(k === r));
  $('tplbox').hidden = r !== 'tpl';
  $('taskpick').hidden = r !== 'task';
}
for (const k of ['free', 'tpl', 'task'] as const) $(`route-${k}`).addEventListener('click', () => setRoute(k));

/* ============================== Schritte ============================== */

const readyForMeasure = (): boolean => !!source && active().length > 0;

function goStep(n: number): void {
  currentStep = n;
  applyStep();
}
function applyStep(): void {
  document.body.dataset.step = String(currentStep);
  for (let i = 1; i <= 4; i++) {
    const tab = $(`tab-${i}`);
    tab.setAttribute('aria-selected', String(i === currentStep));
    tab.tabIndex = i === currentStep ? 0 : -1;
    const show = beamer ? i === 3 || i === 4 : i === currentStep;
    $(`panel-${i}`).hidden = !show;
  }
  const hints: Record<number, string> = {
    1: 'Wähle eine Quelle: Kamera für Live-Messung, Videodatei für Aufgezeichnetes, Demo zum Ausprobieren.',
    2: chans.length ? 'Kalibriere jedes Gerät im Bild. Die Zahl oben zeigt sofort, ob die Ablesung stimmt.' : 'Lege ein Messgerät an: Zeigerinstrument oder Digitalanzeige.',
    3: 'Bereit zum Messen. Starte mit der Schaltfläche oder der Leertaste.',
    4: 'Wähle die Achsen. Mausrad oder Pinch zoomt, Ziehen verschiebt den Graphen.',
  };
  if (!calib) setHint(hints[currentStep]);
  if (currentStep === 4 || beamer) renderResults();
}
$('tabs').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[role=tab]');
  if (t) goStep(Number(t.dataset.step));
});
$('tabs').addEventListener('keydown', (e) => {
  const k = (e as KeyboardEvent).key;
  if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
  const n = Math.min(4, Math.max(1, currentStep + (k === 'ArrowRight' ? 1 : -1)));
  goStep(n);
  $(`tab-${n}`).focus();
});
document.querySelectorAll<HTMLElement>('[data-goto]').forEach((b) => (b.onclick = () => goStep(Number(b.dataset.goto))));

$('btn-beamer').onclick = () => setBeamer(!beamer);
function setBeamer(on: boolean): void {
  beamer = on;
  document.body.classList.toggle('beamer', on);
  $('btn-beamer').setAttribute('aria-pressed', String(on));
  applyStep();
}

/* ============================== Quelle ============================== */

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
  document.querySelectorAll('.choice').forEach((c) => c.classList.remove('active'));
  ({ camera: $('btn-camera'), demo: $('btn-demo'), file: $('file').closest('.choice')!, audio: src instanceof ToneDemoSource ? $('btn-tone') : $('btn-mic') }[src.kind] as HTMLElement).classList.add('active');
  applyAudioMode();
  anchorCfg = null; loopStab = null; recStab = null; // ein Anker gehört zu einem Kamerabild
  $<HTMLInputElement>('demo-shake').checked = false;
  renderAnchorStatus();
  showError(null);
  updateButtons();
  goStep(2);
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
$('btn-mic').onclick = () => guarded(() => MicSource.open());
$('btn-tone').onclick = () => guarded(async () => new ToneDemoSource());
$<HTMLInputElement>('file').onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void guarded(() => openVideoFile(f));
};
$<HTMLInputElement>('scrub-range').oninput = async (e) => {
  if (!source?.seek) return;
  const t = Number((e.target as HTMLInputElement).value);
  $('scrub-time').textContent = `${de(t, 1)} s`;
  await source.seek(t);
};

/* ============================== Dialoge ============================== */

const valdlg = $<HTMLDialogElement>('valdlg');
/** Fragt einen Skalenwert ab (statt window.prompt). null = abgebrochen. */
function askValue(title: string, help: string, unit: string, def: string): Promise<number | null> {
  return new Promise((resolve) => {
    $('valdlg-title').textContent = title;
    $('valdlg-help').textContent = help;
    $('valdlg-unit').textContent = unit;
    $('valdlg-err').textContent = '';
    const input = $<HTMLInputElement>('valdlg-input');
    input.value = def;
    const form = $<HTMLFormElement>('valdlg-form');
    const onSubmit = (ev: SubmitEvent): void => {
      const choice = (ev.submitter as HTMLButtonElement | null)?.value;
      if (choice === 'ok') {
        const v = Number(input.value.trim().replace(',', '.'));
        if (!Number.isFinite(v) || input.value.trim() === '') {
          ev.preventDefault();
          $('valdlg-err').textContent = 'Bitte eine Zahl eingeben, z. B. 2,5';
          return;
        }
        finish(v);
      } else finish(null);
    };
    const onCancel = (): void => finish(null);
    const finish = (v: number | null): void => {
      form.removeEventListener('submit', onSubmit);
      valdlg.removeEventListener('cancel', onCancel);
      if (valdlg.open) valdlg.close();
      resolve(v);
    };
    form.addEventListener('submit', onSubmit);
    valdlg.addEventListener('cancel', onCancel);
    valdlg.showModal();
    input.select();
  });
}
const learndlg = $<HTMLDialogElement>('learndlg');
/** Fragt den aktuell angezeigten Text ab. Der Prüfer liefert eine Fehlermeldung oder null. null = abgebrochen. */
function askText(check: (text: string) => string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const input = $<HTMLInputElement>('learndlg-input');
    const form = $<HTMLFormElement>('learndlg-form');
    $('learndlg-err').textContent = '';
    input.value = '';
    const onSubmit = (ev: SubmitEvent): void => {
      if ((ev.submitter as HTMLButtonElement | null)?.value !== 'ok') return finish(null);
      const err = check(input.value);
      if (err) { ev.preventDefault(); $('learndlg-err').textContent = err; return; }
      finish(input.value);
    };
    const onCancel = (): void => finish(null);
    const finish = (v: string | null): void => {
      form.removeEventListener('submit', onSubmit);
      learndlg.removeEventListener('cancel', onCancel);
      if (learndlg.open) learndlg.close();
      resolve(v);
    };
    form.addEventListener('submit', onSubmit);
    learndlg.addEventListener('cancel', onCancel);
    learndlg.showModal();
    input.focus();
  });
}

/** Lernt die Ziffern an, die das Gerät im aktuellen Bild zeigt (Zeichenvergleich, siehe readers/glyph.ts). */
async function learnDigits(id: string): Promise<void> {
  const c = chan(id);
  if (!c.cal || c.cal.type !== 'digital' || !source) return showError('Zum Anlernen braucht es eine Quelle und eine kalibrierte Digitalanzeige.');
  let frame: Frame;
  try { frame = grabStable(); } catch { return showError('Noch kein Bild verfügbar.'); }
  const base = c.cal;
  let result: ReturnType<typeof learnGlyphs> | null = null;
  const text = await askText((t) => {
    result = learnGlyphs(frame, base, t);
    return result.ok ? null : result.error;
  });
  const outcome = result as ReturnType<typeof learnGlyphs> | null;
  if (text === null || !outcome || !outcome.ok) return;
  c.learned = outcome.learned;
  // Angelernte Zeichen nutzt nur der Zeichenvergleich: bei reiner Segmentabtastung wäre das Anlernen wirkungslos
  if (c.style === 'segment') c.style = 'auto';
  rebuildCal(c);
  renderChannels();
  renderLive();
  scheduleSave();
  setHint(`${outcome.added} Zeichen angelernt. Die Ablesung oben zeigt, ob es besser passt.`);
}

const helpdlg = $<HTMLDialogElement>('helpdlg');
$('btn-help').onclick = () => helpdlg.showModal();
$('helpdlg-close').onclick = () => helpdlg.close();

/* ============================== Kanäle ============================== */

function addChannel(type: 'analog' | 'digital'): void {
  if (usedChannelCount() >= MAX_CHANNELS) return showError('Mehr als vier Größen gleichzeitig (Messgeräte, Markerverfolgung mit x und y, Lichtschranke und abgeleitete Größen zusammen) werden nicht unterstützt.');
  const used = new Set(chans.map((c) => c.slot));
  const slot = [0, 1, 2, 3].find((s) => !used.has(s))!;
  const id = `k${nextId++}`;
  chans.push({
    id, slot, type, name: `Gerät ${chans.length + 1}`, unit: type === 'analog' ? 'V' : 'A', raw: {}, bigArc: false,
    pointerDark: true, digits: 4, decimals: '', polarity: 'auto', style: 'auto', learned: [], unc: { mode: 'none', a: '', b: '', c: '' }, cal: null, live: null, issues: [], hist: [],
  });
  startCalibration(id);
}
$('add-analog').onclick = () => addChannel('analog');
$('add-digital').onclick = () => addChannel('digital');

function pushHist(c: Chan): void {
  c.hist.push(JSON.stringify({ raw: c.raw, roi: c.roi }));
  if (c.hist.length > 40) c.hist.shift();
}
function stepFromRaw(c: Chan): Step | null {
  if (c.type === 'digital') return c.roi ? null : 'roi';
  if (!c.raw.pivot) return 'pivot';
  if (!c.raw.p1) return 'ref1';
  if (!c.raw.p2) return 'ref2';
  return null;
}
function undo(): void {
  const c = chans.find((x) => x.id === (calib?.id ?? sel?.id)) ?? chans[chans.length - 1];
  if (!c || !c.hist.length) return setHint('Nichts zum Rückgängigmachen.');
  const prev = JSON.parse(c.hist.pop()!);
  c.raw = prev.raw ?? {};
  c.roi = prev.roi;
  const st = stepFromRaw(c);
  calib = st ? { id: c.id, step: st } : null;
  rebuildCal(c);
  explain();
  renderChannels();
  renderLive();
  updateButtons();
  scheduleSave();
}

function explain(): void {
  if (!calib) return;
  const c = chan(calib.id);
  setHint(({
    pivot: `${esc(c.name)}: Klicke auf den Drehpunkt des Zeigers.`,
    ref1: `${esc(c.name)}: Klicke auf einen Skalenstrich mit bekanntem Wert, z. B. den Anfang der Skala.`,
    ref2: `${esc(c.name)}: Klicke auf einen zweiten Skalenstrich mit bekanntem Wert, möglichst weit vom ersten entfernt.`,
    roi: `${esc(c.name)}: Ziehe ein Rechteck eng um die Ziffern der Anzeige.`,
  } as Record<Step, string>)[calib.step]);
}

function startCalibration(id: string): void {
  const c = chan(id);
  if (!source) {
    chans = chans.filter((x) => x.id !== id);
    goStep(1);
    return showError('Bitte zuerst eine Quelle wählen.');
  }
  pushHist(c);
  c.raw = {};
  c.roi = undefined;
  c.cal = null;
  calib = { id, step: c.type === 'analog' ? 'pivot' : 'roi' };
  sel = null;
  explain();
  renderChannels();
  renderLive();
  updateButtons();
  goStep(2);
  explain();
  if (matchMedia('(max-width: 900px)').matches) document.querySelector('.chan.active')?.scrollIntoView({ block: 'nearest' });
}

function cancelCalibration(): void {
  if (!calib) return;
  const c = chan(calib.id);
  calib = null;
  rebuildCal(c);
  if (!c.cal) chans = chans.filter((x) => x.id !== c.id); // halbfertiges Gerät verwerfen
  renderChannels();
  renderLive();
  updateButtons();
  applyStep();
}

async function onCalibClick(p: Point): Promise<void> {
  if (!calib) return;
  const c = chan(calib.id);
  const step = calib.step;
  if (step === 'pivot') {
    c.raw.pivot = p;
    calib.step = 'ref1';
  } else if (step === 'ref1' || step === 'ref2') {
    const which = step === 'ref1' ? 1 : 2;
    const v = await askValue(
      `Skalenwert ${which} von 2`,
      'Welcher Wert steht an dem angeklickten Skalenstrich?',
      c.unit,
      which === 1 ? '0' : '10',
    );
    if (v === null) return setHint('Kein Wert übernommen – klicke den Skalenstrich erneut an.');
    if (which === 1) { c.raw.p1 = p; c.raw.v1 = v; calib.step = 'ref2'; }
    else {
      if (v === c.raw.v1) return setHint('Beide Skalenwerte sind gleich – wähle einen anderen Skalenstrich.');
      c.raw.p2 = p; c.raw.v2 = v; calib = null;
      // Kurzer oder langer Bogen? Zwei Skalenpunkte allein sagen das nicht; der Zeiger im Bild entscheidet.
      try { c.bigArc = guessBigArc(grabStable(), c.raw as AnalogRaw, c.pointerDark); } catch { /* ohne Bild: Einstellung bleibt */ }
    }
  }
  rebuildCal(c);
  if (!calib) {
    sel = { id: c.id, key: 'p2' };
    setHint(c.type === 'analog'
      ? `Kalibrierung fertig. Erkannt: Skala ${c.bigArc ? 'größer' : 'kleiner'} als 180°. Stimmt die Zahl oben? Sonst Punkte ziehen oder „Skala größer als 180°“ umschalten.`
      : 'Kalibrierung fertig. Stimmt die Zahl oben? Sonst Punkte ziehen.');
  }
  else explain();
  renderChannels();
  renderLive();
  updateButtons();
  scheduleSave();
}

function finishRoi(r: Rect): void {
  if (!calib) return;
  const c = chan(calib.id);
  if (r.w < 12 || r.h < 12) return setHint('Rechteck zu klein – ziehe es größer um die Ziffern.');
  c.roi = r;
  calib = null;
  sel = { id: c.id, key: 'roi' };
  rebuildCal(c);
  setHint('Prüfe die Zahl oben. Ziffernanzahl und Dezimalstellen bei Bedarf anpassen; das Rechteck lässt sich verschieben.');
  renderChannels();
  renderLive();
  updateButtons();
  scheduleSave();
}

function pointsOf(c: Chan): { key: PointKey; p: Point }[] {
  if (c.type === 'analog') return (['pivot', 'p1', 'p2'] as const).filter((k) => c.raw[k]).map((k) => ({ key: k, p: c.raw[k]! }));
  return [];
}

function hit(p: Point): { id: string; key: PointKey } | null {
  const r = view.getBoundingClientRect();
  const tol = 16 * (view.width / r.width);
  for (const c of chans) {
    for (const q of pointsOf(c)) if (Math.hypot(q.p.x - p.x, q.p.y - p.y) <= tol) return { id: c.id, key: q.key };
    if (c.roi && p.x >= c.roi.x && p.x <= c.roi.x + c.roi.w && p.y >= c.roi.y && p.y <= c.roi.y + c.roi.h) return { id: c.id, key: 'roi' };
  }
  return null;
}

function pointer(e: PointerEvent): Point {
  const r = view.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * view.width, y: ((e.clientY - r.top) / r.height) * view.height };
}

view.addEventListener('pointerdown', (e) => {
  const p = pointer(e);
  if (trackMode) { onTrackPointerDown(e, p); return; }
  if (calib) {
    if (calib.step === 'roi') {
      view.setPointerCapture(e.pointerId);
      roiDraw = { start: p, cur: p };
    } else void onCalibClick(p);
    return;
  }
  const h = hit(p);
  if (!h) { sel = null; return; }
  const c = chan(h.id);
  sel = h;
  view.setPointerCapture(e.pointerId);
  const origin = h.key === 'roi' ? c.roi! : c.raw[h.key]!;
  dragging = { ...h, grab: { x: p.x - origin.x, y: p.y - origin.y }, before: JSON.stringify({ raw: c.raw, roi: c.roi }) };
});
view.addEventListener('pointermove', (e) => {
  const p = pointer(e);
  if (trkDraw) { trkDraw.cur = p; return; }
  if (roiDraw) { roiDraw.cur = p; return; }
  if (dragging) {
    const c = chan(dragging.id);
    const x = p.x - dragging.grab.x, y = p.y - dragging.grab.y;
    if (dragging.key === 'roi') c.roi = { ...c.roi!, x, y };
    else c.raw = { ...c.raw, [dragging.key]: { x, y } };
    rebuildCal(c);
    return;
  }
  view.classList.toggle('can-drag', !calib && !!hit(p));
});
view.addEventListener('pointerup', () => {
  if (trkDraw) {
    const { start, cur } = trkDraw;
    trkDraw = null;
    const rect = { x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), w: Math.abs(cur.x - start.x), h: Math.abs(cur.y - start.y) };
    if (drawKind === 'gate') finishGate(rect); else if (drawKind === 'anchor') finishAnchor(rect); else finishMarker(rect);
    return;
  }
  if (roiDraw) {
    const { start, cur } = roiDraw;
    roiDraw = null;
    finishRoi({ x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), w: Math.abs(cur.x - start.x), h: Math.abs(cur.y - start.y) });
  } else if (dragging) {
    const c = chan(dragging.id);
    c.hist.push(dragging.before);
    dragging = null;
    scheduleSave();
  }
});

/* ---- Kanal-Panel ---- */

function renderChannels(): void {
  const host = $('channels');
  host.innerHTML = chans.map((c) => `
    <div class="chan ch-${c.slot + 1} ${calib?.id === c.id ? 'active' : ''}" data-id="${c.id}">
      <div class="chan-head">
        ${symbol(c.slot, 18)}
        <input type="text" data-f="name" value="${esc(c.name)}" aria-label="Name von ${esc(c.name)}" />
        <input type="text" class="unit" data-f="unit" value="${esc(c.unit)}" aria-label="Einheit" />
        <span class="status ${c.cal ? 'ok' : 'todo'}">${c.cal ? icon('check', 16) + 'kalibriert' : calib?.id === c.id ? 'wird kalibriert …' : 'nicht kalibriert'}</span>
      </div>
      <div class="opts">
        ${c.type === 'analog'
          ? `<label><input type="checkbox" data-f="bigArc" ${c.bigArc ? 'checked' : ''}/> Skala größer als 180°</label>
             <label><input type="checkbox" data-f="pointerDark" ${c.pointerDark ? 'checked' : ''}/> Zeiger dunkel auf hellem Grund</label>`
          : `<label class="field">Ziffern <input type="number" data-f="digits" min="1" max="8" value="${c.digits}" style="width:4.5em"/></label>
             <label class="field">Dezimalstellen <input type="number" data-f="decimals" min="0" max="6" value="${c.decimals}" placeholder="auto" style="width:5.5em"/></label>
             <label class="field">Anzeige <select data-f="polarity">
               ${(['auto', 'dark-on-light', 'light-on-dark'] as const).map((p) => `<option value="${p}" ${p === c.polarity ? 'selected' : ''}>${{ auto: 'automatisch', 'dark-on-light': 'dunkle Ziffern', 'light-on-dark': 'helle Ziffern' }[p]}</option>`).join('')}
             </select></label>
             <label class="field">Schrift <select data-f="style">
               ${(['auto', 'segment', 'glyph'] as const).map((p) => `<option value="${p}" ${p === c.style ? 'selected' : ''}>${{ auto: 'automatisch', segment: '7-Segment', glyph: 'LCD / Punktmatrix' }[p]}</option>`).join('')}
             </select></label>`}
      </div>
      <div class="opts unc">
        <label class="field">Messunsicherheit <select data-f="umode">
          ${(['none', 'class', 'digits', 'abs', 'poisson'] as const).map((m) => `<option value="${m}" ${m === c.unc.mode ? 'selected' : ''}>${{ none: 'unbekannt', class: 'Güteklasse', digits: 'Ziffernschritte', abs: 'fester Wert', poisson: 'Zählrate (√N)' }[m]}</option>`).join('')}
        </select></label>
        ${c.unc.mode === 'class' ? `<label class="field">Klasse <input type="text" inputmode="decimal" data-f="ua" value="${esc(c.unc.a)}" placeholder="1,5" style="width:4.5em"/></label>
          <label class="field">Messbereich (Endwert) <input type="text" inputmode="decimal" data-f="ub" value="${esc(c.unc.b)}" placeholder="10" style="width:5.5em"/></label>
          <label class="field">Ablesefehler (optional) <input type="text" inputmode="decimal" data-f="uc" value="${esc(c.unc.c)}" placeholder="0,1" style="width:5.5em"/></label>` : ''}
        ${c.unc.mode === 'digits' ? `<label class="field">Schritte <input type="text" inputmode="decimal" data-f="ua" value="${esc(c.unc.a)}" placeholder="1" style="width:4.5em"/></label>
          <label class="field">Dezimalstellen der letzten Ziffer <input type="text" inputmode="numeric" data-f="ub" value="${esc(c.unc.b)}" placeholder="${esc(c.decimals || '2')}" style="width:4.5em"/></label>` : ''}
        ${c.unc.mode === 'abs' ? `<label class="field">± Wert <input type="text" inputmode="decimal" data-f="ua" value="${esc(c.unc.a)}" placeholder="0,05" style="width:5.5em"/></label>` : ''}
      </div>
      <div class="bar">
        <button type="button" data-act="calib">${icon(c.type === 'analog' ? 'gauge' : 'digits', 18)}${c.cal ? 'Neu kalibrieren' : 'Kalibrieren'}</button>
        ${c.type === 'digital' ? `<button type="button" data-act="learn" ${c.cal ? '' : 'disabled'} title="Das Gerät zeigt gerade Ziffern an: eintippen, damit die App sie wiedererkennt">${icon('digits', 18)}Ziffern anlernen${c.learned.length ? ` (${c.learned.length})` : ''}</button>
        ${c.learned.length ? `<button type="button" class="ghost" data-act="unlearn">${icon('reset', 18)}Angelernte löschen</button>` : ''}` : ''}
        <button type="button" class="ghost" data-act="undo" ${c.hist.length ? '' : 'disabled'}>${icon('undo', 18)}Rückgängig</button>
        <button type="button" class="ghost" data-act="remove" aria-label="${esc(c.name)} entfernen">${icon('trash', 18)}Entfernen</button>
      </div>
      <ul class="issues" id="issues-${c.id}" aria-live="polite"></ul>
    </div>`).join('') || '<p class="note">Noch kein Gerät angelegt.</p>';
  $<HTMLButtonElement>('add-analog').disabled = $<HTMLButtonElement>('add-digital').disabled = chans.length >= MAX_CHANNELS;
  refreshSelects();
}

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
  else if (f === 'style') c.style = val as Chan['style'];
  else if (f === 'umode') c.unc = { mode: val as Chan['unc']['mode'], a: '', b: '', c: '' };
  else if (f === 'ua') c.unc.a = String(val);
  else if (f === 'ub') c.unc.b = String(val);
  else if (f === 'uc') c.unc.c = String(val);
  const sc = session.channels.find((s) => s.id === c.id);
  if (sc) { sc.name = c.name; sc.unit = c.unit; sc.uncertainty = uncOf(c); }
  if (f === 'umode') renderChannels();
  rebuildCal(c);
  if (f === 'name' || f === 'unit') { refreshSelects(); renderLive(); } else updateButtons();
  renderResults();
  scheduleSave();
}
$('channels').addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.type === 'text') onFieldChange(t); });
$('channels').addEventListener('change', (e) => onFieldChange(e.target as HTMLInputElement));
$('channels').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
  const box = (e.target as HTMLElement).closest<HTMLElement>('.chan');
  if (!btn || !box) return;
  const id = box.dataset.id!;
  if (btn.dataset.act === 'calib') startCalibration(id);
  else if (btn.dataset.act === 'learn') void learnDigits(id);
  else if (btn.dataset.act === 'unlearn') {
    const c = chan(id);
    c.learned = [];
    rebuildCal(c);
    renderChannels();
    scheduleSave();
  }
  else if (btn.dataset.act === 'undo') { calib = calib ?? null; sel = { id, key: 'p2' }; undo(); }
  else if (btn.dataset.act === 'remove') {
    chans = chans.filter((c) => c.id !== id);
    session.removeChannel(id);
    if (calib?.id === id) calib = null;
    if (sel?.id === id) sel = null;
    renderChannels();
    renderLive();
    updateButtons();
    renderResults();
    scheduleSave();
  }
});

/* ---- Kalibrierung sichern / laden ---- */

function toSaved(c: Chan): SavedChannel {
  return { id: c.id, type: c.type, name: c.name, unit: c.unit, cal: c.cal, raw: c.raw, bigArc: c.bigArc, pointerDark: c.pointerDark, roi: c.roi, digits: c.digits, decimals: c.decimals, polarity: c.polarity, style: c.style, learned: c.learned, unc: c.unc };
}
function fromSaved(s: SavedChannel, slot: number): Chan {
  return { id: s.id, slot, type: s.type, name: s.name, unit: s.unit, raw: (s.raw as Chan['raw']) ?? {}, bigArc: s.bigArc, pointerDark: s.pointerDark, roi: s.roi as Rect | undefined, digits: s.digits, decimals: s.decimals, polarity: s.polarity as Chan['polarity'], style: (s.style as Chan['style']) ?? 'segment', learned: s.learned ?? [], unc: (s.unc as Chan['unc'] | undefined) ?? { mode: 'none', a: '', b: '', c: '' }, cal: s.cal, live: null, issues: [], hist: [] };
}
$('cal-save').onclick = () => download(new Blob([calibrationFile(chans.filter((c) => c.cal).map(toSaved))], { type: 'application/json' }), `kalibrierung-${stamp()}.json`);
$<HTMLInputElement>('cal-load').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f) return;
  const list = parseCalibrationFile(await f.text());
  if (!list) return showError('Diese Datei ist keine Kalibrierungsdatei dieser App.');
  addSavedChannels(list);
  setHint('Kalibrierung geladen. Sie gilt nur, wenn Kamera und Aufbau wie bei der Aufnahme stehen – prüfe die Zahlen oben.');
};
/** Fügt gespeicherte Geräte hinzu (so viele, wie noch Platz ist) und meldet, wenn welche fehlen. */
function addSavedChannels(list: SavedChannel[]): void {
  const free = MAX_CHANNELS - usedChannelCount();
  for (const s of list.slice(0, Math.max(0, free))) {
    const used = new Set(chans.map((c) => c.slot));
    const slot = [0, 1, 2, 3].find((k) => !used.has(k))!;
    const id = `k${nextId++}`;
    const c = fromSaved({ ...s, id }, slot);
    rebuildCal(c);
    chans.push(c);
  }
  showError(list.length > free ? `Nur ${Math.max(0, free)} Gerät(e) übernommen – mehr als vier Größen gleichzeitig sind nicht möglich.` : null);
  renderChannels(); renderLive(); updateButtons(); scheduleSave();
}

/* ============================== Live-Karten ============================== */

function renderLive(): void {
  $('livecards').innerHTML = chans.filter((c) => c.cal).map((c) => `
    <div class="live ch-${c.slot + 1}" data-id="${c.id}">
      <div class="name">${symbol(c.slot)}<span>${esc(c.name)}</span></div>
      <div class="live-value" id="val-${c.id}">–</div>
      <div class="conf none" id="conf-${c.id}">${icon('warning', 16)}wartet auf Bild</div>
    </div>`).join('');
}

function updateLive(c: Chan): void {
  const val = document.getElementById(`val-${c.id}`), conf = document.getElementById(`conf-${c.id}`);
  if (!val || !conf || !c.live) return;
  const { value, confidence } = c.live;
  val.innerHTML = `${de(value, 3).replace(',', '<span class="dec">,</span>')}<small>${esc(c.unit)}</small>`;
  const [cls, ic, txt] = value === null ? ['none', 'warning', 'nicht lesbar'] : confidence >= 0.7 ? ['ok', 'check', 'sicher gelesen'] : confidence >= 0.4 ? ['low', 'warning', 'unsicher'] : ['none', 'warning', 'sehr unsicher'];
  conf.className = `conf ${cls}`;
  conf.innerHTML = `${icon(ic, 16)}${txt}`;
}

/* ============================== Anzeige-Schleife ============================== */

function drawSymbol(slot: number, x: number, y: number, r: number): void {
  vctx.beginPath();
  const s = SYMBOLS[slot % 4];
  if (s === 'circle') vctx.arc(x, y, r, 0, Math.PI * 2);
  else if (s === 'triangle') { vctx.moveTo(x, y - r); vctx.lineTo(x + r, y + r); vctx.lineTo(x - r, y + r); vctx.closePath(); }
  else if (s === 'rect') vctx.rect(x - r, y - r, 2 * r, 2 * r);
  else { vctx.moveTo(x, y - r * 1.3); vctx.lineTo(x + r * 1.3, y); vctx.lineTo(x, y + r * 1.3); vctx.lineTo(x - r * 1.3, y); vctx.closePath(); }
}
function strokeHalo(draw: () => void, color: string, w = 2): void {
  vctx.lineWidth = w + 3; vctx.strokeStyle = 'rgb(0 0 0 / .65)'; draw(); vctx.stroke();
  vctx.lineWidth = w; vctx.strokeStyle = color; draw(); vctx.stroke();
}

function drawOverlay(): void {
  vctx.font = '700 15px "Atkinson Hyperlegible", system-ui, sans-serif';
  const scale = view.width / Math.max(1, view.getBoundingClientRect().width || view.width);
  vctx.save();
  for (const c of chans) {
    const col = chanColor(c.slot);
    const isCal = calib?.id === c.id;
    const r = c.raw;
    const anchor: Point | undefined = c.type === 'analog' ? r.pivot : c.roi ? { x: c.roi.x, y: c.roi.y - 8 } : undefined;
    if (c.type === 'analog') {
      if (r.pivot) for (const p of [r.p1, r.p2]) if (p) strokeHalo(() => { vctx.beginPath(); vctx.moveTo(r.pivot!.x, r.pivot!.y); vctx.lineTo(p.x, p.y); }, col);
      if (c.cal?.type === 'analog' && r.pivot) {
        const rad = c.cal.radius;
        strokeHalo(() => { vctx.beginPath(); vctx.arc(r.pivot!.x, r.pivot!.y, rad, 0, 7); vctx.setLineDash([5 * scale, 7 * scale]); }, col, 1.5);
        vctx.setLineDash([]);
      }
      for (const q of pointsOf(c)) {
        const selected = sel?.id === c.id && sel.key === q.key;
        strokeHalo(() => drawSymbol(c.slot, q.p.x, q.p.y, 6 * scale), col);
        vctx.fillStyle = col; vctx.fill();
        if (selected) strokeHalo(() => { vctx.beginPath(); vctx.arc(q.p.x, q.p.y, 13 * scale, 0, 7); }, '#F6B48F', 2);
      }
    } else if (c.roi) {
      strokeHalo(() => { vctx.beginPath(); vctx.rect(c.roi!.x, c.roi!.y, c.roi!.w, c.roi!.h); }, col);
      if (sel?.id === c.id && sel.key === 'roi') strokeHalo(() => { vctx.beginPath(); vctx.rect(c.roi!.x - 4 * scale, c.roi!.y - 4 * scale, c.roi!.w + 8 * scale, c.roi!.h + 8 * scale); }, '#F6B48F', 2);
      if (c.cal) {
        const cw = c.roi.w / c.digits;
        vctx.setLineDash([3 * scale, 5 * scale]);
        for (let i = 1; i < c.digits; i++) strokeHalo(() => { vctx.beginPath(); vctx.moveTo(c.roi!.x + i * cw, c.roi!.y); vctx.lineTo(c.roi!.x + i * cw, c.roi!.y + c.roi!.h); }, col, 1);
        vctx.setLineDash([]);
      }
    }
    if (anchor) {
      const label = c.name + (isCal ? ' …' : '');
      const w = vctx.measureText(label).width + 28 * scale / 1.4;
      vctx.fillStyle = 'rgb(0 0 0 / .72)';
      vctx.fillRect(anchor.x + 10 * scale, anchor.y - 22 * scale, w, 22 * scale);
      vctx.fillStyle = col; drawSymbol(c.slot, anchor.x + 20 * scale, anchor.y - 11 * scale, 5 * scale); vctx.fill();
      vctx.fillStyle = '#fff'; vctx.fillText(label, anchor.x + 30 * scale, anchor.y - 5 * scale);
    }
  }
  drawTrackOverlay(scale);
  if (roiDraw) strokeHalo(() => { vctx.beginPath(); vctx.rect(Math.min(roiDraw!.start.x, roiDraw!.cur.x), Math.min(roiDraw!.start.y, roiDraw!.cur.y), Math.abs(roiDraw!.cur.x - roiDraw!.start.x), Math.abs(roiDraw!.cur.y - roiDraw!.start.y)); }, '#F6B48F', 2);
  vctx.restore();
}

function qualityOf(c: Chan, frame: Frame): string[] {
  if (!c.cal) return [];
  const issues = c.cal.type === 'analog'
    ? assessRegion(frame, { x: c.cal.pivot.x - c.cal.radius, y: c.cal.pivot.y - c.cal.radius, w: 2 * c.cal.radius, h: 2 * c.cal.radius }, { minFeature: c.cal.radius / 2 }).issues
    : assessRegion(frame, c.cal.roi, { minFeature: c.cal.roi.h / 3 }).issues;
  // Sprung um eine Zehnerpotenz in den letzten Ablesungen: Messbereich oder Dezimalpunkt am Gerät geändert?
  const buf = liveBuf.get(c.id) ?? [];
  if (detectScaleJumps(buf, { persist: 2 }).some((j) => j.index >= buf.length - 5)) jumpWarnAt.set(c.id, performance.now());
  if (performance.now() - (jumpWarnAt.get(c.id) ?? -1e9) < 15000) {
    issues.push(c.type === 'digital'
      ? 'Der Wert ist plötzlich um eine Zehnerpotenz gesprungen: Messbereich oder Dezimalpunkt am Gerät geändert? Dezimalstellen hier und Einheit prüfen.'
      : 'Der Wert ist plötzlich um eine Zehnerpotenz gesprungen: Messbereich am Gerät geändert? Skalenwerte der Kalibrierung prüfen.');
  }
  return issues;
}

let lastRead = 0, lastQuality = 0;
function drawEmpty(): void {
  vctx.fillStyle = '#2e2a28';
  vctx.fillRect(0, 0, view.width, view.height);
  vctx.fillStyle = '#f6b48f';
  vctx.textAlign = 'center';
  vctx.font = '700 22px "Space Grotesk", system-ui, sans-serif';
  vctx.fillText('Noch keine Quelle', view.width / 2, view.height / 2 - 6);
  vctx.font = '400 16px "Atkinson Hyperlegible", system-ui, sans-serif';
  vctx.fillText('Wähle rechts Kamera, Videodatei oder Demo.', view.width / 2, view.height / 2 + 22);
  vctx.textAlign = 'start';
}

function loop(now: number): void {
  if (!source) drawEmpty();
  if (source) {
    try {
      const frame = stabilizeFrame(source.grab());
      vctx.putImageData(new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
      updateTrackPreview(frame);
      drawOverlay();
      if (now - lastRead > 250) {
        lastRead = now;
        announceLive(now);
        if (anchorCfg || loopStab) renderAnchorStatus();
        if (source?.kind === 'audio') renderAudioLive();
        for (const c of chans) if (c.cal) {
          c.live = readChannel(frame, c.cal);
          updateLive(c);
          const buf = liveBuf.get(c.id) ?? [];
          if (c.live.value !== null && c.live.confidence >= 0.4) buf.push(c.live.value); else buf.length = 0;
          if (buf.length > 8) buf.shift();
          liveBuf.set(c.id, buf);
        }
      }
      if (now - lastQuality > 1000) {
        lastQuality = now;
        for (const c of chans) {
          const issues = qualityOf(c, frame);
          if (issues.join('|') !== c.issues.join('|')) {
            c.issues = issues;
            const ul = document.getElementById(`issues-${c.id}`);
            if (ul) ul.innerHTML = issues.map((t) => `<li>${icon('warning', 16)}<span>${esc(t)}</span></li>`).join('');
          }
        }
      }
    } catch { /* Frame noch nicht verfügbar */ }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ============================== Messen ============================== */

function syncSessionChannels(): void {
  for (const c of chans) {
    if (c.cal && !session.channels.some((s) => s.id === c.id)) session.addChannel({ id: c.id, name: c.name, unit: c.unit, uncertainty: uncOf(c) });
  }
  if (trackSt.cfg) {
    const unit = trackSt.cfg.scale ? 'm' : 'px';
    for (const axis of ['x', 'y'] as const) {
      const id = `trk-${axis}`, name = `${trackSt.name} ${axis}`;
      const ex = session.channels.find((s) => s.id === id);
      if (ex) { ex.name = name; ex.unit = unit; } else session.addChannel({ id, name, unit });
    }
  }
  if (source?.kind === 'audio') {
    for (const [id, name, unit, on] of [['mic-f', 'Frequenz', 'Hz', $<HTMLInputElement>('mic-freq').checked], ['mic-l', 'Pegel', 'dB', $<HTMLInputElement>('mic-level').checked]] as const) {
      if (on && !session.channels.some((s) => s.id === id)) session.addChannel({ id, name, unit });
    }
  }
  if (gateSt.rect) {
    const ex = session.channels.find((s) => s.id === 'gate');
    if (ex) { ex.name = gateSt.name; ex.unit = gateUnit(); } else session.addChannel({ id: 'gate', name: gateSt.name, unit: gateUnit() });
  }
  refreshSelects();
}

function updateStatus(): void {
  const n = session.samples.length;
  const last = n ? session.samples[n - 1].t : 0;
  const secs = stopLive ? (performance.now() - recStart) / 1000 : last;
  $('status').textContent = stopLive ? `Aufnahme läuft · ${de(secs, 1)} s · ${n} Messpunkte` : n ? `${n} Messpunkte über ${de(last, 1)} s.` : 'Noch keine Messpunkte.';
}

function updateButtons(): void {
  const ready = readyForMeasure();
  const recording = !!stopLive || !!abort;
  const has = session.samples.length > 0;
  $<HTMLButtonElement>('btn-live').disabled = !ready && !stopLive;
  $<HTMLButtonElement>('btn-analyze').disabled = !ready || recording;
  $<HTMLButtonElement>('btn-cancel').hidden = !abort;
  $<HTMLButtonElement>('btn-archive').disabled = !has || recording;
  $<HTMLButtonElement>('btn-clear').disabled = !has || recording;
  $<HTMLButtonElement>('cal-save').disabled = !chans.some((c) => c.cal);
  $<HTMLButtonElement>('next-1').disabled = !source;
  $<HTMLButtonElement>('next-2').disabled = !ready;
  $<HTMLButtonElement>('next-3').disabled = !has && !session.runs.length;
  const hasAny = has || session.runs.length > 0;
  for (const id of ['dl-csv', 'dl-xlsx', 'dl-png', 'dl-protocol', 'print-protocol']) $<HTMLButtonElement>(id).disabled = !hasAny;
  updateStatus();
  renderOrientation({ ready, recording, has, hasAny });
}

/** Warum ist ein Knopf grau? Ein Satz daneben, dazu Statusleiste und Häkchen an den Reitern. */
function renderOrientation(st: { ready: boolean; recording: boolean; has: boolean; hasAny: boolean }): void {
  const why = (id: string, text: string): void => { $(id).textContent = text; };
  why('why-next-1', source ? '' : 'Wähle zuerst eine Quelle.');
  why('why-next-2', st.ready ? '' : source ? 'Lege zuerst ein Gerät an und kalibriere es (oder wähle Marker oder Lichtschranke).' : 'Wähle zuerst eine Quelle.');
  why('why-next-3', st.has || session.runs.length ? '' : 'Es gibt noch keine Messwerte. Miss zuerst in Schritt 3.');
  why('why-live', st.ready || stopLive ? '' : source ? 'Zum Messen erst in Schritt 2 ein Gerät kalibrieren.' : 'Zum Messen erst in Schritt 1 eine Quelle wählen.');
  why('why-export', st.hasAny ? '' : 'Exportieren geht, sobald es Messwerte gibt.');
  $('chart-empty').hidden = st.hasAny;
  if (trackSt.cfg || gateSt.rect || anchorCfg) $<HTMLDetailsElement>('moretools').open = true;
  if (variation.rows.length) $<HTMLDetailsElement>('varbox').open = true;
  const names = ['Quelle', 'Geräte', 'Messen', 'Auswertung'];
  const done = [!!source, st.ready, st.has || session.runs.length > 0, false];
  names.forEach((n, i) => {
    const tab = $(`tab-${i + 1}`);
    tab.classList.toggle('done', done[i]);
    tab.setAttribute('aria-label', `Schritt ${i + 1}: ${n}${done[i] ? ', erledigt' : ''}`);
  });
  const kinds: Record<string, string> = { camera: 'Kamera', file: 'Videodatei', demo: 'Demo', audio: source instanceof ToneDemoSource ? 'Demo-Ton' : 'Mikrofon' };
  const parts = [`Quelle: ${source ? kinds[source.kind] : 'noch keine'}`];
  const n = active().length;
  parts.push(n === 1 ? '1 Größe' : `${n} Größen`);
  parts.push(`${session.samples.length} Messpunkte`);
  const t = templateById(tplId);
  if (t) parts.push(`Versuch: ${t.title}`);
  $('statusbar').textContent = parts.join(' · ');
}

const liveBtn = $<HTMLButtonElement>('btn-live');
function setLiveButton(recording: boolean): void {
  liveBtn.innerHTML = `${icon(recording ? 'stop' : 'record')}<span id="btn-live-label">${recording ? 'Aufnahme beenden' : 'Aufnahme starten'}</span>`;
  liveBtn.classList.toggle('recording', recording);
}

function stopRecording(): void {
  stopLive?.();
  stopLive = null;
  abort?.abort();
  abort = null;
  setLiveButton(false);
  $<HTMLProgressElement>('progress').hidden = true;
  updateButtons();
  scheduleSave();
}

function toggleRecording(): void {
  if (stopLive) return stopRecording();
  if (!source || !readyForMeasure()) return;
  if (source instanceof DemoSource) source.live();
  syncSessionChannels();
  recStart = performance.now();
  const hz = Number($<HTMLSelectElement>('hz').value);
  stopLive = startLive(source, active(), session, hz, () => { updateStatus(); renderResults(); scheduleSave(); }, recStabilizer());
  setLiveButton(true);
  updateButtons();
}
liveBtn.onclick = toggleRecording;

$('btn-analyze').onclick = async () => {
  if (!source) return;
  syncSessionChannels();
  const hz = Number($<HTMLSelectElement>('hz').value);
  abort = new AbortController();
  const bar = $<HTMLProgressElement>('progress');
  bar.hidden = false;
  bar.value = 0;
  updateButtons();
  try {
    await analyzeFile(source, active(), session, hz, (f) => { bar.value = f; $('status').textContent = `Auswertung ${Math.round(f * 100)} % · ${session.samples.length} Messpunkte`; }, abort.signal, recStabilizer());
  } catch (e) {
    showError((e as Error).message);
  }
  const aborted = abort?.signal.aborted;
  abort = null;
  bar.hidden = true;
  updateButtons();
  renderResults();
  scheduleSave();
  if (!aborted) goStep(4);
};
$('btn-cancel').onclick = () => { abort?.abort(); };

$('btn-archive').onclick = () => {
  session.archive(`Reihe ${session.runs.length + 1}`);
  updateButtons(); renderResults(); scheduleSave();
  setHint('Reihe gesichert. Starte jetzt die nächste Messung – beide erscheinen im Graphen.');
};
let clearTimer = 0;
const clearBtn = $<HTMLButtonElement>('btn-clear');
clearBtn.onclick = () => {
  if (!clearTimer) {
    clearBtn.innerHTML = `${icon('warning')}Wirklich verwerfen?`;
    clearTimer = window.setTimeout(resetClear, 3000);
    return;
  }
  resetClear();
  session.clear();
  updateButtons(); renderResults(); scheduleSave();
};
function resetClear(): void {
  clearTimeout(clearTimer);
  clearTimer = 0;
  clearBtn.innerHTML = `${icon('trash')}Verwerfen`;
}

/* ============================== Auswertung ============================== */

const xsel = $<HTMLSelectElement>('xsel'), ysel = $<HTMLSelectElement>('ysel'), y2sel = $<HTMLSelectElement>('y2sel');

function allChannelDefs(): ChannelDef[] {
  const m = new Map<string, ChannelDef>();
  for (const r of session.runs) for (const c of r.channels) m.set(c.id, c);
  for (const c of session.channels) m.set(c.id, c);
  return [...m.values()];
}

function refreshSelects(): void {
  const px = xsel.value, py = ysel.value, py2 = y2sel.value;
  const ch = session.channels;
  const opts = ch.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  xsel.innerHTML = `<option value="${TIME_KEY}">Zeit</option>${opts}`;
  ysel.innerHTML = opts;
  y2sel.innerHTML = `<option value="">– keine –</option>${opts}`;
  if ([...xsel.options].some((o) => o.value === px)) xsel.value = px;
  if ([...ysel.options].some((o) => o.value === py)) ysel.value = py; else if (ch.length) ysel.value = ch[0].id;
  if ([...y2sel.options].some((o) => o.value === py2)) y2sel.value = py2;
  if ((document.getElementById('pred-box') as HTMLDetailsElement | null)?.open) predAxisOptions();
}
xsel.onchange = ysel.onchange = y2sel.onchange = () => renderResults();
for (const id of ['xlog', 'ylog', 'showruns']) $(id).onchange = () => renderResults();
$<HTMLInputElement>('smooth').onchange = (e) => {
  session.smoothing = (e.target as HTMLInputElement).checked ? 3 : 0;
  renderResults();
  scheduleSave();
};
$('zoom-reset').onclick = () => chart.resetZoom();

const LIGHT = { ink: '#2e2a28', grid: '#e0d2c4', warn: '#b3341f', ch: ['#c4472d', '#2e6f8e', '#5b7f2b', '#8a4f9e'] };

function label(id: string): string {
  if (id === TIME_KEY) return 'Zeit / s';
  const c = allChannelDefs().find((s) => s.id === id);
  return c ? (c.unit ? `${c.name} / ${c.unit}` : c.name) : '';
}
const slotOf = (id: string): number => chans.find((c) => c.id === id)?.slot ?? Math.max(0, allChannelDefs().findIndex((c) => c.id === id)) % 4;

function renderResults(light = false): void {
  updateButtons();
  const problems = session.recompute();
  renderDerivedList(problems);
  applyTplAxes();
  const x = xsel.value || TIME_KEY;
  const ys = [...new Set([ysel.value, y2sel.value])].filter((v) => v && session.channels.some((c) => c.id === v));
  const series: ChartSeries[] = [];
  const colorFor = (slot: number): string => (light ? LIGHT.ch[slot % 4] : chanColor(slot));
  const showRuns = $<HTMLInputElement>('showruns').checked;
  ys.forEach((y, i) => {
    const axis = i === 0 ? 'y' : 'y2';
    const name = session.channels.find((c) => c.id === y)!.name;
    series.push({ label: name, color: colorFor(slotOf(y)), slot: slotOf(y), axis, faded: false, points: session.series(x, y) });
    if (showRuns) for (const run of session.runs) {
      if (!run.channels.some((c) => c.id === y) || (x !== TIME_KEY && !run.channels.some((c) => c.id === x))) continue;
      series.push({ label: `${name} (${run.name})`, color: colorFor(slotOf(y)), slot: slotOf(y), axis, faded: true, points: seriesOf(run.samples, x, y, session.smoothing) });
    }
  });
  renderPredictionOnChart(x, ys[0], series, light);
  renderFit(x, ys[0], series, light);
  renderGraphDescription(x, ys[0], series);
  chart.update({
    band: fitRange, series, xLabel: label(x), yLabel: ys[0] ? label(ys[0]) : '', y2Label: ys[1] ? label(ys[1]) : '',
    xLog: $<HTMLInputElement>('xlog').checked, yLog: $<HTMLInputElement>('ylog').checked, line: x === TIME_KEY,
    ink: light ? LIGHT.ink : cssVar('--ink'), grid: light ? LIGHT.grid : cssVar('--line'),
    font: light ? 14 : beamer ? 18 : 14,
    danger: light ? LIGHT.warn : cssVar('--danger'),
  });
  renderRuns();
  renderTable();
  renderVariation(light);
  renderTemplateResults();
  renderClassShare();
  renderJumpNotes();
  renderGate();
}

/* ---- Fit ---- */

const residChart = new ResidualChart($<HTMLCanvasElement>('resid'));
$<HTMLSelectElement>('fit-model').innerHTML = `<option value="">– kein Fit –</option>${MODELS.map((m) => `<option value="${m.id}">${esc(m.name)}: ${esc(m.formula)}</option>`).join('')}`;

/** Wert ± Unsicherheit: Unsicherheit auf 2 gültige Stellen, Wert auf dieselbe Stelle gerundet. */
/** R² mit vier Nachkommastellen; „–“, wenn nicht definiert (z. B. konstante Messwerte). */
const fmtR2 = (r2: number): string => (Number.isFinite(r2) ? r2.toFixed(4).replace('.', ',') : '–');
function withError(v: number, s: number): string {
  const exp = (n: number, d: number): string => n.toExponential(d).replace('.', ',').replace('e+', 'e');
  if (!Number.isFinite(v)) return '–';
  if (Math.abs(v) >= 1e15 || (Number.isFinite(s) && s >= 1e15)) return Number.isFinite(s) && s > 0 ? `${exp(v, 3)} ± ${exp(s, 1)}` : exp(v, 3);
  const fix = (n: number, dec: number): string => n.toFixed(Math.max(0, dec)).replace('.', ',');
  if (!Number.isFinite(s) || s <= 0) return fix(Number(v.toPrecision(4)), 3 - Math.floor(Math.log10(Math.abs(v) || 1)));
  const p = Math.pow(10, Math.floor(Math.log10(s)) - 1);
  const dec = -Math.floor(Math.log10(p));
  if (dec > 9) return `${String(Number(v.toPrecision(6))).replace('.', ',').replace('e+', 'e')} ± ${exp(s, 1)}`; // winzige Größenordnung: Zehnerpotenz statt vieler Nullen
  return `${fix(Math.round(v / p) * p, dec)} ± ${fix(Math.round(s / p) * p, dec)}`;
}
const fitLines = (f: FitSuccess): string[] => [
  `Fit: ${f.model.name}  y = ${f.model.formula}`,
  f.params.map((p) => `${p.name} = ${withError(p.value, p.sigma)}`).join(',  ') + `   (R² = ${fmtR2(f.r2)}, n = ${f.n})`,
];

function renderFit(xKey: string, yId: string | undefined, series: ChartSeries[], light: boolean): void {
  const box = $('fit-result'), wrap = $('resid-wrap');
  lastFit = null;
  const model = modelById(fitModelId);
  $<HTMLSelectElement>('fit-model').value = fitModelId;
  $('fit-range-clear').hidden = !fitRange;
  if (!model || !yId) { box.innerHTML = ''; box.className = ''; wrap.hidden = true; return; }
  const pts = session.series(xKey, yId);
  const res = fitModel(model, pts.map((p) => ({ x: p.x, y: p.y, sy: p.sy })), { range: fitRange ?? undefined });
  if (!res.ok) { box.className = 'fit-result unreliable'; box.innerHTML = `<p>${icon('warning', 16)} ${esc(res.error)}</p>`; wrap.hidden = true; return; }
  lastFit = res;
  const [lo, hi] = res.range;
  const n = 200, start = model.positive && lo <= 0 ? hi / n : lo;
  series.push({
    label: `Fit: ${model.name}`, color: light ? LIGHT.ink : cssVar('--ink'), slot: 0, axis: 'y', faded: false, fit: true,
    points: Array.from({ length: n + 1 }, (_, i) => { const xv = start + ((hi - start) * i) / n; return { x: xv, y: res.curve(xv), c: 1 }; }),
  });
  box.className = `fit-result${res.reliable ? '' : ' unreliable'}`;
  box.innerHTML = `
    <p class="formula"><b>${esc(model.name)}</b>: y = ${esc(model.formula)}${res.reliable ? '' : ` <b>(nicht belastbar)</b>`}</p>
    <dl>${res.params.map((p) => `<dt>${esc(p.name)}</dt><dd>${withError(p.value, p.sigma)}</dd>`).join('')}</dl>
    <p class="stats">R² = ${fmtR2(res.r2)} · n = ${res.n}${res.chi2red !== null ? ` · χ²<sub>red</sub> = ${res.chi2red.toFixed(2).replace('.', ',')}` : ''}${fitRange ? ' · Fitbereich gewählt' : ''}</p>
    ${res.warnings.length ? `<ul>${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
  wrap.hidden = false;
  residChart.update({
    points: res.residuals, xLabel: label(xKey), yLabel: 'Abweichung', color: colorOfSlot(slotOf(yId), light),
    ink: light ? LIGHT.ink : cssVar('--ink'), grid: light ? LIGHT.grid : cssVar('--line'), font: 12,
  });
}
const colorOfSlot = (slot: number, light: boolean): string => (light ? LIGHT.ch[slot % 4] : chanColor(slot));

$<HTMLSelectElement>('fit-model').onchange = (e) => { fitModelId = (e.target as HTMLSelectElement).value; renderResults(); };
$('fit-range-clear').onclick = () => { fitRange = null; renderResults(); };
$('fit-range').onclick = () => setSelectMode(!selectMode);
function setSelectMode(on: boolean): void {
  selectMode = on;
  selecting = null;
  $('fit-range').setAttribute('aria-pressed', String(on));
  $('fit-hint').hidden = !on;
  chart.setSelecting(on);
}
const chartCanvas = $<HTMLCanvasElement>('chart');
chartCanvas.addEventListener('pointerdown', (e) => {
  if (!selectMode) return;
  const x = chart.xAt(e.clientX);
  if (x === null) return;
  selecting = { from: x };
  chartCanvas.setPointerCapture(e.pointerId);
  fitRange = [x, x];
});
chartCanvas.addEventListener('pointermove', (e) => {
  if (!selecting) return;
  const x = chart.xAt(e.clientX);
  if (x === null) return;
  fitRange = [Math.min(selecting.from, x), Math.max(selecting.from, x)];
  renderResults();
});
chartCanvas.addEventListener('pointerup', () => {
  if (!selecting) return;
  if (!fitRange || fitRange[1] - fitRange[0] <= 0) fitRange = null;
  setSelectMode(false);
  renderResults();
});

/* ---- Abgeleitete Größen ---- */

const derivedlg = $<HTMLDialogElement>('derivedlg');
let nextDerived = 1;

function renderDerivedList(problems: Record<string, string>): void {
  const list = session.channels.filter((c) => c.derived);
  $('derived-list').innerHTML = list.map((c) => {
    const d = c.derived!;
    const what = d.kind === 'formula' ? `= ${esc(d.expr ?? '')}` : `${d.kind === 'derivative' ? 'Ableitung' : 'Integral'} von ${esc(session.channels.find((x) => x.id === d.of)?.name ?? '?')}`;
    return `<li><span><b>${esc(c.name)}</b>${c.unit ? ` / ${esc(c.unit)}` : ''} ${what}</span>
      <button type="button" class="ghost" data-del-derived="${c.id}" aria-label="${esc(c.name)} entfernen">${icon('trash', 18)}Entfernen</button>
      ${problems[c.id] ? `<span class="problem">${icon('warning', 16)} ${esc(problems[c.id])}</span>` : ''}</li>`;
  }).join('');
}
$('derived-list').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-del-derived]');
  if (!b) return;
  session.removeChannel(b.dataset.delDerived!);
  refreshSelects();
  renderResults();
  scheduleSave();
});

function syncDerivedDialog(): void {
  const kind = $<HTMLSelectElement>('derivedlg-kind').value;
  $('derivedlg-src-row').hidden = kind === 'formula';
  $('derivedlg-expr-row').hidden = kind !== 'formula';
}
$('derivedlg-kind').addEventListener('change', syncDerivedDialog);
$('derive-new').onclick = () => {
  if (session.channels.length < 1) return showError('Zuerst ein Messgerät anlegen und messen.');
  if (usedChannelCount() >= MAX_CHANNELS) return showError('Mehr als vier Größen gleichzeitig (Messgeräte, Marker, Lichtschranke und abgeleitete Größen zusammen) werden nicht unterstützt.');
  const real = session.channels.filter((c) => !c.derived || true);
  $('derivedlg-src').innerHTML = real.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('derivedlg-vars').innerHTML = real.map((c) => `<button type="button" class="ghost" data-ins="${esc(Session.identOf(c.name))}">${esc(Session.identOf(c.name))}</button>`).join(' ');
  $<HTMLInputElement>('derivedlg-expr').value = '';
  $<HTMLInputElement>('derivedlg-name').value = '';
  $<HTMLInputElement>('derivedlg-unit').value = '';
  $('derivedlg-err').textContent = '';
  syncDerivedDialog();
  derivedlg.showModal();
};
$('derivedlg-vars').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ins]');
  if (!b) return;
  const input = $<HTMLInputElement>('derivedlg-expr');
  input.value += b.dataset.ins!;
  input.focus();
});
$('derivedlg-form').addEventListener('submit', (ev) => {
  const choice = ((ev as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
  if (choice !== 'ok') return;
  const err = (msg: string): void => { ev.preventDefault(); $('derivedlg-err').textContent = msg; };
  const kind = $<HTMLSelectElement>('derivedlg-kind').value as 'formula' | 'derivative' | 'integral';
  const name = $<HTMLInputElement>('derivedlg-name').value.trim();
  if (!name) return err('Bitte einen Namen angeben, z. B. Leistung.');
  if (session.channels.some((c) => c.name === name)) return err('Diesen Namen gibt es schon. Bitte einen anderen wählen.');
  const unit = $<HTMLInputElement>('derivedlg-unit').value.trim();
  let derived: NonNullable<ChannelDef['derived']>;
  if (kind === 'formula') {
    const expr = $<HTMLInputElement>('derivedlg-expr').value.trim();
    try {
      const parsed = parseExpression(expr);
      const idents = new Set(session.channels.map((c) => Session.identOf(c.name)));
      const unknown = parsed.vars.filter((v) => !idents.has(v));
      if (unknown.length) return err(`Unbekannte Größe: ${unknown.join(', ')}. Zum Einfügen die Schaltflächen nutzen.`);
    } catch (e) { return err((e as Error).message); }
    derived = { kind, expr };
  } else {
    derived = { kind, of: $<HTMLSelectElement>('derivedlg-src').value };
  }
  session.addChannel({ id: `d${nextDerived++}`, name, unit, derived });
  refreshSelects();
  $<HTMLSelectElement>('ysel').value = session.channels[session.channels.length - 1].id;
  renderResults();
  scheduleSave();
});

/* ---- Parameterreihe ---- */

const VAR_MODELS = ['line', 'prop', 'power', 'decay', 'saturation'];
let varChart: ResultChart | null = null;
const pLabel = (): string => (variation.pname || 'Parameter') + (variation.punit ? ` / ${variation.punit}` : '');
const vLabel = (): string => (variation.vname || 'Messwert') + (variation.vunit ? ` / ${variation.vunit}` : '');
const axisLabel = (t: Transform, name: string, unit: string): string => transformLabel(t, name) + (t === 'id' && unit ? ` / ${unit}` : '');
const fmtNum = (v: number): string => String(Number(v.toPrecision(6))).replace('.', ',');
const parseNum = (t: string): number => Number(t.trim().replace(',', '.'));
const varMsg = (m: string): void => { $('var-msg').textContent = m; };

function varChanged(): void { renderResults(); scheduleSave(); }

function takeLive(): void {
  varMsg('');
  const p = parseNum($<HTMLInputElement>('var-p').value);
  if (!Number.isFinite(p) || $<HTMLInputElement>('var-p').value.trim() === '') return varMsg('Bitte zuerst den Wert des Parameters eintippen, z. B. 100.');
  const srcId = $<HTMLSelectElement>('var-src').value;
  const mic = srcId === 'mic-f' || srcId === 'mic-l';
  const c = mic ? null : chans.find((x) => x.id === srcId);
  if (!mic && (!c || !c.cal)) return varMsg('Bitte ein kalibriertes Gerät wählen.');
  const buf = liveBuf.get(srcId) ?? [];
  if (buf.length < 3) return varMsg(mic ? 'Noch zu wenige sichere Messwerte. Es muss ein Ton zu hören sein (Mikrofon näher an die Quelle).' : 'Noch zu wenige sichere Ablesungen. Kamera oder Demo muss laufen und die Anzeige sicher gelesen werden.');
  // Gerätefehler: bei Geräten aus der Angabe, beim Mikrofon die Auflösung der Analyse (Frequenz 0,2 Hz, Pegel 0,5 dB)
  const dev = mic ? (srcId === 'mic-f' ? 0.2 : 0.5) : sigmaOf(uncOf(c!), buf[buf.length - 1]);
  const r = averageReadings(buf, dev)!;
  if (!variation.vname) { variation.vname = mic ? (srcId === 'mic-f' ? 'Frequenz' : 'Pegel') : c!.name; variation.vunit = mic ? (srcId === 'mic-f' ? 'Hz' : 'dB') : c!.unit; }
  variation.src = srcId;
  variation.rows.push({ p, v: r.v, s: r.s });
  $<HTMLInputElement>('var-p').value = '';
  $<HTMLInputElement>('var-p').focus();
  varChanged();
}

function takeFitParam(): void {
  varMsg('');
  const p = parseNum($<HTMLInputElement>('var-p').value);
  if (!Number.isFinite(p) || $<HTMLInputElement>('var-p').value.trim() === '') return varMsg('Bitte zuerst den Wert des Parameters eintippen, z. B. 100.');
  if (!lastFit) return varMsg('Es gibt kein Fitergebnis. Oben ein Modell wählen.');
  const prm = lastFit.params.find((x) => x.name === $<HTMLSelectElement>('var-fitparam').value);
  if (!prm) return;
  if (!variation.vname) variation.vname = prm.name;
  variation.rows.push({ p, v: prm.value, s: Number.isFinite(prm.sigma) ? prm.sigma : null });
  $<HTMLInputElement>('var-p').value = '';
  varChanged();
}

function renderVariation(light = false): void {
  const plot = $('var-plot');
  // Eingabefelder nur anfassen, wenn nicht gerade getippt wird
  const set = (id: string, v: string): void => { const el = $<HTMLInputElement>(id); if (document.activeElement !== el) el.value = v; };
  set('var-pname', variation.pname); set('var-punit', variation.punit); set('var-vname', variation.vname); set('var-vunit', variation.vunit);
  const devs = chans.filter((c) => c.cal);
  const srcSel = $<HTMLSelectElement>('var-src');
  const micOpts = source?.kind === 'audio' ? '<option value="mic-f">Frequenz (Mikrofon)</option><option value="mic-l">Pegel (Mikrofon)</option>' : '';
  srcSel.innerHTML = devs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') + micOpts || '<option value="">– kein Gerät –</option>';
  if (devs.some((c) => c.id === variation.src) || (micOpts && (variation.src === 'mic-f' || variation.src === 'mic-l'))) srcSel.value = variation.src;
  $('var-fit-row').hidden = !lastFit;
  if (lastFit) {
    const fp = $<HTMLSelectElement>('var-fitparam'), keep = fp.value;
    fp.innerHTML = lastFit.params.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    if (lastFit.params.some((p) => p.name === keep)) fp.value = keep;
  }
  const rows = variation.rows;
  $('var-table').innerHTML = rows.length ? `<table><thead><tr><th>#</th><th>${esc(pLabel())}</th><th>${esc(vLabel())}</th><th>± σ</th><th></th></tr></thead><tbody>${rows.map((r, i) => `
    <tr><td>${i + 1}</td><td class="num">${fmtNum(r.p)}</td><td class="num">${fmtNum(r.v)}</td><td class="num">${r.s ? fmtNum(r.s) : '–'}</td>
    <td><button type="button" class="ghost" data-var-del="${i}" aria-label="Zeile ${i + 1} löschen">${icon('trash', 18)}</button></td></tr>`).join('')}</tbody></table>` : '<p class="note">Noch keine Zeilen. Parameter eintippen und „Messwert übernehmen“ wählen.</p>';
  plot.hidden = rows.length < 2;
  lastVarFit = null;
  if (rows.length < 2) return;

  const opt = (t: Transform, name: string, unit: string): string => `<option value="${t}">${esc(axisLabel(t, name, unit))}</option>`;
  $<HTMLSelectElement>('var-tx').innerHTML = TRANSFORMS.map((t) => opt(t, variation.pname || 'x', variation.punit)).join('');
  $<HTMLSelectElement>('var-ty').innerHTML = TRANSFORMS.map((t) => opt(t, variation.vname || 'y', variation.vunit)).join('');
  $<HTMLSelectElement>('var-tx').value = variation.tx;
  $<HTMLSelectElement>('var-ty').value = variation.ty;
  $<HTMLSelectElement>('var-model').innerHTML = VAR_MODELS.map((id) => `<option value="${id}">${esc(modelById(id)!.name)}: ${esc(modelById(id)!.formula)}</option>`).join('');
  $<HTMLSelectElement>('var-model').value = variation.model;

  const sugg = suggestPlots(rows);
  $('var-suggest').innerHTML = sugg.length ? `<span class="note">Vorschläge:</span> ${sugg.map((s, i) => `<button type="button" data-sugg="${i}" aria-pressed="${s.tx === variation.tx && s.ty === variation.ty}">
    ${esc(transformLabel(s.ty, variation.vname || 'y'))} über ${esc(transformLabel(s.tx, variation.pname || 'x'))} <span class="r2">R² ${s.r2.toFixed(4).replace('.', ',')}</span>${s.throughOrigin ? ' · Ursprung' : ''}</button>`).join(' ')}` : '';
  varSuggestions = sugg;

  const pts = toPoints(rows, variation.tx, variation.ty);
  const xl = axisLabel(variation.tx, variation.pname || 'x', variation.punit), yl = axisLabel(variation.ty, variation.vname || 'y', variation.vunit);
  const series: ChartSeries[] = [{ label: yl, color: colorOfSlot(0, light), slot: 0, axis: 'y', faded: false, points: pts.map((p) => ({ x: p.x, y: p.y, c: 1, sy: p.sy })) }];
  const box = $('var-result');
  const res = fitModel(modelById(variation.model)!, pts);
  if (!res.ok) { box.className = 'fit-result unreliable'; box.innerHTML = `<p>${icon('warning', 16)} ${esc(res.error)}</p>`; }
  else {
    lastVarFit = res;
    const [lo, hi] = res.range, n = 100, start = res.model.positive && lo <= 0 ? hi / n : lo;
    series.push({ label: `Fit: ${res.model.name}`, color: light ? LIGHT.ink : cssVar('--ink'), slot: 0, axis: 'y', faded: false, fit: true,
      points: Array.from({ length: n + 1 }, (_, i) => { const xv = start + ((hi - start) * i) / n; return { x: xv, y: res.curve(xv), c: 1 }; }) });
    box.className = `fit-result${res.reliable ? '' : ' unreliable'}`;
    box.innerHTML = `<p class="formula"><b>${esc(res.model.name)}</b>: y = ${esc(res.model.formula)}${res.reliable ? '' : ' <b>(nicht belastbar)</b>'}</p>
      <dl>${res.params.map((p) => `<dt>${esc(p.name)}</dt><dd>${withError(p.value, p.sigma)}</dd>`).join('')}</dl>
      <p class="stats">R² = ${fmtR2(res.r2)} · n = ${res.n}${res.chi2red !== null ? ` · χ²<sub>red</sub> = ${res.chi2red.toFixed(2).replace('.', ',')}` : ''}</p>
      ${res.warnings.length ? `<ul>${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
  }
  varChart ??= new ResultChart($<HTMLCanvasElement>('var-chart'));
  varChart.update({
    series, xLabel: xl, yLabel: yl, y2Label: '', xLog: false, yLog: false, line: false, band: null,
    ink: light ? LIGHT.ink : cssVar('--ink'), grid: light ? LIGHT.grid : cssVar('--line'), font: beamer ? 18 : 14, danger: light ? LIGHT.warn : cssVar('--danger'),
  });
}
let varSuggestions: ReturnType<typeof suggestPlots> = [];

for (const [id, key] of [['var-pname', 'pname'], ['var-punit', 'punit'], ['var-vname', 'vname'], ['var-vunit', 'vunit']] as const) {
  $<HTMLInputElement>(id).addEventListener('input', (e) => { variation[key] = (e.target as HTMLInputElement).value; varChanged(); });
}
$('var-src').addEventListener('change', (e) => { variation.src = (e.target as HTMLSelectElement).value; scheduleSave(); });
$('var-take').onclick = takeLive;
$('var-take-fit').onclick = takeFitParam;
$('var-p').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); takeLive(); } });
$('var-table').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-var-del]');
  if (!b) return;
  variation.rows.splice(Number(b.dataset.varDel), 1);
  varChanged();
});
$('var-tx').addEventListener('change', (e) => { variation.tx = (e.target as HTMLSelectElement).value as Transform; varChanged(); });
$('var-ty').addEventListener('change', (e) => { variation.ty = (e.target as HTMLSelectElement).value as Transform; varChanged(); });
$('var-model').addEventListener('change', (e) => { variation.model = (e.target as HTMLSelectElement).value; varChanged(); });
$('var-suggest').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sugg]');
  const sg = b ? varSuggestions[Number(b.dataset.sugg)] : undefined;
  if (!sg) return;
  variation.tx = sg.tx; variation.ty = sg.ty; variation.model = sg.throughOrigin && sg.tx === 'id' && sg.ty === 'id' ? 'prop' : 'line';
  varChanged();
});
$('var-clear').onclick = () => { variation.rows = []; varMsg(''); varChanged(); };
const varTable = (): { header: string[]; rows: (number | null)[][] } => ({
  header: [pLabel(), vLabel(), `σ (${variation.vunit || 'Einheit der Messgröße'})`],
  rows: variation.rows.map((r) => [r.p, r.v, r.s ?? null]),
});
$('var-csv').onclick = () => download(new Blob([toCsv(varTable(), { german: $<HTMLInputElement>('german').checked })], { type: 'text/csv;charset=utf-8' }), `parameterreihe-${stamp()}.csv`);
$('var-xlsx').onclick = () => {
  const sheets: { name: string; table: { header: string[]; rows: (number | string | null)[][] } }[] = [{ name: 'Parameterreihe', table: varTable() }];
  if (lastVarFit) {
    const f = lastVarFit;
    sheets.push({ name: 'Fit', table: { header: ['Größe', 'Wert', 'Unsicherheit'], rows: [
      ['Auftragung x', axisLabel(variation.tx, variation.pname || 'x', variation.punit), null], ['Auftragung y', axisLabel(variation.ty, variation.vname || 'y', variation.vunit), null],
      ['Modell', f.model.name, null], ['Formel', f.model.formula, null], ['Punkte n', f.n, null], ['R²', f.r2, null],
      ...f.params.map((p) => [p.name, p.value, Number.isFinite(p.sigma) ? p.sigma : null]),
    ] } });
  }
  const res = tplSheet();
  if (res) sheets.push(res);
  download(new Blob([toXlsx(sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `parameterreihe-${stamp()}.xlsx`);
};

/* ---- Versuchsvorlagen ---- */

const tplSelect = $<HTMLSelectElement>('tpl-select');
tplSelect.innerHTML = `<option value="">– Vorlage wählen –</option>${TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}`;
tplSelect.onchange = () => {
  const t = templateById(tplSelect.value);
  $<HTMLButtonElement>('tpl-apply').disabled = !t;
  $('tpl-pick-summary').textContent = t ? `${t.topic}. ${t.summary}` : '';
};
$('tpl-apply').onclick = () => { const t = templateById(tplSelect.value); if (t) applyTemplate(t); };
$('tpl-end').onclick = () => { tplId = ''; tplInputs = {}; tplLines = []; renderTemplateCard(); scheduleSave(); };

function applyTemplate(t: Template): void {
  if (t.mode === 'series' && variation.rows.length && !window.confirm('Die vorhandene Parameterreihe wird durch eine neue ersetzt. Fortfahren?')) return;
  tplId = t.id;
  tplInputs = {};
  fitRange = null;
  // Geräte benennen, wie die Vorlage es vorsieht (nur vorhandene; fehlende legt man selbst an)
  (t.channels ?? []).forEach((spec, i) => {
    const c = chans[i];
    if (!c) return;
    c.name = spec.name; c.unit = spec.unit;
    if (spec.poisson) c.unc = { mode: 'poisson', a: '', b: '', c: '' };
    const sc = session.channels.find((x) => x.id === c.id);
    if (sc) { sc.name = c.name; sc.unit = c.unit; sc.uncertainty = uncOf(c); }
  });
  if (t.mode === 'series') {
    const s = t.series!;
    variation = { ...freshVariation(), pname: s.pname, punit: s.punit, vname: s.vname, vunit: s.vunit, tx: s.tx, ty: s.ty, model: s.model };
    fitModelId = '';
  } else {
    fitModelId = t.fit!;
    tplAxes = t.mode === 'time' ? { x: 'time', y: 'dev0' } : { x: 'dev0', y: 'dev1' };
  }
  if (t.audio) {
    $<HTMLInputElement>('mic-freq').checked = true;
    $<HTMLInputElement>('mic-level').checked = t.id === 'schallpegel-abstand';
  }
  renderChannels(); renderLive(); refreshSelects();
  const have = chans.length, need = t.audio ? 0 : t.channels?.length ?? 0;
  setHint(t.audio && source?.kind !== 'audio'
    ? `Vorlage „${t.title}“: Wähle in Schritt 1 als Quelle Mikrofon (oder Demo-Ton zum Ausprobieren).`
    : have < need
    ? `Vorlage „${t.title}“: Lege noch ${need - have} Gerät(e) an (${(t.channels ?? []).slice(have).map((c) => c.name).join(', ')}) und kalibriere sie.`
    : `Vorlage „${t.title}“ angewendet. Der Ablauf steht in Schritt 4 oben.`);
  renderResults(); scheduleSave();
}

/** Setzt x- und y-Achse nach der Vorlage, sobald die Sitzung die Geräte kennt (nach der ersten Aufnahme). */
function applyTplAxes(): void {
  if (!tplAxes) return;
  const ch = session.channels.filter((c) => !c.derived);
  const need = tplAxes.y === 'dev1' ? 2 : 1;
  if (ch.length < need) return;
  xsel.value = tplAxes.x === 'time' ? TIME_KEY : ch[0].id;
  ysel.value = tplAxes.y === 'dev1' ? ch[1].id : ch[0].id;
  tplAxes = null;
}

function renderTemplateCard(): void {
  const t = templateById(tplId);
  if (t && !task) setRoute('tpl');
  if (t?.mode === 'series') $<HTMLDetailsElement>('varbox').open = true;
  $('tpl-card').hidden = !t;
  if (!t) { $('tpl-results').innerHTML = ''; return; }
  $('tpl-title').textContent = `Versuch: ${t.title}`;
  $('tpl-topic').textContent = `${t.topic}. ${t.summary}`;
  $('tpl-steps').innerHTML = t.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  tplSelect.value = t.id;
  $('tpl-inputs').innerHTML = t.inputs.map((i) => `
    <span class="field"><label for="tpl-in-${i.id}">${esc(i.label)}${i.optional ? ' (optional)' : ''}</label>
      <span class="inputunit"><input id="tpl-in-${i.id}" data-tpl-in="${i.id}" inputmode="decimal" autocomplete="off" value="${esc(tplInputs[i.id]?.v ?? '')}" /><span>${esc(i.unit)}</span></span></span>
    <span class="field rel"><label for="tpl-rel-${i.id}">± Unsicherheit</label>
      <span class="inputunit"><input id="tpl-rel-${i.id}" data-tpl-rel="${i.id}" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(tplInputs[i.id]?.rel ?? '')}" /><span>%</span></span></span>`).join('');
  renderTemplateResults();
}
$('tpl-inputs').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const id = el.dataset.tplIn ?? el.dataset.tplRel;
  if (!id) return;
  tplInputs[id] = { v: tplInputs[id]?.v ?? '', rel: tplInputs[id]?.rel ?? '' };
  if (el.dataset.tplIn) tplInputs[id].v = el.value; else tplInputs[id].rel = el.value;
  renderTemplateResults(); scheduleSave();
});

function renderTemplateResults(): void {
  const t = templateById(tplId);
  const host = $('tpl-results');
  tplLines = [];
  if (!t) return;
  if ($('tpl-card').hidden) { renderTemplateCard(); return; }
  if (task?.hideResults && !taskRevealed) {
    host.innerHTML = `<p class="note">${icon('info', 16)} Das Ergebnis ist ausgeblendet: Berechne es selbst aus den Fitparametern und prüfe es dann hier.</p><button type="button" id="task-reveal">Ergebnis anzeigen</button>`;
    return;
  }
  const fit = t.mode === 'series' ? lastVarFit : lastFit;
  if (!fit) {
    host.innerHTML = `<p class="note">${icon('info', 16)} ${t.mode === 'series' ? 'Das Ergebnis erscheint, sobald die Parameterreihe mindestens zwei Zeilen und einen gültigen Fit hat.' : 'Das Ergebnis erscheint, sobald es Messwerte gibt und der Fit gelingt.'}</p>`;
    return;
  }
  const inputs = Object.fromEntries(t.inputs.map((i) => {
    const v = tplInputs[i.id];
    const num = v && v.v.trim() !== '' ? Number(v.v.trim().replace(',', '.')) : NaN;
    const rel = v && v.rel.trim() !== '' ? Number(v.rel.trim().replace(',', '.')) : NaN;
    return [i.id, { value: Number.isFinite(num) ? num : null, relPercent: Number.isFinite(rel) ? rel : null }];
  }));
  tplLines = evalTemplateResults(t, fit.params, inputs);
  renderClassShare();
  host.innerHTML = tplLines.map((l) => {
    if (l.problem) return `<div class="tplres"><b>${esc(l.label)}</b><p class="problem">${icon('warning', 16)} ${esc(l.problem)}</p></div>`;
    const unit = l.unit ? ` ${esc(l.unit)}` : '';
    const lit = l.lit ? (() => {
      const c = l.lit.comparison, ok = c.verdict === 'compatible';
      return `<p class="lit ${c.verdict === 'unknown' ? '' : ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'warning', 16)} ${esc(l.lit.label)}: ${withError(l.lit.value, l.lit.sigma ?? NaN)}${unit}${l.lit.source ? ` (${esc(l.lit.source)})` : ''}. ${esc(c.text)}</p>`;
    })() : '';
    const budget = l.budget ? `<details class="budget"><summary>Unsicherheitsbudget: größter Beitrag ${esc(l.budget[0].name)} (${l.budget[0].share.toFixed(0)} %)</summary>
      <table><thead><tr><th>Größe</th><th>Beitrag</th><th>Anteil</th></tr></thead><tbody>${l.budget.map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${withError(b.contribution, NaN)}${unit}</td><td class="num">${b.share.toFixed(1).replace('.', ',')} %</td></tr>`).join('')}</tbody></table>
      <p class="note">Eine genauere Messung von „${esc(l.budget[0].name)}“ verbessert das Ergebnis am meisten.</p></details>` : '';
    return `<div class="tplres"><b>${esc(l.label)}</b><div class="val">${withError(l.value!, l.sigma ?? NaN)}${unit}</div>${lit}${budget}</div>`;
  }).join('');
}

/* ---- Klassenansicht ---- */

const classUrl = (code: string): string => `${location.origin}${location.pathname}#pmw=${code}`;
const classGroup = (): string => $<HTMLInputElement>('class-group').value.trim() || 'Gruppe';

/** Was geteilt wird: Vorlagen-Ergebnis, sonst Fitparameter, sonst Mittelwerte der Messgrößen; null, wenn es noch nichts gibt. */
function shareContent(): { tpl: string; lines: SharedLine[]; what: string } | null {
  const sigma = (x: number | null | undefined): number | null => (x !== null && x !== undefined && Number.isFinite(x) && x >= 0 ? x : null);
  const t = templateById(tplId);
  const tl = tplLines.filter((l) => l.value !== null && !l.problem);
  if (t && tl.length) return { tpl: t.id, what: `Ergebnis der Vorlage „${t.title}“`, lines: tl.map((l) => ({ label: l.label, unit: l.unit, value: l.value!, sigma: sigma(l.sigma) })) };
  if (lastFit) {
    const m = lastFit.model;
    return { tpl: `frei-${m.id}`, what: `Fitergebnis „${m.name}“`, lines: lastFit.params.map((p) => ({ label: `Fit ${m.name}: ${p.name}`, unit: '', value: p.value, sigma: sigma(p.sigma) })) };
  }
  const lines: SharedLine[] = [];
  for (const ch of session.channels.filter((c) => !c.derived)) {
    const v = session.samples.map((x) => x.values[ch.id]?.v).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (!v.length) continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : null;
    lines.push({ label: `Mittelwert ${ch.name}`, unit: ch.unit, value: mean, sigma: sd === null ? null : sd / Math.sqrt(v.length) });
  }
  return lines.length ? { tpl: 'frei-mittel', what: 'Mittelwerte der Messgrößen', lines: lines.slice(0, 8) } : null;
}
function currentShareCode(): string | null {
  const c = shareContent();
  return c ? encodeShare({ tpl: c.tpl, group: classGroup(), lines: c.lines }) : null;
}
const qrMode = (): 'code' | 'link' => ($<HTMLInputElement>('qrmode-link').checked ? 'link' : 'code');
function showQr(): void {
  const c = currentShareCode(), host = $('class-qr-out');
  if (!c) { host.hidden = true; return; }
  const link = qrMode() === 'link';
  try {
    host.innerHTML = `${qrSvg(encodeQr(link ? classUrl(c) : c), link ? 'QR-Code mit einem Link zum Ergebnis dieser Gruppe' : 'QR-Code mit dem Ergebnis dieser Gruppe')}<p class="note">${link
      ? 'Mit der normalen Handykamera scannen: öffnet die App im Browser des Handys (braucht Internet, die Codes landen im Browser dieses Handys).'
      : 'Die Lehrkraft scannt diesen Code mit „Codes scannen“ in der App. Das geht ohne Internet und ohne Server.'}</p>`;
    host.hidden = false;
  } catch { host.hidden = true; $('class-share-msg').textContent = 'Das Ergebnis ist für einen QR-Code zu lang. Bitte „Code kopieren“ verwenden.'; }
}
$('class-qr').onclick = showQr;
for (const id of ['qrmode-code', 'qrmode-link']) $(id).addEventListener('change', () => { if (!$('class-qr-out').hidden) showQr(); });
function renderClassShare(): void {
  const c = shareContent();
  for (const id of ['class-copy-code', 'class-copy-link', 'class-qr']) $<HTMLButtonElement>(id).disabled = !c;
  if (!c) $('class-qr-out').hidden = true;
  else if (!$('class-qr-out').hidden) showQr();
  $('class-share-msg').textContent = c
    ? `Geteilt wird: ${c.what} (${c.lines.length} Wert${c.lines.length === 1 ? '' : 'e'}). Gruppenname oben eintragen.`
    : 'Es gibt noch nichts zu teilen. Miss etwas und lege in Schritt 4 einen Fit an (oder wähle einen Versuch mit Ergebnis); ohne Fit werden die Mittelwerte der Messgrößen geteilt.';
}

/* ---- Codes scannen ---- */
let scanner: Scanner | null = null;
function addScanned(text: string): void {
  const found = parseShares(text);
  if (!found.length) return;
  const box = $<HTMLTextAreaElement>('class-text');
  const known = new Set(parseShares(box.value).map((r) => `${r.tpl}|${r.group}|${r.lines[0].label}|${r.lines[0].value}`));
  const fresh = found.filter((r) => !known.has(`${r.tpl}|${r.group}|${r.lines[0].label}|${r.lines[0].value}`));
  const st = $('scan-status');
  if (!fresh.length) { st.textContent = `„${found[0].group}“ ist schon erfasst. Nächsten Code scannen.`; return; }
  // gleiche Gruppe + gleicher Versuch: der neue Code ersetzt den alten (parseShares behält den letzten)
  box.value = `${box.value}${box.value && !box.value.endsWith('\n') ? '\n' : ''}${fresh.map((r) => encodeShare(r)).join('\n')}\n`;
  renderClassView();
  st.textContent = `Übernommen: ${fresh.map((r) => r.group).join(', ')}. Insgesamt ${parseShares(box.value).length} Gruppe(n). Nächsten Code scannen oder „Fertig“.`;
}
async function openScan(): Promise<void> {
  const dlg = $<HTMLDialogElement>('scandlg'), st = $('scan-status');
  st.textContent = 'Kamera wird gestartet …';
  dlg.showModal();
  try { scanner = await startScanner($<HTMLVideoElement>('scan-video'), addScanned, { forceJs: (window as unknown as { __forceJsQr?: boolean }).__forceJsQr }); st.textContent = 'Bereit: Kamera auf einen QR-Code halten.'; }
  catch (e) { st.textContent = e instanceof Error ? e.message : 'Die Kamera lässt sich nicht öffnen.'; }
}
function closeScan(): void { scanner?.stop(); scanner = null; const d = $<HTMLDialogElement>('scandlg'); if (d.open) d.close(); }
$('class-scan').onclick = () => void openScan();
$('scan-close').onclick = closeScan;
$('scandlg').addEventListener('close', () => { scanner?.stop(); scanner = null; });

async function copyText(text: string, what: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); $('class-share-msg').textContent = `${what} kopiert.`; }
  catch { $<HTMLTextAreaElement>('class-text').value = text; $('class-share-msg').textContent = `Kopieren nicht möglich; der ${what} steht unten im Feld und kann von Hand markiert werden.`; renderClassView(); }
}
$('class-copy-code').onclick = () => { const c = currentShareCode(); if (c) void copyText(c, 'Code'); };
$('class-copy-link').onclick = () => { const c = currentShareCode(); if (c) void copyText(classUrl(c), 'Link'); };
const sig2 = (x: number): string => String(Number(x.toPrecision(2))).replace('.', ',');
function renderClassView(): void {
  const text = $<HTMLTextAreaElement>('class-text').value;
  try { localStorage.setItem('pmw-class', text); } catch { /* ohne Speicher geht es auch */ }
  const rs = parseShares(text);
  const host = $('class-out');
  if (!rs.length) { host.innerHTML = text.trim() ? `<p class="problem">${icon('warning', 16)} Kein gültiger Code gefunden. Ein Code beginnt mit PMW1.</p>` : ''; return; }
  const sums = summarize(rs);
  const rows = rs.map((r) => `<tr><td>${esc(r.group)}</td>${r.lines.map((l) => `<td class="num">${withError(l.value, l.sigma ?? NaN)} ${esc(l.unit)}</td>`).join('')}</tr>`).join('');
  const head = rs[0].lines.map((l) => `<th>${esc(l.label)}</th>`).join('');
  const sumHtml = sums.map((s) => {
    const unit = s.unit ? ` ${esc(s.unit)}` : '';
    const w = s.weighted ? `<br>Gewichteter Mittelwert (nach Unsicherheit): ${withError(s.weighted.value, s.weighted.sigma)}${unit}` : '';
    const o = s.outliers.length ? `<br><span class="problem">${icon('warning', 16)} Auffällig weit vom Rest: ${s.outliers.map(esc).join(', ')}. Messung oder Eingabe prüfen.</span>` : '';
    return `<div class="tplres"><b>${esc(s.label)}</b><div class="val">${withError(s.mean, s.sem ?? NaN)}${unit}</div><p class="note">Mittelwert von ${s.n} Gruppe${s.n === 1 ? '' : 'n'}${s.sd !== null ? `, Standardabweichung ${sig2(s.sd)}${unit}, Fehler des Mittelwerts ${sig2(s.sem!)}` : ''}.${w}${o}</p></div>`;
  }).join('');
  host.innerHTML = `<div class="tablewrap"><table><thead><tr><th>Gruppe</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>${sumHtml}<p class="note">Nur Gruppen mit gleicher Vorlage vergleichen. Systematische Fehler, die alle gleich machen, mittelt man nicht weg.</p>`;
}
$('class-text').addEventListener('input', renderClassView);
$('class-group').addEventListener('input', () => { renderClassShare(); });
(() => {
  let saved = '';
  try { saved = localStorage.getItem('pmw-class') ?? ''; } catch { /* egal */ }
  const m = /[#&]pmw=(PMW1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (m && !saved.includes(m[1])) saved = `${saved}${saved && !saved.endsWith('\n') ? '\n' : ''}${m[1]}\n`;
  if (saved) $<HTMLTextAreaElement>('class-text').value = saved;
  if (m) { history.replaceState(null, '', location.pathname + location.search); $<HTMLDetailsElement>('classbox').open = true; setTimeout(() => goStep(4), 0); }
  renderClassView();
})();

/** Ergebnisblatt für die XLSX-Exporte. */
function tplSheet(): { name: string; table: { header: string[]; rows: (number | string | null)[][] } } | null {
  const t = templateById(tplId);
  const lines = tplLines.filter((l) => l.value !== null);
  if (!t || !lines.length) return null;
  return {
    name: 'Ergebnis',
    table: {
      header: ['Größe', 'Wert', 'Unsicherheit', 'Einheit', 'Literaturwert', 'Beurteilung'],
      rows: lines.map((l) => [l.label, l.value, l.sigma, l.unit, l.lit?.value ?? null, l.lit?.comparison.text ?? '']),
    },
  };
}

/* ---- Bereichswechsel in den Messdaten ---- */

function renderJumpNotes(): void {
  const host = $('jump-notes');
  const parts: string[] = [];
  for (const ch of session.channels.filter((c) => !c.derived)) {
    const all = detectScaleJumps(session.samples.map((s) => s.values[ch.id]?.v ?? null));
    all.forEach((j, i) => {
      if (ignoredJumps.has(`${ch.id}:${j.index}:${j.factor}`)) return;
      const end = all[i + 1]?.index ?? session.samples.length; // das neue Niveau gilt bis zum nächsten Wechsel
      parts.push(`<div class="jump">${icon('warning', 18)}<p><b>${esc(ch.name)}:</b> Sprung ${factorLabel(j.factor)} bei Messpunkt ${j.index + 1} (t = ${de(session.samples[j.index].t, 1)} s). Messbereich oder Dezimalpunkt am Gerät geändert?</p>
        <button type="button" data-jump-fix="${ch.id}:${j.index}:${end}:${j.factor}">Werte ab hier ${factorLabel(1 / j.factor)}</button>
        <button type="button" class="ghost" data-jump-ignore="${ch.id}:${j.index}:${j.factor}">Kein Fehler</button></div>`);
    });
  }
  if (lastRescale) parts.push(`<div class="jump">${icon('info', 18)}<p>Korrektur angewendet (${factorLabel(lastRescale.factor)}).</p><button type="button" class="ghost" data-jump-undo="1">${icon('undo', 16)}Zurücknehmen</button></div>`);
  host.innerHTML = parts.join('');
}
$('jump-notes').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const fix = t.closest<HTMLElement>('[data-jump-fix]'), ign = t.closest<HTMLElement>('[data-jump-ignore]'), undoBtn = t.closest<HTMLElement>('[data-jump-undo]');
  if (fix) {
    const [id, from, to, factor] = fix.dataset.jumpFix!.split(':');
    const f = 1 / Number(factor);
    session.rescale(id, Number(from), Number(to), f);
    lastRescale = { id, from: Number(from), to: Number(to), factor: f };
  } else if (ign) ignoredJumps.add(ign.dataset.jumpIgnore!);
  else if (undoBtn && lastRescale) {
    session.rescale(lastRescale.id, lastRescale.from, lastRescale.to, 1 / lastRescale.factor);
    lastRescale = null;
  } else return;
  renderResults(); scheduleSave();
});

/* ---- Vorhersage ---- */

const predCanvas = $<HTMLCanvasElement>('pred-canvas');
let predDrawing: { raw: { x: number; y: number }[] } | null = null;

function predAxisOptions(): void {
  const px = $<HTMLSelectElement>('pred-x'), py = $<HTMLSelectElement>('pred-y');
  const keepX = px.value, keepY = py.value;
  const devs = chans.filter((c) => c.cal || session.channels.some((s) => s.id === c.id));
  const opts = devs.map((c) => `<option value="${c.id}">${esc(c.name)}${c.unit ? ` / ${esc(c.unit)}` : ''}</option>`).join('');
  px.innerHTML = `<option value="${TIME_KEY}">Zeit / s</option>${opts}`;
  py.innerHTML = opts || '<option value="">– kein Gerät –</option>';
  if (prediction && !keepX) { px.value = prediction.xKey; py.value = prediction.yId; }
  else {
    if ([...px.options].some((o) => o.value === keepX)) px.value = keepX;
    if ([...py.options].some((o) => o.value === keepY)) py.value = keepY;
  }
}

const readRange = (): typeof predRange | null => {
  const g = (id: string): number => Number($<HTMLInputElement>(id).value.trim().replace(',', '.'));
  const r = { xmin: g('pred-xmin'), xmax: g('pred-xmax'), ymin: g('pred-ymin'), ymax: g('pred-ymax') };
  return Object.values(r).every(Number.isFinite) && r.xmax > r.xmin && r.ymax > r.ymin ? r : null;
};

/** Zeichenfläche: Achsen mit Teilstrichen, gezeichnete Kurve. Koordinaten liegen im Rahmen links/unten für die Achsenzahlen. */
const PRED_PAD = { l: 52, r: 12, t: 12, b: 34 };
function drawPredCanvas(): void {
  const ctx = predCanvas.getContext('2d')!;
  const W = predCanvas.width, H = predCanvas.height, p = PRED_PAD;
  const ink = cssVar('--ink'), grid = cssVar('--line');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '13px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.fillStyle = ink; ctx.strokeStyle = grid; ctx.lineWidth = 1;
  const r = readRange();
  if (!r) { ctx.fillText('Achsenbereich prüfen: „bis“ muss größer sein als „von“.', p.l, H / 2); return; }
  const X = (v: number): number => p.l + ((v - r.xmin) / (r.xmax - r.xmin)) * (W - p.l - p.r);
  const Y = (v: number): number => H - p.b - ((v - r.ymin) / (r.ymax - r.ymin)) * (H - p.t - p.b);
  for (let i = 0; i <= 5; i++) {
    const xv = r.xmin + ((r.xmax - r.xmin) * i) / 5, yv = r.ymin + ((r.ymax - r.ymin) * i) / 5;
    ctx.beginPath(); ctx.moveTo(X(xv), p.t); ctx.lineTo(X(xv), H - p.b); ctx.moveTo(p.l, Y(yv)); ctx.lineTo(W - p.r, Y(yv)); ctx.stroke();
    ctx.fillText(String(Number(xv.toPrecision(3))).replace('.', ','), X(xv) - 10, H - p.b + 18);
    ctx.fillText(String(Number(yv.toPrecision(3))).replace('.', ','), 4, Y(yv) + 4);
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.strokeRect(p.l, p.t, W - p.l - p.r, H - p.t - p.b);
  const pts = predDrawing ? predDrawing.raw : prediction?.points ?? [];
  if (pts.length > 1) {
    ctx.strokeStyle = chanColor(0); ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y))));
    ctx.stroke(); ctx.setLineDash([]);
  }
}
/** Pixel der Zeichenfläche → Datenwerte. */
function predPoint(e: PointerEvent): { x: number; y: number } | null {
  const r = readRange();
  if (!r) return null;
  const b = predCanvas.getBoundingClientRect();
  const px = ((e.clientX - b.left) / b.width) * predCanvas.width, py = ((e.clientY - b.top) / b.height) * predCanvas.height;
  const p = PRED_PAD;
  const x = r.xmin + ((px - p.l) / (predCanvas.width - p.l - p.r)) * (r.xmax - r.xmin);
  const y = r.ymin + ((predCanvas.height - p.b - py) / (predCanvas.height - p.t - p.b)) * (r.ymax - r.ymin);
  return { x: Math.min(r.xmax, Math.max(r.xmin, x)), y: Math.min(r.ymax, Math.max(r.ymin, y)) };
}
predCanvas.addEventListener('pointerdown', (e) => {
  const q = predPoint(e);
  if (!q) return;
  predCanvas.setPointerCapture(e.pointerId);
  predDrawing = { raw: [q] };
  $('pred-msg').textContent = '';
  drawPredCanvas();
});
predCanvas.addEventListener('pointermove', (e) => {
  if (!predDrawing) return;
  const q = predPoint(e);
  if (q) predDrawing.raw.push(q);
  drawPredCanvas();
});
predCanvas.addEventListener('pointerup', () => {
  if (!predDrawing) return;
  const r = readRange()!;
  const path = cleanPath(predDrawing.raw, (r.xmax - r.xmin) / 200);
  predDrawing = null;
  if (!$<HTMLSelectElement>('pred-y').value) {
    $('pred-msg').textContent = 'Lege zuerst in Schritt 2 ein Messgerät an. Dann kannst du dafür eine Vorhersage zeichnen.';
  } else if (path.length < 2 || path[path.length - 1].x - path[0].x < (r.xmax - r.xmin) * 0.05) {
    $('pred-msg').textContent = 'Bitte eine Kurve über einen größeren x-Bereich ziehen.';
  } else {
    prediction = { xKey: $<HTMLSelectElement>('pred-x').value || TIME_KEY, yId: $<HTMLSelectElement>('pred-y').value, points: path };
    Object.assign(predRange, r);
    scheduleSave();
  }
  drawPredCanvas(); renderPredState(); renderResults();
});
for (const id of ['pred-xmin', 'pred-xmax', 'pred-ymin', 'pred-ymax']) {
  $<HTMLInputElement>(id).addEventListener('input', () => { const r = readRange(); if (r) Object.assign(predRange, r); drawPredCanvas(); });
}
$('pred-clear').onclick = () => { prediction = null; $('pred-msg').textContent = ''; drawPredCanvas(); renderPredState(); renderResults(); scheduleSave(); };
$('pred-box').addEventListener('toggle', () => { predAxisOptions(); drawPredCanvas(); });
function renderPredState(): void {
  $('pred-state').textContent = prediction ? `Vorhersage gespeichert (${prediction.points.length} Punkte).` : 'Noch keine Vorhersage.';
}
function syncPredInputs(): void {
  $<HTMLInputElement>('pred-xmin').value = String(predRange.xmin).replace('.', ',');
  $<HTMLInputElement>('pred-xmax').value = String(predRange.xmax).replace('.', ',');
  $<HTMLInputElement>('pred-ymin').value = String(predRange.ymin).replace('.', ',');
  $<HTMLInputElement>('pred-ymax').value = String(predRange.ymax).replace('.', ',');
}

/** Legt die Vorhersage als gepunktete Linie in den Graphen, wenn Achsen passen, und gibt die Rückmeldung aus. */
function renderPredictionOnChart(x: string, yId: string | undefined, series: ChartSeries[], light: boolean): void {
  const fb = $('pred-feedback');
  fb.hidden = true;
  if (!prediction || !yId || prediction.xKey !== x || prediction.yId !== yId) return;
  series.push({ label: 'Vorhersage', color: light ? LIGHT.ink : cssVar('--ink'), slot: 0, axis: 'y', faded: false, pred: true, points: prediction.points.map((p) => ({ x: p.x, y: p.y, c: 1 })) });
  const data = session.series(x, yId);
  if (data.length) {
    const f = comparePrediction(prediction.points, data);
    fb.hidden = false;
    fb.innerHTML = `${icon('info', 16)} ${esc(f.text)}`;
  }
}

/* ---- Protokoll ---- */

/** Sammelt alles, was im Protokoll stehen soll. Graphen werden in hellen Farben erzeugt (Papier). */
function protocolData(): ProtocolData {
  renderResults(true);
  const graphImage = session.samples.length || session.runs.length ? chart.toDataUrl() : undefined;
  const seriesImage = varChart && variation.rows.length >= 2 ? varChart.toDataUrl() : undefined;
  renderResults(false);
  const t = templateById(tplId);
  let setupImage: string | undefined;
  try { if (source) setupImage = view.toDataURL('image/jpeg', 0.8); } catch { /* Bild nicht verfügbar */ }
  const tbl = session.samples.length ? session.table() : null;
  const devices = session.channels.filter((c) => !c.derived).map((c) => ({ name: c.name, unit: c.unit, uncertainty: describeUncertainty(c.uncertainty, c.unit) }));
  const fit = t?.mode === 'series' ? lastVarFit : lastFit;
  const results = tplLines.filter((l) => l.value !== null).map((l) => ({
    label: l.label,
    value: `${withError(l.value!, l.sigma ?? NaN)}${l.unit ? ` ${l.unit}` : ''}`,
    lit: l.lit ? `${l.lit.label}: ${withError(l.lit.value, l.lit.sigma ?? NaN)}${l.unit ? ` ${l.unit}` : ''}. ${l.lit.comparison.text}` : undefined,
    budget: l.budget ? `${l.budget.map((b) => `${b.name} ${b.share.toFixed(0)} %`).join(', ')}` : undefined,
  }));
  const notes: string[] = [];
  if (lastRescale) notes.push(`Werte nach einem Bereichswechsel am Gerät wurden umgerechnet (${factorLabel(lastRescale.factor)}).`);
  if (prediction) notes.push('Zu dieser Messung gab es vorab eine Vorhersage.');
  return {
    title: $<HTMLInputElement>('exp-title').value.trim() || t?.title || '',
    names: $<HTMLInputElement>('exp-name').value.trim(),
    date: new Date().toLocaleDateString('de-DE'),
    setupImage, graphImage, seriesImage,
    template: t ? { title: t.title, topic: t.topic, steps: t.steps } : undefined,
    devices,
    table: tbl ? { header: tbl.header, rows: tbl.rows, total: tbl.rows.length } : undefined,
    fit: fit ? { model: fit.model.name, formula: fit.model.formula, params: fit.params.map((p) => `${p.name} = ${withError(p.value, p.sigma)}`), stats: `R² = ${fmtR2(fit.r2)} · n = ${fit.n}${fit.chi2red !== null ? ` · χ²red = ${fit.chi2red.toFixed(2).replace('.', ',')}` : ''}`, warnings: fit.warnings } : undefined,
    results, notes,
  };
}
$('dl-protocol').onclick = () => {
  download(new Blob([buildProtocolHtml(protocolData())], { type: 'text/html;charset=utf-8' }), `protokoll-${stamp()}.html`);
};
$('print-protocol').onclick = () => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = buildProtocolHtml(protocolData());
  frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60000); };
  document.body.appendChild(frame);
};

/* ---- Markerverfolgung ---- */

function renderTrackStatus(): void {
  const c = trackSt.cfg;
  const lines: string[] = [];
  if (!c) lines.push('Noch kein Marker gewählt. Eine Videodatei auf den ersten Moment der Bewegung stellen, dann „Marker wählen“.');
  else {
    lines.push(`Marker gewählt (${c.template.w} × ${c.template.h} Bildpunkte${source?.duration != null ? `, ab ${de(c.t0, 1)} s` : ''}).`);
    lines.push(c.scale ? `Maßstab: 1 Bildpunkt = ${de(c.scale * 1000, 2)} mm. Ergebnis in Metern.` : 'Ohne Maßstab: Ergebnis in Bildpunkten. „Maßstab setzen“ rechnet in Meter um.');
  }
  $('trk-status').textContent = lines.join(' ');
  $<HTMLButtonElement>('trk-scale').disabled = !c;
  $<HTMLButtonElement>('trk-remove').disabled = !c;
  $<HTMLInputElement>('trk-name').value = trackSt.name;
}

$('trk-marker').onclick = () => {
  if (!source) return showError('Bitte zuerst eine Quelle wählen.');
  trackMode = 'marker';
  calib = null;
  setHint('Ziehe ein Rechteck eng um den Marker (z. B. eine dunkle Kugel oder einen farbigen Klebepunkt). Bei einer Videodatei vorher auf den Anfang der Bewegung stellen.');
};
$('trk-scale').onclick = () => {
  trackMode = 'scale1';
  trackSt.scaleP = [];
  setHint('Maßstab: Klicke auf den ersten von zwei Punkten, deren Abstand du kennst (z. B. die Enden eines Meterstabs).');
};
$('trk-remove').onclick = () => {
  trackSt = freshTrack(); trackerCache = null; trackMode = null;
  session.removeChannel('trk-x'); session.removeChannel('trk-y');
  refreshSelects(); renderTrackStatus(); updateButtons(); renderResults(); scheduleSave();
};
$('trk-name').addEventListener('input', (e) => {
  trackSt.name = (e.target as HTMLInputElement).value || 'Marker';
  syncSessionChannelsIfAny();
  scheduleSave();
});
function syncSessionChannelsIfAny(): void {
  if (session.channels.some((c) => c.id === 'trk-x')) { syncSessionChannels(); renderResults(); }
}

function onTrackPointerDown(e: PointerEvent, p: Point): void {
  if (trackMode === 'marker' || trackMode === 'gate' || trackMode === 'anchor') {
    drawKind = trackMode;
    view.setPointerCapture(e.pointerId);
    trkDraw = { start: p, cur: p };
  } else if (trackMode === 'scale1') {
    trackSt.scaleP = [p];
    trackMode = 'scale2';
    setHint('Jetzt der zweite Punkt.');
  } else if (trackMode === 'scale2') {
    trackSt.scaleP.push(p);
    const [a, b] = trackSt.scaleP;
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    trackMode = null;
    if (px < 10) { trackSt.scaleP = []; return setHint('Die Punkte liegen zu nah beieinander. „Maßstab setzen“ und weiter auseinander klicken.'); }
    void askValue('Maßstab', 'Welchen Abstand haben die beiden Punkte in Wirklichkeit?', 'm', '1').then((m) => {
      if (m === null || m <= 0 || !trackSt.cfg) { trackSt.scaleP = []; return setHint('Kein Maßstab übernommen.'); }
      trackSt.meters = m;
      trackSt.cfg = { ...trackSt.cfg, scale: m / px };
      trackerCache = null;
      syncSessionChannelsIfAny();
      setHint(`Maßstab gesetzt: ${de(m, 3)} m = ${de(px, 0)} Bildpunkte.`);
      renderTrackStatus(); renderResults(); scheduleSave();
    });
  }
}

function finishMarker(r: Rect): void {
  if (!source) return;
  let frame: Frame;
  try { frame = grabStable(); } catch { return showError('Noch kein Bild verfügbar.'); }
  const t = makeTemplate(frame, r);
  trackMode = null;
  if ('error' in t) return showError(t.error);
  showError(null);
  trackSt.cfg = { template: t.template, t0: source.duration !== null ? source.time() : 0, scale: trackSt.cfg?.scale ?? null };
  trackerCache = null;
  setHint('Marker gewählt. Optional „Maßstab setzen“; dann in Schritt 3 aufnehmen oder das Video auswerten.');
  renderTrackStatus(); updateButtons(); scheduleSave();
}

/** Läuft die Quelle mit eigener Uhr (Kamera, Demo)? Dann lässt sich der Marker in jedem Anzeigebild verfolgen. */
function isLiveClock(): boolean {
  return !!source && (source.kind === 'camera' || (source.kind === 'demo' && (source as DemoSource).isLive()));
}
function updateTrackPreview(frame: Frame): void {
  const cfg = trackSt.cfg;
  if (!cfg || !source || !isLiveClock()) { previewRes = null; return; }
  if (previewCache?.cfg !== cfg) previewCache = { cfg, tracker: new Tracker(cfg) };
  previewRes = previewCache.tracker.update(frame, source.time());
}

/* ---- Bildanker ---- */

/** Stabilisiert das Bild für Anzeige, Vorschau und Ablesung (leeres Ergebnis ohne Anker: dasselbe Bild). */
function stabilizeFrame(frame: Frame): Frame {
  if (!anchorCfg || !source) return frame;
  if (loopStab?.cfg !== anchorCfg) loopStab = { cfg: anchorCfg, stab: new Stabilizer(anchorCfg) };
  return loopStab.stab.apply(frame, source.time());
}
const grabStable = (): Frame => stabilizeFrame(source!.grab());
/** Eigener Stabilisierer für Aufnahme und Auswertung; der Sampler setzt ihn beim Start zurück. */
function recStabilizer(): Stabilizer | undefined {
  if (!anchorCfg) return undefined;
  if (recStab?.cfg !== anchorCfg) recStab = { cfg: anchorCfg, stab: new Stabilizer(anchorCfg) };
  return recStab.stab;
}

function renderAnchorStatus(): void {
  $('anchor-remove').toggleAttribute('disabled', !anchorCfg);
  $('demo-shake-row').hidden = source?.kind !== 'demo';
  const el = $('anchor-status');
  if (!anchorCfg) { el.textContent = 'Noch kein Anker gewählt.'; el.classList.remove('problem'); return; }
  const sh = loopStab?.stab;
  if (!sh) { el.textContent = 'Anker gewählt.'; return; }
  const { dx, dy } = sh.shift;
  el.textContent = sh.lost
    ? 'Anker nicht gefunden: die zuletzt bekannte Korrektur bleibt. Ist er verdeckt oder zu weit gewandert?'
    : `Anker gefunden. Verschiebung gegenüber der Kalibrierung: x ${de(dx, 1)}, y ${de(dy, 1)} Bildpunkte (wird zurückgeschoben).`;
  el.classList.toggle('problem', sh.lost);
}
$('anchor-set').onclick = () => {
  if (!source) return showError('Bitte zuerst eine Quelle wählen.');
  trackMode = 'anchor';
  calib = null;
  setHint('Ziehe ein Rechteck um einen ruhenden, kontrastreichen Punkt (Aufkleber, Gerätekante). Direkt nach der Kalibrierung, bevor die Kamera bewegt wird.');
};
$('anchor-remove').onclick = () => { anchorCfg = null; loopStab = null; recStab = null; renderAnchorStatus(); scheduleSave(); };
$('demo-shake').addEventListener('change', (e) => { if (source instanceof DemoSource) source.shake = (e.target as HTMLInputElement).checked; });

function finishAnchor(r: Rect): void {
  trackMode = null;
  if (!source) return;
  let raw: Frame;
  try { raw = source.grab(); } catch { return showError('Noch kein Bild verfügbar.'); }
  // Vorlage aus dem unstabilisierten Bild: so sind Anker und Kalibrierung im selben Koordinatensystem
  const t = makeTemplate(raw, r);
  if ('error' in t) return showError(t.error.replace('Der Marker', 'Der Anker'));
  showError(null);
  anchorCfg = { template: t.template, t0: 0, scale: null };
  loopStab = null; recStab = null;
  setHint('Anker gewählt. Verrutscht die Kamera jetzt leicht, bleibt die Kalibrierung gültig.');
  renderAnchorStatus(); scheduleSave();
}

function drawAnchorOverlay(scale: number): void {
  if (!anchorCfg) return;
  const t = anchorCfg.template, lost = loopStab?.stab.lost;
  const col = lost ? '#ff7a7a' : '#8fd19e';
  strokeHalo(() => { vctx.beginPath(); vctx.rect(t.x, t.y, t.w, t.h); vctx.setLineDash([4 * scale, 4 * scale]); }, col, 2);
  vctx.setLineDash([]);
  vctx.fillStyle = 'rgb(0 0 0 / .72)';
  const label = lost ? 'Anker verloren' : 'Anker';
  vctx.fillRect(t.x, t.y + t.h + 2 * scale, vctx.measureText(label).width + 16 * scale, 20 * scale);
  vctx.fillStyle = '#fff'; vctx.fillText(label, t.x + 8 * scale, t.y + t.h + 17 * scale);
}

function drawTrackOverlay(scale: number): void {
  if (source?.kind === 'audio') { drawAudioLabels(scale); return; }
  drawAnchorOverlay(scale);
  const c = trackSt.cfg;
  const col = '#F6B48F';
  if (gateSt.rect) {
    const g = gateSt.rect;
    strokeHalo(() => { vctx.beginPath(); vctx.rect(g.x, g.y, g.w, g.h); }, col, 2);
    vctx.fillStyle = 'rgb(0 0 0 / .72)';
    vctx.fillRect(g.x, g.y - 22 * scale, vctx.measureText(gateSt.name).width + 16 * scale, 20 * scale);
    vctx.fillStyle = '#fff'; vctx.fillText(gateSt.name, g.x + 8 * scale, g.y - 7 * scale);
  }
  if (trkDraw) strokeHalo(() => { vctx.beginPath(); vctx.rect(Math.min(trkDraw!.start.x, trkDraw!.cur.x), Math.min(trkDraw!.start.y, trkDraw!.cur.y), Math.abs(trkDraw!.cur.x - trkDraw!.start.x), Math.abs(trkDraw!.cur.y - trkDraw!.start.y)); }, col, 2);
  if (!c) return;
  const recording = !!stopLive || !!abort;
  // Live (Kamera, Demo): Position aus der Vorschau in jedem Bild; bei Videodateien während der Auswertung aus der Aufnahme
  const pos: Point | null = previewRes?.px != null ? { x: previewRes.px, y: previewRes.py! } : recording && !isLiveClock() ? trackerCache?.tracker.position ?? null : null;
  const t = c.template;
  if (!pos && !recording) {
    strokeHalo(() => { vctx.beginPath(); vctx.rect(t.x, t.y, t.w, t.h); vctx.setLineDash([5 * scale, 4 * scale]); }, col, 2);
    vctx.setLineDash([]);
  }
  if (pos) strokeHalo(() => { vctx.beginPath(); vctx.moveTo(pos.x - 12 * scale, pos.y); vctx.lineTo(pos.x + 12 * scale, pos.y); vctx.moveTo(pos.x, pos.y - 12 * scale); vctx.lineTo(pos.x, pos.y + 12 * scale); vctx.arc(pos.x, pos.y, t.w / 2, 0, 7); }, col, 2);
  const sp = trackSt.scaleP;
  for (const q of sp) strokeHalo(() => { vctx.beginPath(); vctx.arc(q.x, q.y, 5 * scale, 0, 7); }, col, 2);
  if (sp.length === 2) strokeHalo(() => { vctx.beginPath(); vctx.moveTo(sp[0].x, sp[0].y); vctx.lineTo(sp[1].x, sp[1].y); }, col, 2);
  vctx.fillStyle = 'rgb(0 0 0 / .72)';
  const unit = c.scale ? ' m' : ' px';
  const live = previewRes && previewRes.x !== null ? `  x ${de(previewRes.x, c.scale ? 3 : 0)}${unit}  y ${de(previewRes.y!, c.scale ? 3 : 0)}${unit}` : previewRes ? '  (verloren)' : '';
  const label = `${trackSt.name}${live}`;
  const lx = pos ? pos.x - t.w / 2 : t.x, ly = pos ? pos.y - t.h / 2 : t.y; // Beschriftung folgt dem Marker
  vctx.fillRect(lx, ly - 22 * scale, vctx.measureText(label).width + 16 * scale, 20 * scale);
  vctx.fillStyle = '#fff'; vctx.fillText(label, lx + 8 * scale, ly - 7 * scale);
}

/* ---- Lichtschranke ---- */

function renderGateStatus(): void {
  const g = gateSt.rect;
  $('gate-status').textContent = g
    ? `Zone gewählt (${Math.round(g.w)} × ${Math.round(g.h)} Bildpunkte). Zone schmal wählen und genau dort, wo der Körper durchläuft. In Schritt 3 mit hoher Messrate aufnehmen.`
    : 'Noch keine Zone gewählt. Ziehe ein kleines Rechteck dorthin, wo der Körper durchläuft.';
  $<HTMLButtonElement>('gate-remove').disabled = !g;
  $<HTMLInputElement>('gate-name').value = gateSt.name;
  $<HTMLInputElement>('gate-width').value = gateSt.width;
  $<HTMLInputElement>('gate-unit').value = gateSt.unit;
  $<HTMLInputElement>('gate-factor').value = gateSt.factor;
}
$('gate-zone').onclick = () => {
  if (!source) return showError('Bitte zuerst eine Quelle wählen.');
  trackMode = 'gate';
  calib = null;
  setHint('Ziehe ein kleines Rechteck dorthin, wo der Körper durch das Bild läuft (die „Lichtschranke“).');
};
$('gate-remove').onclick = () => {
  gateSt = freshGate();
  session.removeChannel('gate');
  refreshSelects(); renderGateStatus(); updateButtons(); renderResults(); scheduleSave();
};
$('gate-name').addEventListener('input', (e) => {
  gateSt.name = (e.target as HTMLInputElement).value || 'Lichtschranke';
  if (session.channels.some((c) => c.id === 'gate')) { syncSessionChannels(); renderResults(); }
  scheduleSave();
});
for (const [id, key] of [['gate-unit', 'unit'], ['gate-factor', 'factor']] as const) {
  $(id).addEventListener('input', (e) => {
    gateSt[key] = (e.target as HTMLInputElement).value;
    if (session.channels.some((c) => c.id === 'gate')) { syncSessionChannels(); renderResults(); }
    scheduleSave();
  });
}
$('gate-width').addEventListener('input', (e) => { gateSt.width = (e.target as HTMLInputElement).value; renderGate(); scheduleSave(); });

function finishGate(r: Rect): void {
  trackMode = null;
  if (r.w < 3 || r.h < 3) return showError('Die Zone ist zu klein. Ziehe ein größeres Rechteck (mindestens 3 × 3 Bildpunkte).');
  showError(null);
  gateSt.rect = r;
  setHint('Zone gewählt. In Schritt 3 mit hoher Messrate aufnehmen (bei Videos z. B. 30 pro Sekunde).');
  renderGateStatus(); updateButtons(); scheduleSave();
}

const fmtS = (v: number, s: number | null): string => (s !== null && s > 0 ? withError(v, s) : fmtNum(v));

/** Durchgänge aus der aufgenommenen Helligkeit der Zone; Kennzahlen mit Unsicherheit aus Streuung und Bildabstand. */
function renderGate(): void {
  const card = $('gate-card');
  const rows = session.samples.flatMap((s) => (s.values.gate?.v != null ? [{ t: s.t, v: s.values.gate.v as number }] : []));
  gateLast = null;
  card.hidden = !gateSt.rect || rows.length < 3;
  if (card.hidden) return;
  const r = detectGate(rows);
  const res = r.frameDt / Math.sqrt(12); // Zeitauflösung: gleichverteilter Fehler innerhalb eines Bildabstands
  const withRes = (st: ReturnType<typeof gateStats>): number | null => (st ? Math.hypot(st.sem ?? 0, res) : null);
  const iv = gateStats(r.intervals), pe = gateStats(r.periods);
  gateLast = { r, intervals: iv, periods: pe };
  const lines: string[] = [];
  lines.push(`<p><b>${r.blocks.length} Durchgänge</b> erkannt (${r.polarity === 'dark' ? 'dunkler Körper' : 'heller Körper'}), Bildabstand ${fmtNum(r.frameDt * 1000)} ms.</p>`);
  if (iv) lines.push(`<p>Zeit zwischen aufeinanderfolgenden Durchgängen: <span class="big">${fmtS(iv.mean, withRes(iv))} s</span> (n = ${iv.n})</p>`);
  if (pe) lines.push(`<p>Periodendauer (jeder zweite Durchgang, z. B. Pendel mit Schranke in der Mitte): <span class="big">${fmtS(pe.mean, withRes(pe))} s</span> (n = ${pe.n})</p>`);
  const d = Number(gateSt.width.trim().replace(',', '.'));
  if (Number.isFinite(d) && d > 0 && r.blocks.length) {
    const vs = gateStats(r.blocks.filter((b) => b.width > 0).map((b) => d / b.width));
    if (vs) lines.push(`<p>Geschwindigkeit beim Durchgang (Breite ${fmtNum(d)} m / Dauer): <span class="big">${fmtS(vs.mean, vs.sem)} m/s</span></p>`);
  }
  if (r.blocks.length) lines.push(`<details><summary>Alle Durchgänge</summary><table><thead><tr><th>#</th><th>Eintritt / s</th><th>Dauer / s</th></tr></thead><tbody>${r.blocks.slice(0, 40).map((b, i) => `<tr><td>${i + 1}</td><td>${fmtNum(b.tIn)}</td><td>${fmtNum(b.width)}</td></tr>`).join('')}</tbody></table></details>`);
  for (const w of r.warnings) lines.push(`<p class="problem">${icon('warning', 16)} ${esc(w)}</p>`);
  $('gate-body').innerHTML = lines.join('');
  $<HTMLButtonElement>('gate-take-interval').disabled = !iv;
  $<HTMLButtonElement>('gate-take-period').disabled = !pe;
}
function takeGate(kind: 'intervals' | 'periods'): void {
  varMsg('');
  const st = gateLast?.[kind];
  const p = parseNum($<HTMLInputElement>('var-p').value);
  if (!st) return;
  if (!Number.isFinite(p) || $<HTMLInputElement>('var-p').value.trim() === '') return varMsg('Bitte unten in der Parameterreihe zuerst den Wert des Parameters eintippen.');
  const res = gateLast!.r.frameDt / Math.sqrt(12);
  if (!variation.vname) { variation.vname = kind === 'periods' ? 'Periodendauer T' : 'Zeitabstand'; variation.vunit = 's'; }
  variation.rows.push({ p, v: st.mean, s: Math.hypot(st.sem ?? 0, res) });
  $<HTMLInputElement>('var-p').value = '';
  varChanged();
}
$('gate-take-interval').onclick = () => { $<HTMLDetailsElement>('varbox').open = true; takeGate('intervals'); };
$('gate-take-period').onclick = () => { $<HTMLDetailsElement>('varbox').open = true; takeGate('periods'); };

/* ---- Barrierefreiheit: Beschreibung, Hören, Tastatur, Ansagen ---- */

const sonifier = new Sonifier();
const a11y: { points: { x: number; y: number }[]; opts: DescribeOptions; index: number } = {
  points: [], opts: { xName: 'x', xUnit: '', yName: 'y', yUnit: '' }, index: -1,
};
const nameUnit = (id: string): { name: string; unit: string } => {
  if (id === TIME_KEY) return { name: 'Zeit', unit: 's' };
  const c = allChannelDefs().find((d) => d.id === id);
  return { name: c?.name ?? id, unit: c?.unit ?? '' };
};

/** Beschreibt die erste Reihe des Graphen in Worten (für Screenreader und zum Vorlesen). */
function renderGraphDescription(x: string, yId: string | undefined, series: ChartSeries[]): void {
  const main = series.find((s) => !s.fit && !s.pred && !s.faded);
  const box = $('graph-desc');
  if (!main || !yId || main.points.length < 2) { a11y.points = []; a11y.index = -1; box.textContent = 'Noch keine Messwerte im Graphen.'; return; }
  const xn = nameUnit(x), yn = nameUnit(yId);
  a11y.opts = {
    xName: xn.name, xUnit: xn.unit, yName: yn.name, yUnit: yn.unit,
    fit: lastFit ? `Fit ${lastFit.model.name}: ${lastFit.params.map((p) => `${p.name} = ${withError(p.value, p.sigma)}`).join(', ')}.` : undefined,
  };
  a11y.points = main.points.map((p) => ({ x: p.x, y: p.y }));
  a11y.index = Math.min(a11y.index, a11y.points.length - 1);
  box.textContent = describeSeries(a11y.points, a11y.opts).text;
}

chartCanvas.addEventListener('keydown', (e) => {
  const n = a11y.points.length;
  if (!n) return;
  const step = e.shiftKey ? 10 : 1;
  let i = a11y.index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = i < 0 ? 0 : Math.min(n - 1, i + step);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = i < 0 ? n - 1 : Math.max(0, i - step);
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = n - 1;
  else if (e.key === 'Escape') { a11y.index = -1; chart.highlight(null); return; }
  else return;
  e.preventDefault();
  a11y.index = i;
  chart.highlight(i);
  $('graph-live').textContent = announcePoint(i, n, a11y.points[i], a11y.opts);
});

function setListening(on: boolean): void {
  $('graph-stop').hidden = !on;
  $<HTMLButtonElement>('graph-listen').disabled = on;
}
$('graph-listen').onclick = () => {
  if (a11y.points.length < 2) return showError('Es gibt noch keine Messwerte zum Anhören.');
  showError(null);
  const ok = sonifier.play(sonificationSchedule(a11y.points, 6), () => setListening(false));
  if (!ok) return showError('Dein Browser kann keinen Ton ausgeben.');
  setListening(true);
};
$('graph-stop').onclick = () => { sonifier.stop(); if ('speechSynthesis' in window) speechSynthesis.cancel(); setListening(false); };
$('graph-speak').onclick = () => {
  const voice = localGermanVoice();
  if (!voice || a11y.points.length < 2) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance($('graph-desc').textContent ?? '');
  u.lang = 'de-DE'; u.voice = voice;
  u.onend = () => setListening(false);
  setListening(true);
  speechSynthesis.speak(u);
};
/** Vorlesen nur mit einer lokalen deutschen Stimme: Der Text soll das Gerät nicht verlassen. */
function refreshVoice(): void {
  const ok = !!localGermanVoice();
  const b = $<HTMLButtonElement>('graph-speak');
  b.disabled = !ok;
  b.title = ok ? '' : 'Keine lokale deutsche Stimme gefunden. Nutze den Screenreader mit der Beschreibung unten.';
}
if ('speechSynthesis' in window) { refreshVoice(); speechSynthesis.addEventListener('voiceschanged', refreshVoice); }

/** Neue Messwerte als Ansage für Screenreader (höchstens alle 3 s, nur bei geänderter Zahl). */
let lastAnnounce = 0, lastAnnounceText = '';
function announceLive(now: number): void {
  if (!$<HTMLInputElement>('announce').checked || now - lastAnnounce < 3000) return;
  const text = chans.filter((c) => c.cal && c.live?.value != null).map((c) => `${c.name}: ${de(c.live!.value!, 2)} ${c.unit}`.trim()).join('. ');
  lastAnnounce = now;
  if (text && text !== lastAnnounceText) { lastAnnounceText = text; $('live-announce').textContent = text; }
}

/* ---- Mikrofon ---- */

const audioChannelCount = (): number => (source?.kind === 'audio' ? Number($<HTMLInputElement>('mic-freq').checked) + Number($<HTMLInputElement>('mic-level').checked) : 0);

/** Bei Tonquellen: Messgrößen des Mikrofons zeigen, die Bedienung für Kamerabilder ausblenden. */
function applyAudioMode(): void {
  const audio = source?.kind === 'audio';
  $('micbox').hidden = !audio;
  $('audiolive').hidden = !audio;
  for (const id of ['add-analog', 'add-digital']) $(id).hidden = audio;
  for (const id of ['trackbox', 'gatebox']) $(id).hidden = audio;
  if (audio) { chans = []; calib = null; sel = null; renderChannels(); renderLive(); }
  updateButtons();
}
for (const id of ['mic-freq', 'mic-level']) $(id).addEventListener('change', () => { updateButtons(); scheduleSave(); });

/** Beschriftung der Tonanzeige im Bild: Oszilloskop oben, Spektrum unten mit Frequenzmarken. */
function drawAudioLabels(scale: number): void {
  vctx.save();
  vctx.font = `700 ${14 * scale}px "Atkinson Hyperlegible", system-ui, sans-serif`;
  vctx.fillStyle = '#fff';
  vctx.fillText('Oszilloskop (Schwingung über der Zeit)', 10 * scale, 20 * scale);
  vctx.fillText('Spektrum: Stärke über der Frequenz', 10 * scale, 205 * scale);
  vctx.font = `${13 * scale}px "Atkinson Hyperlegible", system-ui, sans-serif`;
  const x = (hz: number): number => (Math.log(hz / 20) / Math.log(5000 / 20)) * (view.width - 1);
  for (const [hz, label] of [[100, '100 Hz'], [1000, '1 kHz'], [5000, '5 kHz']] as const) vctx.fillText(label, Math.min(view.width - 52 * scale, x(hz) + 4 * scale), 346 * scale);
  vctx.restore();
}

/** Große Zahlen für Frequenz und Pegel der Tonquelle. */
function renderAudioLive(): void {
  if (source?.kind !== 'audio') return;
  const a = (source as unknown as AudioReader).read();
  const fb = liveBuf.get('mic-f') ?? [], lb = liveBuf.get('mic-l') ?? [];
  if (a?.freq != null) fb.push(a.freq); else fb.length = 0;
  if (a) lb.push(a.level);
  if (fb.length > 8) fb.shift();
  if (lb.length > 8) lb.shift();
  liveBuf.set('mic-f', fb); liveBuf.set('mic-l', lb);
  const host = $('audiolive');
  const freqTxt = a?.freq != null ? `${a.freq.toFixed(1).replace('.', ',')}<small>Hz</small>` : '–';
  const note = a?.freq != null ? noteName(a.freq) : null;
  const html = `
    <div class="live ch-1"><div class="name"><span>Frequenz</span></div><div class="live-value">${freqTxt}</div>
      <div class="conf ${a?.freq != null ? 'ok' : 'none'}">${icon(a?.freq != null ? 'check' : 'warning', 16)}${esc(a?.freq != null ? `Ton ${note!.name}${note!.cents ? `, ${note!.cents > 0 ? '+' : '−'}${Math.abs(note!.cents)} Cent` : ''}` : 'kein Ton erkannt')}</div></div>
    <div class="live ch-2"><div class="name"><span>Pegel</span></div><div class="live-value">${a ? a.level.toFixed(1).replace('.', ',') : '–'}<small>dB</small></div>
      <div class="conf ok">${icon('check', 16)}relativ zur Vollaussteuerung</div></div>`;
  if (host.dataset.last !== html) { host.dataset.last = html; host.innerHTML = html; }
}

/* ---- Aufgabe der Lehrkraft ---- */

function renderTaskCard(): void {
  const card = $('task-card');
  if (task) setRoute('task');
  card.hidden = !task;
  if (!task) return;
  $('task-title-view').textContent = task.title;
  $('task-text').innerHTML = task.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  $('task-hints').innerHTML = task.hints.map((h) => `<li>${esc(h)}</li>`).join('');
}
$('task-close').onclick = () => { task = null; taskRevealed = false; renderTaskCard(); renderResults(); scheduleSave(); };
$('tpl-results').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#task-reveal')) { taskRevealed = true; renderResults(); scheduleSave(); }
});

$('task-save').onclick = () => {
  const title = $<HTMLInputElement>('task-title').value.trim();
  if (!title) return showError('Bitte der Aufgabe einen Titel geben.');
  showError(null);
  const json = serializeTask({
    title,
    text: $<HTMLTextAreaElement>('task-text-in').value,
    hints: $<HTMLTextAreaElement>('task-hints-in').value.split('\n').map((l) => l.trim()).filter(Boolean),
    ...(tplId ? { templateId: tplId, inputs: tplInputs } : {}),
    hideResults: $<HTMLInputElement>('task-hide').checked || undefined,
    channels: chans.filter((c) => c.cal).map(toSaved),
  });
  download(new Blob([json], { type: 'application/json' }), `aufgabe-${title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || 'aufgabe'}.json`);
};
$<HTMLInputElement>('task-load').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f) return;
  const r = parseTask(await f.text());
  if ('error' in r) return showError(r.error);
  showError(null);
  task = r; taskRevealed = false;
  if (r.channels?.length) addSavedChannels(r.channels as SavedChannel[]);
  if (r.templateId) {
    applyTemplate(templateById(r.templateId)!);
    if (r.inputs) { tplInputs = { ...r.inputs }; renderTemplateCard(); }
  }
  renderTaskCard(); renderResults(); scheduleSave();
  setHint(`Aufgabe „${r.title}“ geladen. Die Aufgabenstellung steht oben. Kalibrierte Geräte gelten nur bei gleichem Kamerabild.`);
};

function renderRuns(): void {
  const host = $('runs');
  if (!session.runs.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<h3>Gesicherte Reihen</h3>${session.runs.map((r, i) => `
    <div class="run ch-${(i % 4) + 1}"><span>${symbol(i + 1, 12)} <b>${esc(r.name)}</b> · ${r.samples.length} Messpunkte</span>
    <button type="button" class="ghost" data-del="${i}" aria-label="${esc(r.name)} löschen">${icon('trash', 18)}Löschen</button></div>`).join('')}`;
}
$('runs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
  if (!b) return;
  session.runs.splice(Number(b.dataset.del), 1);
  renderResults(); scheduleSave();
});

function renderTable(): void {
  const host = $('table');
  if (!session.samples.length) { host.innerHTML = '<p class="note">Noch keine Messwerte.</p>'; return; }
  const total = session.samples.length;
  const from = Math.max(0, total - 100);
  const t = session.table();
  let html = `<table><thead><tr><th>#</th><th>${esc(t.header[0])}</th>${session.channels.map((c, k) => `<th class="ch-${slotOf(c.id) + 1}">${symbol(slotOf(c.id), 12)}${esc(t.header[k + 1])}</th>`).join('')}</tr></thead><tbody>`;
  for (let i = from; i < total; i++) {
    const s = session.samples[i];
    html += `<tr><td>${i + 1}</td><td>${de(s.t, 2)}</td>${session.channels.map((c) => {
      const cell = s.values[c.id];
      return `<td class="${cell && cell.c < 0.4 ? 'low' : ''}"><input data-i="${i}" data-c="${c.id}" value="${cell?.v === null || cell?.v === undefined ? '' : de(cell.v, 4)}" aria-label="${esc(c.name)} bei Messpunkt ${i + 1}" /></td>`;
    }).join('')}</tr>`;
  }
  host.innerHTML = html + '</tbody></table>' + (from > 0 ? `<p class="note">Nur die letzten 100 von ${total} Zeilen werden angezeigt; der Export enthält alle.</p>` : '');
}
$('table').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.i === undefined) return;
  const raw = el.value.trim().replace(/\./g, '').replace(',', '.');
  const v = raw === '' ? null : Number(raw);
  session.setValue(Number(el.dataset.i), el.dataset.c!, v !== null && Number.isFinite(v) ? v : null);
  renderResults(); scheduleSave();
});

/* ---- Export ---- */

$('dl-csv').onclick = () => {
  const table = session.samples.length ? session.table() : (() => { const r = session.runs[session.runs.length - 1]; return tableOf(r.channels, r.samples, session.smoothing); })();
  download(new Blob([toCsv(table, { german: $<HTMLInputElement>('german').checked })], { type: 'text/csv;charset=utf-8' }), `messwerte-${stamp()}.csv`);
};
$('dl-xlsx').onclick = () => {
  const sheets: { name: string; table: { header: string[]; rows: (number | string | null)[][] } }[] = [
    ...(session.samples.length ? [{ name: 'Messwerte', table: session.table() }] : []),
    ...session.runs.map((r) => ({ name: r.name, table: tableOf(r.channels, r.samples, session.smoothing) })),
  ];
  if (lastFit) {
    const f = lastFit;
    sheets.push({
      name: 'Fit',
      table: {
        header: ['Größe', 'Wert', 'Unsicherheit'],
        rows: [
          ['Modell', f.model.name, null], ['Formel', f.model.formula, null],
          ['Datenreihe (y)', label(ysel.value), null], ['x-Achse', label(xsel.value || TIME_KEY), null],
          ['Fitbereich von', f.range[0], null], ['Fitbereich bis', f.range[1], null],
          ['Punkte n', f.n, null], ['R²', f.r2, null], ['χ² je Freiheitsgrad', f.chi2red, null],
          ...f.params.map((p) => [p.name, p.value, Number.isFinite(p.sigma) ? p.sigma : null]),
          ['Messunsicherheit der Reihe', describeUncertainty(session.channels.find((c) => c.id === ysel.value)?.uncertainty, session.channels.find((c) => c.id === ysel.value)?.unit ?? ''), null],
        ],
      },
    });
  }
  const res = tplSheet();
  if (res) sheets.push(res);
  download(new Blob([toXlsx(sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `messwerte-${stamp()}.xlsx`);
};
$('dl-png').onclick = async () => {
  renderResults(true); // für Papier/Heft immer helle Farben
  const blob = await chart.toPngBlob({
    title: $<HTMLInputElement>('exp-title').value.trim(),
    name: $<HTMLInputElement>('exp-name').value.trim(),
    date: new Date().toLocaleDateString('de-DE'),
    lines: lastFit ? fitLines(lastFit) : [],
  });
  renderResults(false);
  download(blob, `graph-${stamp()}.png`);
};

/* ============================== Speichern ============================== */

let saveTimer = 0;
let saveWarned = false;
function saveNow(): void {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const state: SavedState = {
    version: 1, channels: chans.map(toSaved), nextId, hz: Number($<HTMLSelectElement>('hz').value), theme: themeSel.value,
    smoothing: session.smoothing, variation, template: { id: tplId, inputs: tplInputs }, track: trackSt, gate: gateSt, anchor: anchorCfg, task: task ? { task, revealed: taskRevealed } : null, prediction: prediction ? { ...prediction, range: predRange } : null, session: { channels: session.channels, samples: session.samples, runs: session.runs },
  };
  try { localStorage.setItem(STORAGE_KEY, serialize(state)); } catch {
    if (!saveWarned) { saveWarned = true; showError('Automatisches Speichern ist nicht möglich (Speicher voll oder gesperrt). Exportiere deine Daten rechtzeitig.'); }
  }
}
/** Gedrosselt statt entprellt: auch bei minutenlanger Aufnahme wird mindestens jede Sekunde gesichert. */
function scheduleSave(): void {
  if (!saveTimer) saveTimer = window.setTimeout(saveNow, 1000);
}
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

function restore(): void {
  let s: SavedState | null = null;
  try { s = parseState(localStorage.getItem(STORAGE_KEY)); } catch { /* gesperrt */ }
  if (!s) return;
  themeSel.value = s.theme ?? 'auto';
  $<HTMLSelectElement>('hz').value = String(s.hz ?? 2);
  nextId = s.nextId ?? 1;
  chans = s.channels.slice(0, MAX_CHANNELS).map((c, i) => fromSaved(c, i));
  chans.forEach((c, i) => { c.slot = i; rebuildCal(c); });
  session.channels = s.session.channels ?? [];
  session.samples = s.session.samples ?? [];
  session.runs = s.session.runs ?? [];
  session.smoothing = s.smoothing ?? 0;
  const tp = s.template as { id?: string; inputs?: typeof tplInputs } | undefined;
  if (tp?.id && templateById(tp.id)) { tplId = tp.id; tplInputs = tp.inputs ?? {}; }
  const tk = s.track as TrackState | undefined;
  if (tk?.cfg?.template && Array.isArray(tk.cfg.template.data) && tk.cfg.template.data.length === tk.cfg.template.w * tk.cfg.template.h) trackSt = { ...freshTrack(), ...tk };
  const tk2 = s.task as { task?: unknown; revealed?: boolean } | null | undefined;
  if (tk2?.task) { const parsed = parseTask(JSON.stringify(tk2.task)); if (!('error' in parsed)) { task = parsed; taskRevealed = !!tk2.revealed; } }
  const an = s.anchor as TrackConfig | null | undefined;
  if (an?.template && Array.isArray(an.template.data) && an.template.data.length === an.template.w * an.template.h) anchorCfg = an;
  const gt = s.gate as GateState | undefined;
  if (gt?.rect && gt.rect.w > 0 && gt.rect.h > 0) gateSt = { ...freshGate(), ...gt };
  const pr = s.prediction as (Prediction & { range?: typeof predRange }) | null | undefined;
  if (pr && Array.isArray(pr.points) && pr.points.length >= 2) { prediction = { xKey: pr.xKey, yId: pr.yId, points: pr.points }; if (pr.range) Object.assign(predRange, pr.range); }
  if (s.variation && typeof s.variation === 'object') variation = { ...freshVariation(), ...(s.variation as Partial<VarState>) };
  $<HTMLInputElement>('smooth').checked = session.smoothing >= 3;
  if (chans.length || session.samples.length || session.runs.length || variation.rows.length || trackSt.cfg || gateSt.rect) {
    const n = $('restore');
    n.hidden = false;
    n.innerHTML = `<span>${icon('info')} Letzte Sitzung wiederhergestellt: ${chans.length} Gerät(e), ${session.samples.length} Messpunkte${session.runs.length ? `, ${session.runs.length} gesicherte Reihe(n)` : ''}. Die Kalibrierung gilt nur bei gleichem Kamerabild.</span>
      <button type="button" id="restore-reset">Neu beginnen</button><button type="button" class="ghost" id="restore-ok">OK</button>`;
    $('restore-ok').onclick = () => { n.hidden = true; };
    $('restore-reset').onclick = () => {
      chans = []; session.channels = []; session.samples = []; session.runs = []; nextId = 1; variation = freshVariation(); tplId = ''; tplInputs = {}; prediction = null; trackSt = freshTrack(); gateSt = freshGate(); task = null; taskRevealed = false; anchorCfg = null; anchorCfg = null;
      n.hidden = true;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* egal */ }
      renderChannels(); renderLive(); updateButtons(); renderResults();
    };
  }
}

/* ============================== Tastatur ============================== */

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) && !(t as HTMLInputElement).type?.match(/checkbox|range|file/);
  if (valdlg.open || helpdlg.open || learndlg.open) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || typing) return;
  if (e.key === 'Escape') {
    if (trackMode || trkDraw) { trackMode = null; trkDraw = null; setHint('Auswahl abgebrochen.'); }
    else if (abort) abort.abort(); else if (calib) cancelCalibration();
    else if (sel) sel = null;
    return;
  }
  if (e.key >= '1' && e.key <= '4') return goStep(Number(e.key));
  if (e.key.toLowerCase() === 'b') return setBeamer(!beamer);
  if (e.key === '?') return helpdlg.showModal();
  if (e.key === ' ' && currentStep === 3 && !['BUTTON', 'SELECT'].includes(t.tagName)) { e.preventDefault(); toggleRecording(); return; }
  if (e.key.startsWith('Arrow') && sel && !calib) {
    const c = chan(sel.id);
    if (!c) return;
    e.preventDefault();
    const d = e.shiftKey ? 5 : 1;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    if (Date.now() - lastKeyHist > 800) pushHist(c);
    lastKeyHist = Date.now();
    if (sel.key === 'roi' && c.roi) c.roi = { ...c.roi, x: c.roi.x + dx, y: c.roi.y + dy };
    else { const p = c.raw[sel.key as 'pivot' | 'p1' | 'p2']; if (p) c.raw = { ...c.raw, [sel.key]: { x: p.x + dx, y: p.y + dy } }; }
    rebuildCal(c);
    scheduleSave();
  }
});

/* ============================== Start ============================== */

hydrateIcons();
restore();
applyTheme();
setLiveButton(false);
renderChannels();
renderLive();
refreshSelects();
updateButtons();
applyStep();
renderTemplateCard();
renderTaskCard();
renderAnchorStatus();
renderTrackStatus();
renderGateStatus();
syncPredInputs();
renderPredState();
drawPredCanvas();
renderResults();

/* ---- Direktlink von einer Versuchsseite: …/#vorlage=fadenpendel wählt die Vorlage ---- */
(() => {
  const m = /[#&]vorlage=([a-z0-9-]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const t = templateById(m[1]);
  if (!t) return showError('Diesen Versuch gibt es nicht (mehr). Wähle unten eine Vorlage.');
  if (tplId !== t.id) applyTemplate(t);
  if (tplId !== t.id) return; // abgelehnt (vorhandene Parameterreihe behalten)
  tplSelect.value = t.id;
  tplSelect.dispatchEvent(new Event('change'));
  setRoute('tpl');
  goStep(1);
  setHint(`Versuch „${t.title}“ ist eingestellt. Wähle jetzt die Quelle${t.audio ? ' (Mikrofon)' : ' (Kamera, Videodatei oder Demo)'}.`);
})();

/* ============================== Offline ============================== */

/** Service Worker nur im gebauten Stand: nach dem ersten Laden läuft die App auch ohne Netz. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const state = $('offline-state');
  const show = (): void => { state.hidden = false; state.textContent = 'Offline nutzbar'; };
  navigator.serviceWorker.register('./sw.js').then(
    (reg) => { if (navigator.serviceWorker.controller) show(); else navigator.serviceWorker.ready.then(show); void reg; },
    () => { /* ohne Service Worker (z. B. privates Fenster): App läuft online wie bisher */ },
  );
}
