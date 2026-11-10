// Klassenansicht: Code aus einer Vorlage erzeugen, mehrere Gruppen einfügen, Link öffnen. node tests/e2e-class.mjs (Vite :5173)
import { chromium } from 'playwright';
import { keepUnfolded } from './helpers.mjs';
const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

// Codes dreier Gruppen von Hand bauen (so wie die App sie erzeugt) und einfügen
const mk = (group, v, s) => page.evaluate(([g, v, s]) => {
  const b = new TextEncoder().encode(JSON.stringify(['fadenpendel', g, [['Fallbeschleunigung g', 'm/s²', v, s]]]));
  return 'PMW1.' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}, [group, v, s]);
const codes = [await mk('Gruppe 1', 9.7, 0.1), await mk('Gruppe 2', 9.9, 0.2), await mk('Gruppe 3', 9.75, 0.15)];
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
await page.click('#tab-4');
await page.locator('#classbox > summary').click();
await page.fill('#class-text', codes.join('\n'));
const out = await page.locator('#class-out').innerText();
console.log(out.replace(/\n+/g, ' | '));
if (!/Gruppe 1/.test(out) || !/Mittelwert von 3 Gruppen/.test(out) || !/9,78/.test(out)) throw new Error('Zusammenfassung falsch: ' + out);
await page.fill('#class-text', 'Quatsch PMW1.@@@');
if (!/Kein gültiger Code/.test(await page.locator('#class-out').innerText())) throw new Error('Fehlermeldung fehlt');

// Link öffnen: Code landet im Feld
const p2 = await ctx.newPage();
await p2.goto(url + '#pmw=' + codes[1]);
await p2.waitForSelector('#panel-4:not([hidden])');
if (!(await p2.locator('#class-text').inputValue()).includes(codes[1])) throw new Error('Link wurde nicht übernommen');
if (new URL(p2.url()).hash) throw new Error('Hash bleibt stehen');
// Code der eigenen Gruppe: aus einer Vorlage mit Ergebnis
await page.fill('#class-text', '');
if (errors.length) throw new Error('Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('CLASS OK');
