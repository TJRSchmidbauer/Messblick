// Update-Weg: Nutzer hat Version A, es erscheint Version B. Nach EINEM Neuladen muss B zu sehen sein (nicht erst nach zwei).
// Baut zwei Stände und ruft einen kleinen Webserver ab. node tests/e2e-update.mjs (setzt npm install voraus)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-update-'));
const build = (sha, out) => execSync(`npx vite build --outDir ${out}`, { env: { ...process.env, GITHUB_SHA: sha.repeat(7) }, stdio: 'ignore' });
build('a', path.join(tmp, 'A')); build('b', path.join(tmp, 'B'));
const live = path.join(tmp, 'live');
const copy = (from) => { fs.rmSync(live, { recursive: true, force: true }); fs.cpSync(from, live, { recursive: true }); };
copy(path.join(tmp, 'A'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(live, p);
  if (!f.startsWith(live) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=3600' }); // wie GitHub Pages: der Browser darf zwischenspeichern
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext()).newPage();
const check = (c, msg) => { if (!c) throw new Error(msg); };
const buildId = async () => (await page.locator('#build-id').textContent()) ?? '';
await page.goto(url);
await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
await page.reload();
check(/aaaaaaa/.test(await buildId()), 'Version A nicht sichtbar: ' + await buildId());

// B wird veröffentlicht; der Nutzer lädt EINMAL neu
copy(path.join(tmp, 'B'));
await page.reload();
await page.waitForTimeout(4000); // die neue Version legt sich im Hintergrund in den Speicher
check(/bbbbbbb/.test(await buildId()), 'Nach einem Neuladen noch die alte Version: ' + await buildId());

// Offline funktioniert weiter (gespeicherte Seite)
await page.context().setOffline(true);
await page.reload();
check(/bbbbbbb/.test(await buildId()), 'Offline-Start zeigt nicht die zuletzt geladene Version: ' + await buildId());
await page.context().setOffline(false);

// Läuft die Seite schon, während B auftaucht: ohne begonnene Arbeit lädt sie sich selbst neu
copy(path.join(tmp, 'A'));
await page.reload(); await page.waitForTimeout(1200);
check(/aaaaaaa/.test(await buildId()), 'Zurück auf A fehlgeschlagen: ' + await buildId());
copy(path.join(tmp, 'B'));
await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
await page.waitForFunction(() => /bbbbbbb/.test(document.getElementById('build-id')?.textContent ?? ''), null, { timeout: 15000 });
await browser.close(); server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('UPDATE OK');
