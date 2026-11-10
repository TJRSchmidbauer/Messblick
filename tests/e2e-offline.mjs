// Offline-Test: node tests/e2e-offline.mjs (setzt `npm run build` und `npx vite preview --port 4173` voraus)
import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url);
await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 15000 });
await page.waitForSelector('#offline-state:not([hidden])', { timeout: 15000 });
console.log('Online geladen, Hinweis:', await page.locator('#offline-state').textContent());

// Netz weg: Neuladen und Demo benutzen
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#btn-demo');
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
await page.click('#add-digital');
const b = await page.locator('#view').boundingBox();
const sx = b.x + (380 / 640) * b.width, sy = b.y + (140 / 360) * b.height;
await page.mouse.move(sx, sy); await page.mouse.down();
await page.mouse.move(sx + (220 / 640) * b.width, sy + (90 / 360) * b.height, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(700);
const live = await page.locator('.live-value').allTextContents();
console.log('Offline gelesen:', live);
if (!live.length || live.some((t) => t.startsWith('–'))) throw new Error('Offline: keine Ablesung');
// Anleitung offline: Seite und alle Bilder kommen aus dem Speicher
await page.goto(new URL('anleitung.html', url).href);
await page.waitForSelector('h2');
await page.waitForTimeout(500);
const imgs = await page.evaluate(() => [...document.images].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
console.log('Anleitung offline:', imgs.length, 'Bilder, defekt:', imgs.filter((i) => !i.ok).map((i) => i.src));
if (imgs.length < 15 || imgs.some((i) => !i.ok)) throw new Error('Anleitung offline unvollständig');
if ((await page.locator('#tpl-table tbody tr').count()) < 10) throw new Error('Vorlagen-Tabelle fehlt offline');
const manifest = await (await page.request.get(new URL('manifest.webmanifest', url).href)).json();
if (manifest.display !== 'standalone' || manifest.icons.length < 3) throw new Error('Manifest unvollständig');
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('OFFLINE OK');
