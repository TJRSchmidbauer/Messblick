// E2E-Smoketest mit Demo-Quelle: node tests/e2e-demo.mjs (setzt laufenden Vite-Server auf :5173 voraus)
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1200, height: 1000 } });
page.on('pageerror', (e) => { console.error('PAGEERROR', e.message); process.exitCode = 1; });
page.on('dialog', (d) => d.accept(d.defaultValue()));
await page.goto(url);
await page.click('#btn-demo');

const box = async () => (await page.locator('#view').boundingBox());
const click = async (fx, fy) => { const b = await box(); await page.mouse.click(b.x + fx * b.width, b.y + fy * b.height); };

// Analog: Drehpunkt, Skala 0 (135°) und 10 (45°) – Werte sind per Prompt-Default 0 bzw. 10
const d = { cx: 190, cy: 220, r: 120 }; const W = 640, H = 360;
const pt = (deg) => [(d.cx + Math.cos(deg * Math.PI / 180) * d.r) / W, (d.cy + Math.sin(deg * Math.PI / 180) * d.r) / H];
await page.click('#add-analog');
await click(d.cx / W, d.cy / H);
await click(...pt(135));
await click(...pt(45));
// Digital: ROI ziehen
await page.click('#add-digital');
const b = await box();
const sx = b.x + (380 / W) * b.width, sy = b.y + (140 / H) * b.height;
await page.mouse.move(sx, sy); await page.mouse.down();
await page.mouse.move(sx + (220 / W) * b.width, sy + (90 / H) * b.height, { steps: 5 }); await page.mouse.up();

await page.waitForTimeout(600);
const lives = await page.locator('.live').allTextContents();
console.log('Live:', lives);
if (lives.length !== 2 || lives.some((t) => t.startsWith('–'))) throw new Error('Live-Ablesung fehlt: ' + lives);

// Dateiauswertung über Demo (30 s @ 5 Hz)
await page.selectOption('#hz', '5');
await page.click('#btn-analyze');
await page.waitForFunction(() => !document.querySelector('#btn-analyze').disabled && !document.querySelector('#btn-clear').disabled, null, { timeout: 60000 });
await page.selectOption('#xsel', { index: 1 });
await page.selectOption('#ysel', { index: 1 });
await page.screenshot({ path: '/tmp/e2e.png', fullPage: true });

const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
const csvText = fs.readFileSync(await csv.path(), 'utf8');
const lines = csvText.trim().split(/\r?\n/);
console.log(lines.slice(0, 4).join('\n'), '\n… Zeilen:', lines.length);
const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-xlsx')]);
const wb = XLSX.read(fs.readFileSync(await xl.path()));
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Messwerte'], { header: 1 });
console.log('XLSX Zeilen:', rows.length, rows[1]);

// Genauigkeit gegen bekannte Demo-Funktionen prüfen
const V = (t) => 5 + 4 * Math.sin(t / 3), A = (t) => Math.round(V(t) * 0.2 * 100) / 100 + 0.1;
let maxU = 0, maxI = 0;
for (const r of rows.slice(1)) { maxU = Math.max(maxU, Math.abs(r[1] - V(r[0]))); maxI = Math.max(maxI, Math.abs(r[2] - A(r[0]))); }
console.log('max Fehler U:', maxU.toFixed(3), 'V; I:', maxI.toFixed(3), 'A');
if (maxU > 0.15 || maxI > 0.001) throw new Error('Ablesung zu ungenau');
await browser.close();
console.log('E2E OK');
