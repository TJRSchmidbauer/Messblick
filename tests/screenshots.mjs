// Erzeugt die README-Bilder aus der laufenden App (Demo-Quelle): node tests/screenshots.mjs (Dev-Server :5173)
import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://localhost:5173/';
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
const b = await chromium.launch();
const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg) => [(d.cx + Math.cos(deg * Math.PI / 180) * d.r) / W, (d.cy + Math.sin(deg * Math.PI / 180) * d.r) / H];

async function prepare(p, { calibrate = true } = {}) {
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload();
  if (!calibrate) return;
  await p.click('#btn-demo');
  const box = () => p.locator('#view').boundingBox();
  const click = async (fx, fy) => { const bb = await box(); await p.mouse.click(bb.x + fx * bb.width, bb.y + fy * bb.height); };
  const ans = async (v) => { await p.locator('#valdlg-input').fill(v); await p.click('#valdlg button[value=ok]'); };
  await p.click('#add-analog'); await click(d.cx / W, d.cy / H); await click(...pt(135)); await ans('0'); await click(...pt(45)); await ans('10');
  await p.click('#add-digital');
  const bb = await box();
  await p.mouse.move(bb.x + 380 / W * bb.width, bb.y + 140 / H * bb.height); await p.mouse.down();
  await p.mouse.move(bb.x + 600 / W * bb.width, bb.y + 230 / H * bb.height, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(700);
}
async function run(p) {
  await p.keyboard.press('3'); await p.selectOption('#hz', '5'); await p.click('#btn-analyze');
  await p.waitForSelector('#panel-4:not([hidden])', { timeout: 60000 });
  await p.fill('#exp-title', 'Demo: Spannung und Strom'); await p.waitForTimeout(400);
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
let p = await ctx.newPage();
await prepare(p, { calibrate: false }); await p.screenshot({ path: out + '01-quelle.png' });
await prepare(p); await p.screenshot({ path: out + '02-geraete.png' });
await run(p); await p.selectOption('#xsel', { index: 1 }); await p.selectOption('#ysel', { index: 1 }); await p.waitForTimeout(400);
await p.screenshot({ path: out + '03-auswertung-kanal-ueber-kanal.png', fullPage: true });
await p.selectOption('#xsel', { value: 't' }); await p.selectOption('#ysel', { index: 0 }); await p.selectOption('#y2sel', { index: 2 }); await p.waitForTimeout(400);
await p.screenshot({ path: out + '04-auswertung-zeit-zwei-achsen.png', fullPage: true });
await p.keyboard.press('3'); await p.keyboard.press('b'); await p.waitForTimeout(500);
await p.screenshot({ path: out + '05-beamer-modus.png' });
await p.keyboard.press('b'); await p.selectOption('#theme', 'dark'); await p.keyboard.press('2'); await p.waitForTimeout(400);
await p.screenshot({ path: out + '06-dunkel.png' });

const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
p = await m.newPage(); await prepare(p); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
await p.screenshot({ path: out + '07-handy.png' });
await b.close();
console.log('Bilder geschrieben nach', out);
