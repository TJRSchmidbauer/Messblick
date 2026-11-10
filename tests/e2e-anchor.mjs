// Bildanker: Demo-Kamera wackelt, Zeigerablesung mit und ohne Anker. node tests/e2e-anchor.mjs (Vite-Server :5173)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');

const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg) => [d.cx + Math.cos((deg * Math.PI) / 180) * d.r, d.cy + Math.sin((deg * Math.PI) / 180) * d.r];
await page.waitForTimeout(300); // Bereiche klappen auf, das Layout setzt sich
let box = await page.locator('#view').boundingBox();
const at = (x, y) => [box.x + (x / W) * box.width, box.y + (y / H) * box.height];
const click = async (x, y) => { box = await page.locator('#view').boundingBox(); const [px, py] = at(x, y); await page.mouse.click(px, py); };
const answer = async (v) => { await page.locator('#valdlg-input').fill(v); await page.click('#valdlg button[value=ok]'); };

// Kalibrieren (Kamera ruhig)
await page.click('#add-analog');
await click(d.cx, d.cy); await click(...pt(135)); await answer('0'); await click(...pt(45)); await answer('10');

/** Aufnahme 5 Hz über die ganze Demo; liefert den größten Abweichungsbetrag der Spannung von 5 + 4·sin(t/3). */
const worstError = async () => {
  await page.click('#tab-3');
  await page.selectOption('#hz', '5');
  await page.click('#btn-analyze', { timeout: 180000 });
  await page.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
  const rows = fs.readFileSync(await csv.path(), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(';').map((x) => Number(x.replace(',', '.'))));
  return Math.max(...rows.filter((r) => Number.isFinite(r[1])).map(([t, u]) => Math.abs(u - (5 + 4 * Math.sin(t / 3)))));
};

console.log('Fehler ohne Wackeln:', (await worstError()).toFixed(3));await page.click('#tab-3'); await page.click('#btn-clear'); await page.click('#tab-2');
// A: Kamera wackelt, kein Anker
await page.check('#demo-shake');
const errNo = await worstError();
console.log('Größter Fehler ohne Anker:', errNo.toFixed(3), 'V');

// B: Anker setzen (Kamera wieder ruhig), danach wackeln lassen
await page.click('#tab-3'); await page.click('#btn-clear');
await page.click('#tab-2');
await page.uncheck('#demo-shake');
await page.click('#anchor-set');
box = await page.locator('#view').boundingBox();
{ const [ax, ay] = at(26, 16), [bx, by] = at(66, 56); await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 4 }); await page.mouse.up(); }
if (!/Anker gefunden/.test(await page.locator('#anchor-status').textContent())) await page.waitForTimeout(500);
await page.check('#demo-shake');
await page.waitForTimeout(900);
const st = await page.locator('#anchor-status').textContent();
console.log('Status:', st);
if (!/Anker gefunden/.test(st)) throw new Error('Anker wird nicht gefunden: ' + st);
const errYes = await worstError();
console.log('Größter Fehler mit Anker:', errYes.toFixed(3), 'V');
if (!(errNo > 0.2)) throw new Error('Die wackelnde Kamera sollte ohne Anker deutlich stören: ' + errNo);
if (!(errYes < 0.08)) throw new Error('Mit Anker sollte die Ablesung wieder stimmen: ' + errYes);
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('ANCHOR OK');
