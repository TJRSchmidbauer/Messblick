// Auswertung eines Videos von einem Digitalmultimeter in Messblick (Untersuchung, siehe docs/analyse/).
// node tools/auswertung-multimeter.mjs <video> <ausgabeordner>   (Vite-Server auf :5173, Chromium)
// Das Gerät liegt im Video quer: Bild einmal nach links drehen, danach Rechteck um die Ziffern ziehen.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [video, out] = process.argv.slice(2);
const ROI = JSON.parse(process.env.ROI ?? '{"x":376,"y":338,"w":178,"h":140}'); // in Bildpunkten der gedrehten Ansicht
const HZ = process.env.HZ ?? '30';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true, deviceScaleFactor: 1 })).newPage();
await page.goto(process.env.URL ?? 'http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.setInputFiles('#file', video);
await page.waitForSelector('#panel-2:not([hidden])', { timeout: 60000 });
await page.waitForTimeout(1200);
await page.click('#btn-rotate-ccw');
await page.waitForTimeout(500);
const [W, H] = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
const at = async (x, y) => { const b = await page.locator('#view').boundingBox(); return [b.x + (x / W) * b.width, b.y + (y / H) * b.height]; };
await page.click('#add-digital');
const [ax, ay] = await at(ROI.x, ROI.y), [bx, by] = await at(ROI.x + ROI.w, ROI.y + ROI.h);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
await page.locator('.chan input[data-f="digits"]').fill('4');
await page.locator('.chan input[data-f="unit"]').fill('V');
await page.locator('.chan input[data-f="decimals"]').fill(process.env.DECIMALS ?? '2'); // das Gerät zeigt immer zwei Nachkommastellen
await page.waitForTimeout(600);
const scrub = async (t) => { await page.evaluate((t) => { const r = document.getElementById('scrub-range'); r.value = String(t); r.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(900); };
await scrub(2.0);
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/multimeter-kalibrierung.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1400, height: 1000 } });
// Einzelbilder aus dem Video mit der Ablesung der App zu diesen Zeitpunkten (zeigt, wie die Werte entstehen)
const FRAME_TIMES = (process.env.FRAME_TIMES ?? '').split(',').filter(Boolean).map(Number);
const frameLog = [];
for (const t of FRAME_TIMES) {
  await scrub(t);
  await page.evaluate(() => window.scrollTo(0, 0));
  const live = await page.locator('.live-value').allTextContents();
  await page.locator('#view').screenshot({ path: `${out}/bild-${t.toFixed(2)}.png` });
  frameLog.push({ t, live });
}
fs.writeFileSync(`${out}/bilder.json`, JSON.stringify(frameLog, null, 1));
await page.click('#tab-3'); await page.selectOption('#hz', HZ);
const t0 = Date.now();
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 300000 });
console.log('Auswertung', ((Date.now() - t0) / 1000).toFixed(1), 's bei', HZ, 'Hz');
await page.waitForTimeout(800);
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
fs.writeFileSync(`${out}/multimeter.csv`, fs.readFileSync(await csv.path()));
await page.locator('.p4-main').screenshot({ path: `${out}/multimeter-ergebnis.jpg`, type: 'jpeg', quality: 85 });
await browser.close();
