// Erzeugt public/og.png (1200×630), das Vorschaubild für geteilte Links. node tests/og-image.mjs (Vite-Server, URL anpassbar)
import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })).newPage();
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
await page.waitForTimeout(300);

// Zeigerinstrument der Demo kalibrieren, damit das Bild die App bei der Arbeit zeigt
const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg) => [d.cx + Math.cos((deg * Math.PI) / 180) * d.r, d.cy + Math.sin((deg * Math.PI) / 180) * d.r];
const click = async (x, y) => { const b = await page.locator('#view').boundingBox(); await page.mouse.click(b.x + (x / W) * b.width, b.y + (y / H) * b.height); };
const answer = async (v) => { await page.locator('#valdlg-input').fill(v); await page.click('#valdlg button[value=ok]'); };
await page.click('#add-analog');
await click(d.cx, d.cy); await click(...pt(135)); await answer('0'); await click(...pt(45)); await answer('10');
await page.waitForTimeout(600);
const shot = (await page.locator('#view').screenshot({ type: 'png' })).toString('base64');
const value = (await page.locator('#livecards').innerText()).split('\n').slice(1, 2).join('').trim().replace(/^([-0-9,]+)\s*([^0-9,]+)$/, '$1 $2');

// Karte in derselben Seite aufbauen: so gelten Schriften und Farben der App
await page.evaluate(({ shot, value }) => {
  document.body.className = '';
  document.body.innerHTML = `
  <div id="og" style="position:fixed;inset:0;width:1200px;height:630px;background:var(--shell);color:var(--shell-ink);display:grid;grid-template-columns:1fr 520px;gap:48px;align-items:center;padding:56px 64px;box-sizing:border-box;font-family:'Atkinson Hyperlegible',system-ui,sans-serif;z-index:99999">
    <div>
      <div style="display:flex;align-items:baseline;gap:18px">
        <span style="font:700 64px/1 'Space Grotesk',sans-serif;letter-spacing:-.04em">ts<i style="font-style:normal;color:var(--brand-ziegel)">.</i></span>
        <span style="font:700 84px/1 'Space Grotesk',sans-serif;letter-spacing:-.02em">Messblick</span>
      </div>
      <p style="font:700 38px/1.2 'Space Grotesk',sans-serif;margin:26px 0 18px">Messgeräte mit der Kamera ablesen.</p>
      <p style="font-size:27px;line-height:1.4;margin:0 0 26px">Graph, Fit und Protokoll für den Physikunterricht. Kostenlos im Browser.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:22px;font-weight:700">
        ${['ohne Konto', 'ohne Datenübertragung', 'offline nutzbar'].map((t) => `<span style="border:2.5px solid var(--shell-ink);border-radius:999px;padding:6px 18px">${t}</span>`).join('')}
      </div>
    </div>
    <div style="background:var(--brand-creme,#FBF4EC);border:3px solid var(--shell-ink);border-radius:22px;padding:18px;box-shadow:10px 10px 0 var(--shell-ink)">
      <img src="data:image/png;base64,${shot}" style="display:block;width:100%;border-radius:12px;border:2px solid #2E2A28" />
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;color:#2E2A28">
        <span style="font-size:22px">abgelesen</span>
        <span style="font:700 46px/1 'JetBrains Mono Variable','JetBrains Mono',monospace">${value}</span>
      </div>
    </div>
  </div>`;
}, { shot, value });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.locator('#og').screenshot({ path: process.env.OUT ?? 'public/og.png', type: 'png' });
await browser.close();
console.log('OG OK', value);
