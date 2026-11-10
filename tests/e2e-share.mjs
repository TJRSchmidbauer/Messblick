// Teilen ohne Vorlage, QR-Code mit Code, Scannen mit (vorgetäuschter) Kamera, ohne Internet und Server.
// node tests/e2e-share.mjs (Vite-Server :5173)
import { chromium } from 'playwright';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await keepUnfolded(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const check = (c, msg) => { if (!c) throw new Error(msg); };
const requests = [];
page.on('request', (r) => requests.push(r.url()));

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
await page.waitForTimeout(300);

// Gerät kalibrieren (Zeiger) und die Demo einmal komplett auswerten – ganz ohne Vorlage
const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg) => [d.cx + Math.cos((deg * Math.PI) / 180) * d.r, d.cy + Math.sin((deg * Math.PI) / 180) * d.r];
const click = async (x, y) => { const b = await page.locator('#view').boundingBox(); await page.mouse.click(b.x + (x / W) * b.width, b.y + (y / H) * b.height); };
const answer = async (v) => { await page.locator('#valdlg-input').fill(v); await page.click('#valdlg button[value=ok]'); };
await page.click('#add-analog');
await click(d.cx, d.cy); await click(...pt(135)); await answer('0'); await click(...pt(45)); await answer('10');
await page.click('#tab-3'); await page.selectOption('#hz', '5'); await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
await page.waitForTimeout(500);

// 1) Ohne Vorlage und ohne Fit: Mittelwerte werden geteilt
check(!(await page.locator('#class-qr').isDisabled()), 'QR-Knopf ist ohne Vorlage gesperrt');
check(/Mittelwerte der Messgrößen/.test(await page.locator('#class-share-msg').textContent()), 'Hinweis auf Mittelwerte fehlt: ' + await page.locator('#class-share-msg').textContent());
// 2) Mit Fit: Fitparameter
await page.selectOption('#fit-model', 'sine');
await page.waitForTimeout(600);
check(/Fitergebnis/.test(await page.locator('#class-share-msg').textContent()), 'Fitergebnis wird nicht angeboten');

// 3) Gruppe zeigt den QR-Code (nur Code, kein Link)
await page.fill('#class-group', 'Gruppe Blau');
await page.click('#class-qr');
check(await page.locator('#class-qr-out svg').count() === 1, 'QR-Code fehlt');
const svgHtml = await page.locator('#class-qr-out').innerHTML();
check(/ohne Internet und ohne Server/.test(svgHtml), 'Hinweis zum Offline-Weg fehlt');

// 4) Lehrkraft-Seite: scannt diesen QR mit einer vorgetäuschten Kamera (Canvas-Stream); nur jsQR, ohne Internet
const teacher = await ctx.newPage();
await keepUnfolded(teacher);
teacher.on('pageerror', (e) => errors.push('Lehrkraft: ' + e.message));
await teacher.addInitScript(() => { window.__forceJsQr = true; });
await teacher.goto(url);
await teacher.evaluate(() => localStorage.clear());
await teacher.reload();
// QR-Bild der Gruppe in die Lehrkraft-Seite holen: der Code steht im Gruppen-Feld nicht, daher aus dem SVG-Pfad neu rendern
await page.click('#class-copy-code');
await page.waitForFunction(() => /kopiert|Feld/.test(document.getElementById('class-share-msg').textContent));
const groupCode = (await page.inputValue('#class-text')).match(/PMW1\.[A-Za-z0-9_-]+/)?.[0] ?? await page.evaluate(() => navigator.clipboard.readText());
check(/^PMW1\./.test(groupCode), 'Kein Code erzeugt');
await teacher.evaluate(async (c) => {
  const m = await import('/src/ui/qr.ts');
  const svg = m.qrSvg(m.encodeQr(c));
  const img = new Image();
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = 520; cv.height = 520;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 520, 520); g.drawImage(img, 0, 0, 520, 520);
  const stream = cv.captureStream(10);
  setInterval(() => g.drawImage(img, 0, 0, 520, 520), 100); // das „Bild“ bleibt in Bewegung
  navigator.mediaDevices.getUserMedia = async () => stream;
}, groupCode);
await teacher.click('#tab-4');
await teacher.click('#class-scan');
await teacher.waitForFunction(() => /PMW1\./.test(document.getElementById('class-text').value), null, { timeout: 20000 });
await teacher.waitForTimeout(800); // der Code bleibt im Bild: weitere Treffer müssen abgefangen werden
const st = await teacher.locator('#scan-status').textContent();
console.log('Scan:', st);
check(/Gruppe Blau/.test(st) && /schon erfasst|Übernommen/.test(st), 'Status passt nicht: ' + st);
await teacher.click('#scan-close');
const out = await teacher.locator('#class-out').innerText();
console.log(out.replace(/\n+/g, ' | ').slice(0, 220));
check(/Gruppe Blau/.test(out) && /Mittelwert von 1 Gruppe/.test(out), 'Klassenansicht zeigt die gescannte Gruppe nicht');
check((await teacher.locator('#class-text').inputValue()).match(/PMW1\./g).length === 1, 'Code mehrfach eingetragen');
// Kein Netzwerkverkehr nach außen: alles blieb auf dem lokalen Server
check(requests.every((u) => u.startsWith(url) || u.startsWith('data:') || u.startsWith('blob:')), 'Externe Anfrage: ' + requests.filter((u) => !u.startsWith(url)).join(', '));
check(errors.length === 0, 'Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('SHARE OK');
