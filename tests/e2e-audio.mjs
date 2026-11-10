// Mikrofon-Funktionen mit dem Demo-Ton: node tests/e2e-audio.mjs (setzt laufenden Vite-Server auf :5173 voraus)
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

// Vorlagen für das Mikrofon: Stimmgabel (Zeitverlauf) und Resonanzrohr (Parameterreihe aus der Live-Frequenz)
await page.click('#tab-1');
await page.selectOption('#tpl-select', 'stimmgabel');
await page.click('#tpl-apply');
await page.click('#tab-4');
await page.fill('#tpl-in-fnenn', '440');
await page.waitForTimeout(400);
const tpl1 = (await page.locator('#tpl-results').innerText()).replace(/\n+/g, ' | ');
console.log('Stimmgabel:', tpl1.slice(0, 220));
if (!/Frequenz f/.test(tpl1) || !/Nennwert/.test(tpl1)) throw new Error('Stimmgabel-Ergebnis fehlt: ' + tpl1);
await page.click('#tab-1');
await page.selectOption('#tpl-select', 'resonanzrohr-offen');
await page.click('#tpl-apply');
await page.click('#tab-4');
if (!(await page.locator('#var-src option[value="mic-f"]').count())) throw new Error('Mikrofon fehlt als Quelle der Parameterreihe');
await page.selectOption('#var-src', 'mic-f');
for (const L of ['30', '40', '50']) {
  await page.fill('#var-p', L);
  await page.waitForTimeout(1200);
  await page.click('#var-take');
  const m = await page.locator('#var-msg').textContent();
  if (m) throw new Error('Messwert übernehmen: ' + m);
}
const tpl2 = (await page.locator('#tpl-results').innerText()).replace(/\n+/g, ' | ');
console.log('Resonanzrohr:', tpl2.slice(0, 260));
if (!/Schallgeschwindigkeit/.test(tpl2)) throw new Error('Resonanzrohr-Ergebnis fehlt: ' + tpl2);
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('AUDIO OK');
