// E2E-Smoketest mit Demo-Quelle: node tests/e2e-demo.mjs (setzt laufenden Vite-Server auf :5173 voraus)
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const url = process.env.URL ?? 'http://localhost:5173/';
const shots = process.env.SHOTS ?? '/tmp/shots';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' });
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
