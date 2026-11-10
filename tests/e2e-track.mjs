// Markerverfolgung mit der Demo-Pendelkugel: node tests/e2e-track.mjs (setzt laufenden Vite-Server auf :5173 voraus)
import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: 'reduce' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');

// Kugel im Bild suchen (dunkle Pixel im Bereich der Demo-Pendelkugel), Rechteck 56 × 56 darum ziehen
const W = 640, H = 360;
const find = () => page.evaluate(([w, h]) => {
  const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let sx = 0, sy = 0, n = 0;
  for (let y = 262; y < 330; y++) for (let x = 400; x < 600; x++) { const i = (y * w + x) * 4; if (d[i] < 60) { sx += x; sy += y; n++; } }
  return n ? { x: sx / n, y: sy / n } : null;
}, [W, H]);
const box = await page.locator('#view').boundingBox();
const toPage = (x, y) => [box.x + (x / W) * box.width, box.y + (y / H) * box.height];

await page.click('#trk-marker');
const c = await find();
if (!c) throw new Error('Pendelkugel im Bild nicht gefunden');
const [x0, y0] = toPage(c.x - 28, c.y - 28), [x1, y1] = toPage(c.x + 28, c.y + 28);
await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up();
const status = await page.locator('#trk-status').textContent();
console.log('Status:', status);
if (!/Marker gewählt/.test(status)) throw new Error('Marker wurde nicht übernommen: ' + status);

// Maßstab: 120 Bildpunkte = 0,6 m → 5 mm je Bildpunkt
await page.click('#trk-scale');
const [a1, b1] = toPage(440, 340), [a2, b2] = toPage(560, 340);
await page.mouse.click(a1, b1); await page.mouse.click(a2, b2);
await page.fill('#valdlg-input', '0,6'); await page.click('#valdlg button[value=ok]');
await page.waitForTimeout(200);
if (!/= 5 mm/.test(await page.locator('#trk-status').textContent())) throw new Error('Maßstab nicht übernommen: ' + await page.locator('#trk-status').textContent());

// Video auswerten (5 Hz)
await page.click('#tab-3');
await page.selectOption('#hz', '5');
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
const opts = await page.locator('#ysel option').allTextContents();
console.log('Größen:', opts);
if (!opts.includes('Marker x') || !opts.includes('Marker y')) throw new Error('Kanäle der Verfolgung fehlen');

// Sinus-Fit an x(t): Periode 4 s → ω = 2π/4 = 1,5708 1/s, Amplitude 80 px · 5 mm = 0,40 m
await page.selectOption('#xsel', { value: 't' });
await page.selectOption('#ysel', { label: 'Marker x' });
await page.selectOption('#fit-model', 'sine');
await page.waitForTimeout(400);
const fit = await page.locator('#fit-result').innerText();
console.log('Fit:', fit.replace(/\n+/g, ' | '));
const num = (name) => Number(new RegExp(`${name}\\s*\\|?\\s*(-?[0-9]+,[0-9]+)`).exec(fit.replace(/\n+/g, ' | '))?.[1]?.replace(',', '.'));
const omega = num('ω'), amp = num('A');
if (!(Math.abs(omega - 1.5708) < 0.03)) throw new Error('ω weicht ab: ' + omega);
if (!(Math.abs(amp - 0.4) < 0.02)) throw new Error('Amplitude weicht ab: ' + amp);
await page.screenshot({ path: process.env.SHOT ?? '/tmp/track.png', fullPage: true });
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('TRACK OK');
