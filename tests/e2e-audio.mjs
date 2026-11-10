// Mikrofon-Funktionen mit dem Demo-Ton: node tests/e2e-audio.mjs (setzt laufenden Vite-Server auf :5173 voraus)
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
await page.click('#btn-tone');
await page.waitForSelector('#panel-2:not([hidden])');
if (!(await page.locator('#micbox').isVisible())) throw new Error('Mikrofon-Bedienfeld fehlt');
if (await page.locator('#add-analog').isVisible()) throw new Error('Zeigerinstrument-Knopf sollte bei Tonquellen fehlen');
await page.check('#mic-level');
await page.waitForTimeout(600);
const live = (await page.locator('#audiolive').innerText()).replace(/\n+/g, ' | ');
console.log('Live:', live);
const f0 = Number((/([0-9]{3}),([0-9])/.exec(live) ?? [])[0]?.replace(',', '.'));
if (!(f0 > 320 && f0 < 560)) throw new Error('Frequenz in der Anzeige unplausibel: ' + live);

// 15 s live aufnehmen: Frequenz 440 Hz ± 110 Hz mit Periode 12 s
await page.click('#tab-3');
await page.selectOption('#hz', '10');
await page.click('#btn-live');
await page.waitForTimeout(15000);
await page.click('#btn-live');
await page.click('#tab-4');
const opts = await page.locator('#ysel option').allTextContents();
console.log('Größen:', opts);
if (!opts.includes('Frequenz') || !opts.includes('Pegel')) throw new Error('Kanäle fehlen');
await page.selectOption('#xsel', { value: 't' });
await page.selectOption('#ysel', { label: 'Frequenz' });
await page.selectOption('#fit-model', 'sine');
await page.waitForTimeout(500);
const fit = (await page.locator('#fit-result').innerText()).replace(/\n+/g, ' | ');
console.log('Fit:', fit);
const num = (name) => Number(new RegExp(`${name}\\s*\\|?\\s*(-?[0-9]+,[0-9]+)`).exec(fit)?.[1]?.replace(',', '.'));
const A = num('A'), w = num('ω'), C = num('C');
if (!(Math.abs(w - (2 * Math.PI) / 12) < 0.02)) throw new Error('ω weicht ab: ' + w);
if (!(Math.abs(A - 110) < 4)) throw new Error('Amplitude weicht ab: ' + A);
if (!(Math.abs(C - 440) < 3)) throw new Error('Mittelwert weicht ab: ' + C);
await page.screenshot({ path: process.env.SHOT ?? '/tmp/audio.png', fullPage: true });
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('AUDIO OK');
