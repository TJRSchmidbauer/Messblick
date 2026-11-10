// Videodatei: Auswertung durch Abspielen (schnell) statt Springen, Standardrate 30, Hinweis zur Punktzahl.
// Braucht ffmpeg (erzeugt ein kurzes Testvideo mit sinusförmig wechselnder Helligkeit). node tests/e2e-video.mjs (Vite :5173)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const tmp = fs.mkdtempSync(os.tmpdir() + '/mb-video-');
const file = tmp + '/hell.mp4';
try {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=320x240:r=30:d=6', '-vf', "geq=lum='128+100*sin(2*PI*T/2)':cb=128:cr=128", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '60', file]);
} catch { console.log('VIDEO übersprungen (ffmpeg fehlt)'); process.exit(0); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true })).newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (c, msg) => { if (!c) throw new Error(msg); };
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.setInputFiles('#file', file);
await page.waitForSelector('#panel-2:not([hidden])', { timeout: 30000 });
await page.waitForTimeout(800);
// Lichtschranken-Zone über das ganze Bild: Helligkeit des Bildes als Messgröße
await page.click('#gate-zone');
const b = await page.locator('#view').boundingBox();
await page.mouse.move(b.x + 10, b.y + 10); await page.mouse.down(); await page.mouse.move(b.x + b.width - 10, b.y + b.height - 10, { steps: 4 }); await page.mouse.up();
await page.click('#tab-3');
check((await page.inputValue('#hz')) === '30', 'Standardrate für Videodateien ist nicht 30: ' + await page.inputValue('#hz'));
check(/etwa 181 Messpunkte/.test(await page.locator('#rate-info').textContent()), 'Hinweis zur Punktzahl fehlt: ' + await page.locator('#rate-info').textContent());
await page.selectOption('#hz', '2');
check(/glatten Graphen/.test(await page.locator('#rate-info').textContent()), 'Hinweis zu niedriger Rate fehlt');
await page.selectOption('#hz', '30');
const t0 = Date.now();
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
const secs = (Date.now() - t0) / 1000;
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv')]);
const rows = fs.readFileSync(await csv.path(), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(';').map((x) => Number(x.replace(',', '.'))));
console.log(`Auswertung: ${rows.length} Messpunkte in ${secs.toFixed(1)} s (Video 6 s)`);
check(rows.length >= 170 && rows.length <= 186, 'Anzahl der Messpunkte: ' + rows.length);
const dts = rows.slice(1).map((r, i) => r[0] - rows[i][0]);
check(dts.every((d) => d > 0), 'Zeiten nicht aufsteigend');
check(Math.max(...dts) < 0.1, 'Lücke in den Messpunkten: ' + Math.max(...dts));
const med = [...dts].sort((x, y) => x - y)[dts.length >> 1];
check(Math.abs(med - 1 / 30) < 0.004, 'Abstand der Messpunkte ' + med);
// Helligkeit folgt grob 0,5 + 0,39·sin(2π t/2); das Videoformat (begrenzter Wertebereich) verschiebt es etwas, daher die Toleranz
const worst = Math.max(...rows.filter((r) => Number.isFinite(r[1])).map(([t, v]) => Math.abs(v - (0.502 + 0.392 * Math.sin((2 * Math.PI * t) / 2)))));
console.log('Größte Abweichung der Helligkeit vom Sollverlauf:', worst.toFixed(3));
check(worst < 0.1,  'Helligkeitsverlauf stimmt nicht: ' + worst);
check(errors.length === 0, 'Fehler: ' + errors.join(' | '));
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('VIDEO OK');
