// Auswertung eines Videos mit zwei Zeigerinstrumenten (Strom, Spannung) in Messblick (Untersuchung, siehe docs/analyse/).
// node tools/auswertung-zeiger.mjs <video> <ausgabeordner>   (Vite-Server auf :5173, Chromium)
// Die Instrumente liegen im Video quer: Bild einmal nach links drehen. Drehpunkt verdeckt: je Gerät drei Skalenstriche am Skalenbogen.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [video, out] = process.argv.slice(2);
const HZ = process.env.HZ ?? '30';
// Skalenpunkte in Bildpunkten der gedrehten Ansicht (720 × 1280); Wert, den die Skala dort zeigt
const GERAETE = JSON.parse(process.env.GERAETE ?? JSON.stringify([
  { name: 'Strom I', unit: 'A', p1: [80, 205, 0], p2: [279, 248, 0.6], p3: [152, 197] },
  { name: 'Spannung U', unit: 'V', p1: [465, 203, 0], p2: [662, 243, 15], p3: [539, 188] },
]));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true })).newPage();
await page.goto(process.env.URL ?? 'http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.setInputFiles('#file', video);
await page.waitForSelector('#panel-2:not([hidden])', { timeout: 60000 });
await page.waitForTimeout(1200);
await page.click('#btn-rotate-ccw');
await page.waitForTimeout(500);
const [W, H] = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
const click = async (x, y) => { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150); const b = await page.locator('#view').boundingBox(); await page.mouse.click(b.x + (x / W) * b.width, b.y + (y / H) * b.height); };
const answer = async (v) => { await page.locator('#valdlg-input').fill(String(v)); await page.click('#valdlg button[value=ok]'); };
for (const [i, g] of GERAETE.entries()) {
  await page.click('#add-analog');
  const card = page.locator('.chan').nth(i);
  await card.locator('input[data-f="pivotHidden"]').check();
  await card.locator('input[data-f="name"]').fill(g.name);
  await card.locator('input[data-f="unit"]').fill(g.unit);
  await click(g.p1[0], g.p1[1]);
  console.log(g.name, 'nach p1:', (await page.locator('#hint').textContent()).slice(0, 100), '| Dialog offen:', await page.locator('#valdlg').evaluate((d) => d.open));
  await answer(g.p1[2]);
  await click(g.p2[0], g.p2[1]); await answer(g.p2[2]);
  await click(g.p3[0], g.p3[1]);
  await page.waitForTimeout(6000); // die Farberkennung sucht bei Bedarf in weiteren Bildern des Videos
  console.log(g.name, 'Hinweis:', (await page.locator('#hint').textContent()).slice(0, 170));
  console.log(g.name, 'Zeiger rot erkannt:', await card.locator('input[data-f="pointerRed"]').isChecked());
  if (process.env.PIVOT_VIDEO !== '0' && await card.locator('input[data-f="pointerRed"]').isChecked()) {
    await card.locator('button[data-act="pivot-video"]').click();
    await page.waitForFunction(() => /Drehpunkt aus \d+ Bildern|bewegt sich|nur in \d+ von/.test(document.getElementById('hint').textContent), null, { timeout: 120000 });
    console.log(g.name, 'Drehpunkt:', (await page.locator('#hint').textContent()).slice(0, 200));
  }
}
const scrub = async (t) => { await page.evaluate((t) => { const r = document.getElementById('scrub-range'); r.value = String(t); r.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(900); };
await scrub(Number(process.env.SHOT_T ?? 4));
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/zeiger-kalibrierung.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1400, height: 1000 } });
await page.locator('#view').screenshot({ path: `${out}/zeiger-ansicht.jpg`, type: 'jpeg', quality: 85 });
await page.click('#tab-3'); await page.selectOption('#hz', HZ);
const t0 = Date.now();
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 300000 });
console.log('Auswertung', ((Date.now() - t0) / 1000).toFixed(1), 's bei', HZ, 'Hz');
await page.waitForTimeout(800);
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
fs.writeFileSync(`${out}/zeiger.csv`, fs.readFileSync(await csv.path()));
await page.locator('#ysel').selectOption({ index: 0 });
await page.locator('#y2sel').selectOption({ index: 1 }).catch(() => {});
await page.waitForTimeout(700);
await page.locator('.p4-main').screenshot({ path: `${out}/zeiger-ergebnis.jpg`, type: 'jpeg', quality: 85 });
await browser.close();
