// Zeigerinstrument mit verdecktem Drehpunkt: drei Skalenstriche statt Drehpunkt; Warnung bei falsch gesetztem Drehpunkt.
// node tests/e2e-pivot.mjs (Vite-Server :5173)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (c, msg) => { if (!c) throw new Error(msg); };
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
await page.waitForTimeout(300);

const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg, r = d.r) => [d.cx + Math.cos((deg * Math.PI) / 180) * r, d.cy + Math.sin((deg * Math.PI) / 180) * r];
const click = async (x, y) => { const b = await page.locator('#view').boundingBox(); await page.mouse.click(b.x + (x / W) * b.width, b.y + (y / H) * b.height); };
const answer = async (v) => { await page.locator('#valdlg-input').fill(v); await page.click('#valdlg button[value=ok]'); };
const hint = () => page.locator('#hint').textContent();

// 1) Falscher Drehpunkt (neben dem echten): die App warnt
await page.click('#add-analog');
await click(d.cx + 35, d.cy - 40); await click(...pt(135)); await answer('0'); await click(...pt(45)); await answer('10');
check(/passt nicht zu den Skalenstrichen/.test(await hint()), 'Keine Warnung bei falschem Drehpunkt: ' + await hint());

// 2) „Drehpunkt verdeckt“: drei Skalenstriche, Drehpunkt wird berechnet, Bogen (270°) automatisch erkannt
await page.locator('.chan input[data-f="pivotHidden"]').check();
check(/Skalenstrich/.test(await hint()), 'Ablauf startet nicht mit einem Skalenstrich: ' + await hint());
await click(...pt(135)); await answer('0');
await click(...pt(45)); await answer('10');
check(/Mitte der Skala/.test(await hint()), 'Dritter Schritt fehlt: ' + await hint());
await click(...pt(270));
await page.waitForTimeout(400);
check(/Erkannt: Skala größer als 180°/.test(await hint()), 'Bogen nicht erkannt: ' + await hint());
check(await page.locator('.chan input[data-f="bigArc"]').isChecked(), 'Häkchen „größer als 180°“ nicht gesetzt');

// 3) Auswerten und mit dem bekannten Verlauf der Demo vergleichen (5 + 4·sin(t/3))
await page.click('#tab-3'); await page.selectOption('#hz', '5'); await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
const rows = fs.readFileSync(await csv.path(), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(';').map((x) => Number(x.replace(',', '.'))));
const worst = Math.max(...rows.filter((r) => Number.isFinite(r[1])).map(([t, u]) => Math.abs(u - (5 + 4 * Math.sin(t / 3)))));
console.log('Größter Fehler mit verdecktem Drehpunkt:', worst.toFixed(3), 'V');
check(worst < 0.15, 'Ablesung mit berechnetem Drehpunkt zu ungenau: ' + worst);

// 4) Einstellung bleibt nach dem Neuladen erhalten
await page.waitForTimeout(1200);
await page.reload();
await page.click('#tab-2');
check(await page.locator('.chan input[data-f="pivotHidden"]').isChecked(), 'Einstellung „Drehpunkt verdeckt“ geht beim Neuladen verloren');
check(errors.length === 0, 'Fehler: ' + errors.join(' | '));
await browser.close();
console.log('PIVOT OK');
