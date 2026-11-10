// Bild drehen: Videodatei, die im Bild quer liegt, lässt sich um 90° drehen. Braucht ffmpeg. node tests/e2e-rotate.mjs (Vite :5173)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const tmp = fs.mkdtempSync(os.tmpdir() + '/mb-rot-');
const file = tmp + '/halb.mp4';
try {
  // links weiß, rechts schwarz, oben ein roter Streifen links
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:r=30:d=2', '-vf', 'drawbox=x=160:y=0:w=160:h=240:color=black:t=fill,drawbox=x=0:y=0:w=60:h=240:color=red:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', file]);
} catch { console.log('ROTATE übersprungen (ffmpeg fehlt)'); process.exit(0); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 950 } })).newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const check = (c, msg) => { if (!c) throw new Error(msg); };
const px = (x, y) => page.evaluate(([x, y]) => { const c = document.getElementById('view'); const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
check(!(await page.locator('#btn-rotate').isVisible()), 'Drehknopf ohne Quelle sichtbar');
await page.setInputFiles('#file', file);
await page.waitForSelector('#panel-2:not([hidden])', { timeout: 30000 });
await page.waitForTimeout(800);
check(await page.locator('#btn-rotate').isVisible(), 'Drehknopf fehlt bei Videodatei');
let [w, h] = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
check(w === 320 && h === 240, `Ausgangsgröße ${w}×${h}`);
check((await px(10, 120))[0] > 200 && (await px(10, 120))[1] < 60, 'rot links fehlt'); // roter Streifen links
check((await px(100, 120))[0] > 200 && (await px(100, 120))[1] > 200, 'weiß fehlt');
check((await px(250, 120))[0] < 40, 'schwarz fehlt');
// 90° im Uhrzeigersinn: links wird oben
await page.click('#btn-rotate');
await page.waitForTimeout(500);
[w, h] = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
check(w === 240 && h === 320, `Größe nach 90°: ${w}×${h}`);
const top = await px(120, 10), mid = await px(120, 100), bottom = await px(120, 250);
check(top[0] > 200 && top[1] < 60, 'rot nicht oben: ' + top);
check(mid[0] > 200 && mid[1] > 200, 'weiß nicht in der Mitte oben: ' + mid);
check(bottom[0] < 40, 'schwarz nicht unten: ' + bottom);
check(/gedreht um 90°/.test(await page.locator('#rotate-state').textContent()), 'Anzeige „gedreht“ fehlt');
// 180°: rot unten
await page.click('#btn-rotate'); await page.waitForTimeout(400);
[w, h] = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
check(w === 320 && h === 240, `Größe nach 180°: ${w}×${h}`);
check((await px(310, 120))[0] > 200 && (await px(310, 120))[1] < 60, 'rot nach 180° nicht rechts: ' + await px(310, 120));
// 90° gegen den Uhrzeigersinn (von 180° aus: 90°): rot unten statt oben
await page.click('#btn-rotate-ccw'); await page.waitForTimeout(400);
check(/gedreht um 90°/.test(await page.locator('#rotate-state').textContent()), 'Linksdrehung von 180° ergibt nicht 90°');
// Kalibrierung wird beim Drehen verworfen
await page.click('#btn-rotate'); await page.waitForTimeout(300);
await page.click('#add-digital');
const b = await page.locator('#view').boundingBox();
await page.mouse.move(b.x + 50, b.y + 50); await page.mouse.down(); await page.mouse.move(b.x + 200, b.y + 150, { steps: 3 }); await page.mouse.up();
check((await page.locator('.chan').count()) === 1, 'Gerät nicht angelegt');
await page.click('#btn-rotate'); await page.waitForTimeout(300);
check((await page.locator('.chan').count()) === 0, 'Gerät nach dem Drehen noch da');
check(errors.length === 0, 'Fehler: ' + errors.join(' | '));
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ROTATE OK');
