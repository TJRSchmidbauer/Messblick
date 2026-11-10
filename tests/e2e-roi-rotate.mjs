// Anfasser zum Drehen des Rechtecks einer Digitalanzeige: node tests/e2e-roi-rotate.mjs (Vite-Server nötig)
import { chromium } from 'playwright';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' })).newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
const [W, H] = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
const at = async (x, y) => { await page.evaluate(() => window.scrollTo(0, 0)); const b = await page.locator('#view').boundingBox(); return [b.x + (x / W) * b.width, b.y + (y / H) * b.height]; };
await page.click('#add-digital');
const [ax, ay] = await at(380, 140), [bx, by] = await at(600, 230);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(500);
const angle = () => page.locator('.chan input[data-f="angle"]').inputValue();
if (await angle() !== '0') throw new Error('Winkel sollte 0 sein: ' + await angle());
// Anfasser über der Mitte der oberen Kante greifen und nach rechts oben ziehen (etwa 20° im Uhrzeigersinn)
const scale = await page.evaluate(() => { const v = document.getElementById('view'); return v.width / v.getBoundingClientRect().width; });
const [hx, hy] = await at(490, 140 - 28 * scale);
const cx = 490, cy = 185, r = 120, a = (20 * Math.PI) / 180;
const [tx, ty] = await at(cx + r * Math.sin(a), cy - r * Math.cos(a));
await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(400);
const got = Number(await angle());
console.log('Winkel nach Ziehen:', got);
if (Math.abs(got - 20) > 1.5) throw new Error('Anfasser dreht nicht wie erwartet: ' + got);
// Zahlenfeld und Anfasser hängen zusammen; Rückgängig stellt den alten Winkel wieder her
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
console.log('Nach Rückgängig:', await angle());
if (errors.length) throw new Error(errors.join('\n'));
await browser.close();
console.log('ROI-DREHEN OK');
