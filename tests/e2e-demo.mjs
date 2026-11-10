// E2E-Smoketest mit Demo-Quelle: node tests/e2e-demo.mjs (setzt laufenden Vite-Server auf :5173 voraus)
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const url = process.env.URL ?? 'http://localhost:5173/';
const shots = process.env.SHOTS ?? '/tmp/shots';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.error('CONSOLE', m.text()); } });
const external = [];
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(url) && !/^(data|blob|about):/.test(u)) external.push(u);
});
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

const box = async () => page.locator('#view').boundingBox();
const click = async (fx, fy) => { const b = await box(); await page.mouse.click(b.x + fx * b.width, b.y + fy * b.height); };
const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg) => [(d.cx + Math.cos(deg * Math.PI / 180) * d.r) / W, (d.cy + Math.sin(deg * Math.PI / 180) * d.r) / H];
const answer = async (v) => { await page.locator('#valdlg-input').fill(v); await page.click('#valdlg button[value=ok]'); };

await page.screenshot({ path: `${shots}/01-start.png` });
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])'); // automatisch auf Schritt 2

// Analog kalibrieren (Dialog statt prompt)
await page.click('#add-analog');
await click(d.cx / W, d.cy / H);
await click(...pt(135)); await answer('0');
await click(...pt(45)); await answer('10');
// Ungültige Eingabe wird abgefangen
await page.click('#add-digital');
const b = await box();
const sx = b.x + (380 / W) * b.width, sy = b.y + (140 / H) * b.height;
await page.mouse.move(sx, sy); await page.mouse.down();
await page.mouse.move(sx + (220 / W) * b.width, sy + (90 / H) * b.height, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(700);
const lives = await page.locator('.live-value').allTextContents();
console.log('Live:', lives);
if (lives.length !== 2 || lives.some((t) => t.startsWith('–'))) throw new Error('Live-Ablesung fehlt: ' + lives);
await page.screenshot({ path: `${shots}/02-geraete.png` });

// Zeichenvergleich (LCD/Punktmatrix): Schrift umstellen, die Demo-Anzeige wird weiter gelesen; Anlernen prüft Eingaben
await page.selectOption('select[data-f=style]', 'glyph');
await page.waitForTimeout(700);
const glyphLives = await page.locator('.live-value').allTextContents();
console.log('Live (Zeichenvergleich):', glyphLives);
if (glyphLives.length !== 2 || glyphLives.some((t) => t.startsWith('–'))) throw new Error('Zeichenvergleich liest nicht: ' + glyphLives);
await page.click('button[data-act=learn]');
await page.fill('#learndlg-input', '123456');
await page.click('#learndlg button[value=ok]');
if (!/mehr Zeichen als Ziffern/.test(await page.locator('#learndlg-err').textContent())) throw new Error('Anlern-Fehlermeldung fehlt');
await page.click('#learndlg button[value=cancel]');
await page.selectOption('select[data-f=style]', 'auto');

// Verschiebbarer Punkt + Undo: Drehpunkt 5px ziehen, Ctrl+Z
await click(d.cx / W, d.cy / H);          // Drehpunkt wählen
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');

// Dateiauswertung (Demo, 5 Hz)
await page.keyboard.press('3');
await page.selectOption('#hz', '5');
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 60000 });
await page.selectOption('#xsel', { index: 1 });
await page.selectOption('#ysel', { index: 1 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/03-auswertung.png`, fullPage: true });

// Bereichswechsel: die letzten vier Werte von Gerät 1 ×10 (wie nach einem Messbereichswechsel) → Hinweis, Korrektur, Rücknahme
await page.click('summary:has-text("Wertetabelle")');
const orig = [];
for (const i of [147, 148, 149, 150]) {
  const loc = page.locator(`#table input[data-i="${i}"][data-c="k1"]`);
  const v = Number((await loc.inputValue()).replace(',', '.'));
  orig.push(v);
  await loc.fill(String(v * 10).replace('.', ','));
  await loc.blur();
}
await page.waitForTimeout(200);
const jumpText = await page.locator('#jump-notes').innerText();
console.log('Sprung:', jumpText.replace(/\n+/g, ' | ').slice(0, 160));
if (!/Gerät 1.*Sprung ×10 bei Messpunkt 148/.test(jumpText)) throw new Error('Bereichswechsel nicht erkannt: ' + jumpText);
await page.click('[data-jump-fix]');
if (/Sprung ×/.test(await page.locator('#jump-notes').innerText())) throw new Error('Korrektur hat den Hinweis nicht beseitigt');
const fixed = Number((await page.locator('#table input[data-i="149"][data-c="k1"]').inputValue()).replace(',', '.'));
if (Math.abs(fixed - orig[2]) > 0.01) throw new Error(`Korrektur stellt den Wert nicht her: ${fixed} statt ${orig[2]}`);
await page.click('[data-jump-undo]');
if (!/Sprung ×10/.test(await page.locator('#jump-notes').innerText())) throw new Error('Zurücknehmen fehlt');
await page.click('[data-jump-fix]');

// Vorhersage: Kurve zeichnen, im Graphen erscheint sie gepunktet, dazu eine Rückmeldung mit Denkanstoß
await page.click('#tab-3');
await page.click('#pred-box summary');
await page.selectOption('#pred-x', 't'); await page.selectOption('#pred-y', { index: 0 });
await page.fill('#pred-xmax', '30'); await page.fill('#pred-ymin', '0'); await page.fill('#pred-ymax', '10');
await page.locator('#pred-canvas').scrollIntoViewIfNeeded();
const pb = await page.locator('#pred-canvas').boundingBox();
await page.mouse.move(pb.x + pb.width * 0.12, pb.y + pb.height * 0.5); await page.mouse.down();
for (let i = 0; i <= 40; i++) { const f = i / 40; await page.mouse.move(pb.x + pb.width * (0.12 + 0.84 * f), pb.y + pb.height * (0.5 - 0.35 * Math.sin(f * Math.PI * 2 * 1.6))); }
await page.mouse.up();
if (!/Vorhersage gespeichert/.test(await page.locator('#pred-state').textContent())) throw new Error('Vorhersage wurde nicht gespeichert');
await page.click('#tab-4');
await page.selectOption('#xsel', { value: 't' }); await page.selectOption('#ysel', { index: 0 });
const predFb = await page.locator('#pred-feedback').innerText();
console.log('Vorhersage:', predFb);
if (!/Abweichung|Vorhersage/.test(predFb)) throw new Error('Rückmeldung zur Vorhersage fehlt');
await page.screenshot({ path: `${shots}/03e-vorhersage.png`, fullPage: true });
await page.click('#pred-clear').catch(() => {});

// Teilprojekt 1: Messunsicherheit (Güteklasse), Fit (Sinus, ω ≈ 1/3 der Demo), Fitbereich, Neue Größe, Export
await page.click('#tab-2');
await page.selectOption('.chan:nth-child(1) select[data-f=umode]', 'class');
await page.fill('.chan:nth-child(1) input[data-f=ua]', '1,5');
await page.fill('.chan:nth-child(1) input[data-f=ub]', '10');
await page.click('#tab-4');
await page.selectOption('#xsel', { value: 't' });
await page.selectOption('#ysel', { index: 0 });
await page.selectOption('#fit-model', 'sine');
await page.waitForTimeout(300);
const fitText = await page.locator('#fit-result').innerText();
console.log('Fit:', fitText.replace(/\n+/g, ' | '));
if (!/ω/.test(fitText) || !/0,33/.test(fitText)) throw new Error('Fit-Ergebnis fehlt: ' + fitText);
if (/Keine Messunsicherheit/.test(fitText)) throw new Error('Messunsicherheit wurde nicht berücksichtigt');
if (!(await page.locator('#resid-wrap').isVisible())) throw new Error('Residuen-Graph fehlt');
// Barrierefreiheit: Beschreibung in Worten, Messpunkte per Tastatur, Graph hören
const desc = await page.locator('#graph-desc').innerText();
console.log('Beschreibung:', desc.slice(0, 160));
if (!/Messpunkten/.test(desc) || !/schwingt auf und ab/.test(desc) || !/Fit Sinus mit Offset/.test(desc)) throw new Error('Beschreibung des Graphen unvollständig: ' + desc);
await page.focus('#chart');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
if (!/Messpunkt 2 von 151: Zeit = /.test(await page.locator('#graph-live').textContent())) throw new Error('Tastaturansage fehlt');
await page.keyboard.press('End');
if (!/Messpunkt 151 von 151/.test(await page.locator('#graph-live').textContent())) throw new Error('Ende-Taste geht nicht');
await page.click('#graph-listen');
if (!(await page.locator('#graph-stop').isVisible())) throw new Error('Graph hören startet nicht: ' + await page.locator('#error, .error').allTextContents());
await page.click('#graph-stop');
if (await page.locator('#graph-stop').isVisible()) throw new Error('Stopp wirkt nicht');
// Fitbereich per Ziehen im Graphen
await page.click('#fit-range');
await page.locator('#chart').scrollIntoViewIfNeeded();
const cb = await page.locator('#chart').boundingBox();
await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.5); await page.mouse.down();
await page.mouse.move(cb.x + cb.width * 0.7, cb.y + cb.height * 0.5, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(300);
if (!/Fitbereich gewählt/.test(await page.locator('#fit-result').innerText())) throw new Error('Fitbereich wurde nicht übernommen');
await page.click('#fit-range-clear');
// Neue Größe: Formel U·I
await page.click('#derive-new');
await page.fill('#derivedlg-expr', 'Gerät_1*Gerät_2');
await page.fill('#derivedlg-name', 'Leistung'); await page.fill('#derivedlg-unit', 'W');
await page.click('#derivedlg button[value=ok]');
await page.waitForTimeout(300);
if (!(await page.locator('#derived-list').innerText()).includes('Leistung')) throw new Error('Abgeleitete Größe fehlt');
await page.click('#derive-new');
await page.fill('#derivedlg-expr', '2*(');
await page.fill('#derivedlg-name', 'Kaputt');
await page.click('#derivedlg button[value=ok]');
if (!/endet zu früh/.test(await page.locator('#derivedlg-err').innerText())) throw new Error('Formelfehler wird nicht gemeldet');
await page.click('#derivedlg button[value=cancel]');
await page.selectOption('#ysel', { index: 0 });
await page.screenshot({ path: `${shots}/03b-fit.png`, fullPage: true });
const [xlFit] = await Promise.all([page.waitForEvent('download'), page.click('#dl-xlsx')]);
const wbFit = XLSX.read(fs.readFileSync(await xlFit.path()));
console.log('XLSX mit Fit:', wbFit.SheetNames);
if (!wbFit.SheetNames.includes('Fit')) throw new Error('Blatt "Fit" fehlt im XLSX');
const fitRows = XLSX.utils.sheet_to_json(wbFit.Sheets['Fit'], { header: 1 });
if (!fitRows.some((r) => r[0] === 'ω' && Number.isFinite(r[2]))) throw new Error('ω mit Unsicherheit fehlt im Blatt Fit');
if (!XLSX.utils.sheet_to_json(wbFit.Sheets['Messwerte'], { header: 1 })[0].includes('Leistung / W')) throw new Error('Abgeleitete Größe fehlt in den Messwerten');

// Parameterreihe: drei Durchgänge aus der Live-Ablesung, dazu ein Fitparameter; Auftragungsvorschläge, Export
await page.fill('#var-pname', 'Masse'); await page.fill('#var-punit', 'g');
for (const p of ['100', '200', '300']) {
  await page.fill('#var-p', p);
  await page.waitForTimeout(900); // genug sichere Ablesungen im Puffer
  await page.click('#var-take');
  const m = await page.locator('#var-msg').textContent();
  if (m) throw new Error('Messwert übernehmen: ' + m);
}
await page.selectOption('#var-fitparam', 'ω');
await page.fill('#var-p', '400');
await page.click('#var-take-fit');
const varRows = await page.locator('#var-table tbody tr').count();
if (varRows !== 4) throw new Error('Parameterreihe: erwartet 4 Zeilen, ist ' + varRows);
if (!(await page.locator('#var-plot').isVisible())) throw new Error('Auftragung fehlt');
if ((await page.locator('#var-suggest button').count()) < 1) throw new Error('Keine Auftragungsvorschläge');
if (!/R²/.test(await page.locator('#var-result').innerText())) throw new Error('Kein Fit der Parameterreihe');
await page.click('#var-suggest button >> nth=0');
const [vx] = await Promise.all([page.waitForEvent('download'), page.click('#var-xlsx')]);
const wbVar = XLSX.read(fs.readFileSync(await vx.path()));
if (!wbVar.SheetNames.includes('Parameterreihe')) throw new Error('Blatt Parameterreihe fehlt');
const varSheet = XLSX.utils.sheet_to_json(wbVar.Sheets['Parameterreihe'], { header: 1 });
console.log('Parameterreihe:', JSON.stringify(varSheet.slice(0, 3)));
await page.screenshot({ path: `${shots}/03c-parameterreihe.png`, fullPage: true });
await page.click('#var-clear');
await page.selectOption('#fit-model', '');

// Versuchsvorlagen: Zeitverlauf (Kondensator) mit Eingaben und Literaturvergleich, Parameterreihe (Fotoeffekt)
await page.click('#tab-1');
await page.selectOption('#tpl-select', 'kond-entladen');
await page.click('#tpl-apply');
await page.click('#tab-4');
await page.waitForTimeout(400);
if (!(await page.locator('#tpl-card').isVisible())) throw new Error('Vorlagenkarte fehlt');
const tpl1 = await page.locator('#tpl-results').innerText();
console.log('Vorlage Kondensator:', tpl1.replace(/\n+/g, ' | ').slice(0, 200));
if (!/Bitte eintragen: Widerstand R/.test(tpl1)) throw new Error('Hinweis auf fehlendes R fehlt: ' + tpl1);
await page.fill('#tpl-in-R', '1000'); await page.fill('#tpl-in-Cnenn', '4700'); await page.fill('#tpl-rel-R', '1');
{ // Ergebnis teilen: Code erscheint im Klassenfeld, wenn das Kopieren nicht klappt, sonst in der Zwischenablage
  await page.locator('#classbox > summary').click();
  await page.fill('#class-group', 'Gruppe Demo');
  await page.click('#class-copy-code');
  await page.waitForFunction(() => /Code/.test(document.getElementById('class-share-msg').textContent));
  const code = (await page.inputValue('#class-text')).match(/PMW1\.[A-Za-z0-9_-]+/)?.[0] ?? (await page.evaluate(() => navigator.clipboard.readText().catch(() => '')));
  if (!/^PMW1\./.test(code)) throw new Error('Kein Gruppencode erzeugt');
  await page.fill('#class-text', code);
  if (!/Gruppe Demo/.test(await page.locator('#class-out').innerText())) throw new Error('Eigener Code wird nicht gelesen');
  await page.fill('#class-text', '');
}
const tpl2 = await page.locator('#tpl-results').innerText();
if (!/Kapazität C/.test(tpl2) || /Bitte eintragen/.test(tpl2) || !/Nennwert/.test(tpl2)) throw new Error('Kapazität mit Vergleich fehlt: ' + tpl2);
if (!/Unsicherheitsbudget: größter Beitrag/.test(tpl2)) throw new Error('Unsicherheitsbudget fehlt: ' + tpl2);
await page.click('#tab-1');
await page.selectOption('#tpl-select', 'fotoeffekt');
await page.click('#tpl-apply');
await page.click('#tab-4');
for (const p of ['5', '6', '7']) { await page.fill('#var-p', p); await page.waitForTimeout(900); await page.click('#var-take'); }
const tpl3 = await page.locator('#tpl-results').innerText();
console.log('Vorlage Fotoeffekt:', tpl3.replace(/\n+/g, ' | ').slice(0, 260));
if (!/Planck-Konstante/.test(tpl3) || !/Literaturwert/.test(tpl3)) throw new Error('Fotoeffekt-Ergebnis fehlt: ' + tpl3);
const [tx] = await Promise.all([page.waitForEvent('download'), page.click('#var-xlsx')]);
if (!XLSX.read(fs.readFileSync(await tx.path())).SheetNames.includes('Ergebnis')) throw new Error('Blatt Ergebnis fehlt');
await page.screenshot({ path: `${shots}/03d-vorlage.png`, fullPage: true });
// Protokoll: Download, Gliederung, Ergebnis aus der Vorlage, Bilder eingebettet, nichts Externes
await page.fill('#exp-title', 'Planck mit dem Fotoeffekt'); await page.fill('#exp-name', 'Gruppe B');
const [proto] = await Promise.all([page.waitForEvent('download'), page.click('#dl-protocol')]);
const html = fs.readFileSync(await proto.path(), 'utf8');
for (const h of ['1. Fragestellung', '2. Aufbau', '3. Durchführung', '4. Messwerte', '5. Auswertung', '6. Fehlerbetrachtung', '7. Fazit']) if (!html.includes(h)) throw new Error('Protokoll: Abschnitt fehlt: ' + h);
if (!/Planck-Konstante/.test(html) || !/Gruppe B/.test(html)) throw new Error('Protokoll: Ergebnis oder Name fehlt');
if (!/<img src="data:image\/png;base64,/.test(html)) throw new Error('Protokoll: Graph nicht eingebettet');
if (/https?:\/\/|<script/i.test(html)) throw new Error('Protokoll lädt etwas nach oder enthält Skripte');
console.log('Protokoll:', Math.round(html.length / 1024), 'KB'); fs.writeFileSync(`${shots}/protokoll.html`, html);
await page.click('#tpl-end');
if (await page.locator('#tpl-card').isVisible()) throw new Error('Vorlage lässt sich nicht beenden');
await page.click('#var-clear');

// Reihe sichern + zweite Aufnahme (live) + Vergleich
await page.keyboard.press('3');
await page.click('#btn-archive');
await page.click('#btn-live');
await page.waitForTimeout(2500);
await page.click('#btn-live');
await page.screenshot({ path: `${shots}/04-messen.png` });
await page.keyboard.press('4');
await page.selectOption('#xsel', { value: 't' });
await page.selectOption('#y2sel', { index: 2 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/05-reihen.png`, fullPage: true });

// Exporte
await page.fill('#exp-title', 'Demo-Versuch'); await page.fill('#exp-name', 'Gruppe A');
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
const lines = fs.readFileSync(await csv.path(), 'utf8').trim().split(/\r?\n/);
console.log(lines.slice(0, 3).join('\n'), '\nCSV-Zeilen:', lines.length);
const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-xlsx')]);
const wb = XLSX.read(fs.readFileSync(await xl.path()));
console.log('XLSX-Blätter:', wb.SheetNames);
const [png] = await Promise.all([page.waitForEvent('download'), page.click('#dl-png')]);
fs.copyFileSync(await png.path(), `${shots}/06-export.png`);

// Genauigkeit der ersten Reihe (Datei-Auswertung = erstes Blatt "Reihe 1")
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Reihe 1'], { header: 1 });
const V = (t) => 5 + 4 * Math.sin(t / 3), A = (t) => Math.round(V(t) * 0.2 * 100) / 100 + 0.1;
let mu = 0, mi = 0;
for (const r of rows.slice(1)) { mu = Math.max(mu, Math.abs(r[1] - V(r[0]))); mi = Math.max(mi, Math.abs(r[2] - A(r[0]))); }
console.log('max Fehler U:', mu.toFixed(3), 'V; I:', mi.toFixed(3), 'A');
if (mu > 0.15 || mi > 0.001) throw new Error('Ablesung zu ungenau');

// Wiederherstellung nach Neuladen
await page.reload();
await page.waitForSelector('#restore:not([hidden])');
console.log('Restore:', (await page.locator('#restore').innerText()).replace(/\s+/g, ' '));

// Beamer + Themes + Handy
await page.keyboard.press('3'); await page.keyboard.press('b');
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/07-beamer.png` });
await page.keyboard.press('b');
await page.selectOption('#theme', 'dark'); await page.keyboard.press('4'); await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/08-dunkel.png`, fullPage: true });
await page.selectOption('#theme', 'contrast'); await page.keyboard.press('2'); await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/09-kontrast.png` });
await page.selectOption('#theme', 'light');
await page.setViewportSize({ width: 390, height: 844 });
await page.keyboard.press('2'); await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/10-handy.png`, fullPage: true });

if (external.length) throw new Error('Externe Anfragen: ' + external.join(', '));
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('E2E OK');
