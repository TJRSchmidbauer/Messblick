// Lichtschranke mit der Demo-Pendelkugel: node tests/e2e-gate.mjs (setzt laufenden Vite-Server auf :5173 voraus)
import { chromium } from 'playwright';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: 'reduce' })).newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');

const W = 640, H = 360;
const box = await page.locator('#view').boundingBox();
const at = (x, y) => [box.x + (x / W) * box.width, box.y + (y / H) * box.height];
await page.click('#gate-zone');
const [x0, y0] = at(494, 276), [x1, y1] = at(506, 308);
await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 3 }); await page.mouse.up();
const status = await page.locator('#gate-status').textContent();
if (!/Zone gewählt/.test(status)) throw new Error('Zone nicht übernommen: ' + status);

await page.fill('#gate-unit', 'lx'); await page.fill('#gate-factor', '800');
await page.click('#tab-3');
await page.selectOption('#hz', '30');
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 180000 });
await page.waitForSelector('#gate-card:not([hidden])');
await page.fill('#gate-width', '0,05');
const body = (await page.locator('#gate-body').innerText()).replace(/\n+/g, ' | ');
console.log('Lichtschranke:', body);
const num = (re) => Number((re.exec(body)?.[1] ?? '').replace(',', '.'));
const interval = num(/aufeinanderfolgenden Durchgängen:\s*(-?[0-9]+,[0-9]+)/);
const period = num(/zweite Durchgang[^:]*:\s*(-?[0-9]+,[0-9]+)/);
if (!(Math.abs(interval - 2) < 0.02)) throw new Error('Zeitabstand weicht ab: ' + interval);
if (!(Math.abs(period - 4) < 0.02)) throw new Error('Periodendauer weicht ab: ' + period);
if (!/Geschwindigkeit beim Durchgang/.test(body)) throw new Error('Geschwindigkeit fehlt');
// in die Parameterreihe übernehmen
await page.fill('#var-p', '1');
await page.click('#gate-take-period');
if ((await page.locator('#var-table tbody tr').count()) !== 1) throw new Error('Periodendauer wurde nicht in die Parameterreihe übernommen');
{
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
  const lines = (await import('node:fs')).readFileSync(await csv.path(), 'utf8').trim().split(/\r?\n/);
  const vals = lines.slice(1).map((l) => Number(l.split(';')[1].replace(',', '.'))).filter(Number.isFinite);
  if (!/lx/.test(lines[0])) throw new Error('Einheit lx fehlt im Kopf: ' + lines[0]);
  if (!(Math.max(...vals) > 100 && Math.max(...vals) <= 800)) throw new Error('Skalierung mit Faktor 800 falsch: max ' + Math.max(...vals));
  console.log('Helligkeit in lx, max', Math.max(...vals).toFixed(0));
}
await page.selectOption('#ysel', { index: (await page.locator('#ysel option').allTextContents()).findIndex((t) => /Lichtschranke/.test(t)) });
await page.screenshot({ path: process.env.SHOT ?? '/tmp/gate.png', fullPage: true });
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('GATE OK');
