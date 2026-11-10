// Erzeugt die Bilder der Anleitung (public/anleitung-bilder/*.jpg) aus der laufenden App mit der Demo-Quelle.
// Aufruf: node tests/guide-screenshots.mjs   (Vite-Dev-Server auf :5173 nötig; CHROMIUM_PATH optional)
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.URL ?? 'http://localhost:5173/';
const out = new URL('../public/anleitung-bilder/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const W = 640, H = 360, d = { cx: 190, cy: 220, r: 120 };
const pt = (deg) => [(d.cx + Math.cos((deg * Math.PI) / 180) * d.r), (d.cy + Math.sin((deg * Math.PI) / 180) * d.r)];

const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Seitenkoordinaten eines Bildpunkts im Kamerabild (Demo: 640 × 360). */
const viewPt = async (x, y) => {
  const b = await page.locator('#view').boundingBox();
  const sy = await page.evaluate(() => window.scrollY);
  return { x: b.x + (x / W) * b.width, y: b.y + sy + (y / H) * b.height, px: b.x + (x / W) * b.width, py: b.y + (y / H) * b.height };
};
const mouseTo = async (x, y) => { const p = await viewPt(x, y); return [p.px, p.py]; };
const click = async (x, y) => { const [px, py] = await mouseTo(x, y); await page.mouse.click(px, py); };
const answer = async (v) => { await page.locator('#valdlg-input').fill(v); await page.click('#valdlg button[value=ok]'); };

/** Nummerierte Markierung an einer Seitenstelle (Seitenkoordinaten). */
const badgeAt = (x, y, n) => page.evaluate(([x, y, n]) => {
  const b = document.createElement('div');
  b.className = '__badge'; b.textContent = String(n);
  b.style.cssText = `position:absolute;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;background:#E8836B;color:#2E2A28;font:700 15px system-ui,sans-serif;display:grid;place-items:center;border:2px solid #2E2A28;z-index:99999;pointer-events:none`;
  document.body.appendChild(b);
}, [x, y, n]);
/** Markierung links oben an einem Element. */
const badge = async (sel, n, dx = -6, dy = -6, nth = 0) => {
  const r = await page.evaluate(([sel, nth]) => { const e = document.querySelectorAll(sel)[nth]; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY }; }, [sel, nth]);
  await badgeAt(r.x + dx, r.y + dy, n);
};
const badgeView = async (x, y, n) => { const p = await viewPt(x, y); await badgeAt(p.x, p.y, n); };
const clearBadges = () => page.evaluate(() => document.querySelectorAll('.__badge').forEach((b) => b.remove()));

/** Bild eines Elements samt Rand (Seitenkoordinaten, auch wenn es höher als der Bildschirm ist). */
const shot = async (name, sel, pad = 14, nth = 0) => {
  const r = await page.evaluate(([sel, nth]) => { const e = document.querySelectorAll(sel)[nth]; const r = e.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }; }, [sel, nth]);
  await page.screenshot({ path: `${out}${name}.jpg`, type: 'jpeg', quality: 80, fullPage: true, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad } });
  await clearBadges();
  console.log('Bild', name);
};
/** Bild eines Seitenbereichs (links oben x, y; Breite, Höhe) in Seitenkoordinaten. */
const shotRect = async (name, x, y, w, h) => {
  await page.screenshot({ path: `${out}${name}.jpg`, type: 'jpeg', quality: 80, fullPage: true, clip: { x, y, width: w, height: h } });
  await clearBadges();
  console.log('Bild', name);
};

// ---- 1 Quelle -------------------------------------------------------------------------
await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();
await badge('#btn-camera', 1); await badge('#file + *, label.choice:nth-of-type(1)', 2).catch(() => {});
await badge('#btn-demo', 3); await badge('#tpl-select', 4);
await shot('01-quelle', '#panel-1', 12);

// ---- 2 Zeigerinstrument -----------------------------------------------------------------
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
await page.click('#add-analog');
await click(d.cx, d.cy); await click(...pt(135)); await answer('0'); await click(...pt(45)); await answer('10');
await page.waitForTimeout(500);
const v0 = await viewPt(0, 0);
await badgeView(d.cx + 16, d.cy + 16, 1); await badgeView(...pt(135).map((v, i) => v + (i ? 18 : -18)), 2); await badgeView(...pt(45).map((v, i) => v + (i ? 18 : 18)), 3);
const vb = await page.locator('#view').boundingBox();
const sy0 = await page.evaluate(() => window.scrollY);
await shotRect('02-zeigerinstrument', vb.x - 8, vb.y + sy0 - 8, vb.width + 16, vb.height + 16);

// ---- 3 Digitalanzeige -----------------------------------------------------------------
await page.click('#add-digital');
{
  const [ax, ay] = await mouseTo(380, 140), [bx, by] = await mouseTo(600, 230);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 5 }); await page.mouse.up();
}
await page.waitForTimeout(700);
await badgeView(372, 134, 1);
await shotRect('03-digital', vb.x - 8, vb.y + sy0 - 8, vb.width + 16, vb.height + 16);

// ---- 4 Gerätekarte: Schrift, anlernen, Unsicherheit --------------------------------------------
await badge('.chan:nth-of-type(2) select[data-f=style]', 1, -4, -8);
await badge('.chan:nth-of-type(2) select[data-f=umode]', 2, -4, -8);
await badge('.chan:nth-of-type(2) button[data-act=learn]', 3, -6, -6);
await shot('04-geraetekarte', '.chan:nth-of-type(2)', 18);
await page.selectOption('.chan:nth-of-type(1) select[data-f=umode]', 'class');
await page.fill('.chan:nth-of-type(1) input[data-f=ua]', '1,5'); await page.fill('.chan:nth-of-type(1) input[data-f=ub]', '10');
await badge('.chan:nth-of-type(1) select[data-f=umode]', 1, -4, -8); await badge('.chan:nth-of-type(1) input[data-f=ua]', 2, -4, -8); await badge('.chan:nth-of-type(1) input[data-f=ub]', 3, -4, -8);
await shot('05-unsicherheit', '.chan:nth-of-type(1)', 18);

// ---- 5 Marker und Lichtschranke -----------------------------------------------------------
await page.click('#trk-marker');
const ball = await page.evaluate(([w, h]) => {
  const c = document.getElementById('view'), dd = c.getContext('2d').getImageData(0, 0, w, h).data;
  let sx = 0, sy = 0, n = 0;
  for (let y = 262; y < 330; y++) for (let x = 400; x < 600; x++) { const i = (y * w + x) * 4; if (dd[i] < 60) { sx += x; sy += y; n++; } }
  return { x: sx / n, y: sy / n };
}, [W, H]);
{
  const [ax, ay] = await mouseTo(ball.x - 28, ball.y - 28), [bx, by] = await mouseTo(ball.x + 28, ball.y + 28);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 4 }); await page.mouse.up();
}
await page.click('#trk-scale');
await click(440, 340); await click(560, 340); await answer('0,6');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
const vb6 = await page.locator('#view').boundingBox();
await badgeView(ball.x - 36, ball.y - 36, 1); await badgeView(440, 330, 2); await badgeView(560, 330, 3);
await shotRect('06-marker', vb6.x - 8, vb6.y - 8, vb6.width + 16, vb6.height + 16);
await badge('#trk-marker', 1); await badge('#trk-scale', 2);
await shot('07-trackbox', '#trackbox', 14);
await page.click('#trk-remove');
await page.click('#gate-zone');
{
  const [ax, ay] = await mouseTo(494, 276), [bx, by] = await mouseTo(506, 308);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 3 }); await page.mouse.up();
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await badgeView(526, 266, 1);
await shotRect('06b-lichtschranke', vb6.x - 8, vb6.y - 8, vb6.width + 16, vb6.height + 16);
await badge('#gate-zone', 1); await shot('07b-gatebox', '#gatebox', 14);

// ---- 6 Messen und Vorhersage --------------------------------------------------------------
await page.click('#gate-remove');
await page.click('#tab-3');
await page.selectOption('#hz', '5');
await page.click('#pred-box summary');
await page.selectOption('#pred-x', 't'); await page.selectOption('#pred-y', { index: 0 });
await page.fill('#pred-xmax', '30'); await page.fill('#pred-ymax', '10');
await page.locator('#pred-canvas').scrollIntoViewIfNeeded();
{
  const pb = await page.locator('#pred-canvas').boundingBox();
  await page.mouse.move(pb.x + pb.width * 0.12, pb.y + pb.height * 0.5); await page.mouse.down();
  for (let i = 0; i <= 40; i++) { const f = i / 40; await page.mouse.move(pb.x + pb.width * (0.12 + 0.84 * f), pb.y + pb.height * (0.5 - 0.33 * Math.sin(f * Math.PI * 2 * 1.6))); }
  await page.mouse.up();
}
await badge('#hz', 1, -4, -8); await badge('#btn-analyze', 2); await badge('#pred-canvas', 3, 8, 8);
await shot('08-messen', '#panel-3', 12);

// ---- 7 Auswertung -----------------------------------------------------------------------
await page.click('#btn-analyze');
await page.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
await page.selectOption('#xsel', { value: 't' }); await page.selectOption('#ysel', { index: 0 });
await page.selectOption('#fit-model', 'sine');
await page.waitForTimeout(500);
await badge('#xsel', 1, -18, -12); await badge('#fit-model', 2, -4, -8); await badge('#fit-result', 3, -10, -10);
await badge('#chart', 4, 40, 10);
{
  const r = await page.evaluate(() => { const a = document.querySelector('#xsel').getBoundingClientRect(), b = document.querySelector('#fit-result').getBoundingClientRect(); return { x: a.left + scrollX, y: a.top + scrollY, bottom: b.bottom + scrollY }; });
  const pr = await page.evaluate(() => { const e = document.querySelector('#panel-4').getBoundingClientRect(); return { x: e.left + scrollX, w: e.width }; });
  await shotRect('09-auswertung', pr.x, r.y - 60, pr.w, r.bottom - r.y + 160);
}

// ---- 7b Barrierefreiheit: Graph hören, Beschreibung, Tastatur --------------------------------
await page.locator('#chart').scrollIntoViewIfNeeded();
await page.focus('#chart');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
await badge('#chart', 1, 36, 6); await badge('#graph-listen', 2); await badge('#graph-speak', 3); await badge('#graph-desc-box summary', 4, -10, -2);
{
  const r = await page.evaluate(() => { const a = document.querySelector('#chart').getBoundingClientRect(), b = document.querySelector('#graph-desc-box').getBoundingClientRect(), p = document.querySelector('#panel-4').getBoundingClientRect(); return { x: p.left + scrollX, w: p.width, y: a.top + scrollY, bottom: b.bottom + scrollY }; });
  await shotRect('17-barrierefrei', r.x, r.y - 24, r.w, r.bottom - r.y + 48);
}

// ---- 8 Neue Größe und Fit-Leiste ------------------------------------------------------------
await page.click('#derive-new');
await page.fill('#derivedlg-expr', 'Gerät_1*Gerät_2'); await page.fill('#derivedlg-name', 'Leistung'); await page.fill('#derivedlg-unit', 'W');
await badge('#derivedlg-kind', 1, -4, -8); await badge('#derivedlg-expr', 2, -4, -8); await badge('#derivedlg-name', 3, -4, -8);
await shot('10-neue-groesse', '#derivedlg', 14);
await page.click('#derivedlg button[value=ok]');
await page.selectOption('#fit-model', '');

// ---- 9 Vorlage Ohmsches Gesetz: eigener Ablauf, Strom (Digitalanzeige) zuerst, dann Spannung (Zeiger) ----
{
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' }); // eigener Speicher: kein Zustand von der ersten Seite
  const p2 = await ctx2.newPage();
  const m2 = async (x, y) => { const b2 = await p2.locator('#view').boundingBox(); return [b2.x + (x / W) * b2.width, b2.y + (y / H) * b2.height]; };
  await p2.goto(url); await p2.evaluate(() => localStorage.clear()); await p2.reload();
  await p2.click('#btn-demo'); await p2.waitForSelector('#panel-2:not([hidden])');
  await p2.click('#add-digital');
  { const [ax, ay] = await m2(380, 140), [bx, by] = await m2(600, 230); await p2.mouse.move(ax, ay); await p2.mouse.down(); await p2.mouse.move(bx, by, { steps: 5 }); await p2.mouse.up(); }
  await p2.click('#add-analog');
  for (const [pos, val] of [[[d.cx, d.cy], null], [pt(135), '0'], [pt(45), '10']]) { const [x, y] = await m2(...pos); await p2.mouse.click(x, y); if (val !== null) { await p2.locator('#valdlg-input').fill(val); await p2.click('#valdlg button[value=ok]'); } }
  await p2.click('#tab-3'); await p2.selectOption('#hz', '5'); await p2.click('#btn-analyze');
  await p2.waitForSelector('#panel-4:not([hidden])', { timeout: 120000 });
  await p2.click('#tab-1');
  await p2.selectOption('#tpl-select', 'ohm');
  const swap = { page, shot, badge };
  // Hilfsfunktionen auf p2 umbiegen
  const badge2 = async (sel, n, dx = -6, dy = -6) => {
    const r = await p2.evaluate((sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY }; }, sel);
    await p2.evaluate(([x, y, n]) => { const b = document.createElement('div'); b.className = '__badge'; b.textContent = String(n); b.style.cssText = `position:absolute;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;background:#E8836B;color:#2E2A28;font:700 15px system-ui,sans-serif;display:grid;place-items:center;border:2px solid #2E2A28;z-index:99999;pointer-events:none`; document.body.appendChild(b); }, [r.x + dx, r.y + dy, n]);
  };
  const shot2 = async (name, sel, pad = 14) => {
    const r = await p2.evaluate((sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }, sel);
    await p2.screenshot({ path: `${out}${name}.jpg`, type: 'jpeg', quality: 80, fullPage: true, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad } });
    await p2.evaluate(() => document.querySelectorAll('.__badge').forEach((b) => b.remove()));
    console.log('Bild', name);
  };
  void swap;
  await badge2('#tpl-select', 1, -4, -8); await badge2('#tpl-apply', 2);
  await shot2('11-vorlage-waehlen', '.tplpick');
  await p2.click('#tpl-apply');
  await p2.click('#tab-4');
  await p2.waitForTimeout(600);
  await badge2('#tpl-card h3', 1, -16, -8); await badge2('#tpl-results', 2, -16, -4);
  await shot2('12-vorlage-ergebnis', '#tpl-card');
  await ctx2.close();
}
await page.click('#tab-4');

// ---- 10 Export ---------------------------------------------------------------------------
await page.fill('#exp-title', 'Demo: Spannung und Strom'); await page.fill('#exp-name', 'Gruppe A');
await badge('#exp-title', 1, -4, -8); await badge('#dl-csv', 2); await badge('#dl-png', 3); await badge('#dl-protocol', 4);
{
  const r = await page.evaluate(() => { const a = document.querySelector('.fieldset.export, fieldset.export').getBoundingClientRect(), b = document.querySelector('#german').getBoundingClientRect(); const p = document.querySelector('#panel-4').getBoundingClientRect(); return { x: p.left + scrollX, w: p.width, y: a.top + scrollY, bottom: b.bottom + scrollY }; });
  await shotRect('13-export', r.x, r.y - 20, r.w, r.bottom - r.y + 40);
}

// ---- 11 Protokoll (Druckansicht) -------------------------------------------------------------
{
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-protocol')]);
  const html = fs.readFileSync(await dl.path(), 'utf8');
  const pp = await ctx.newPage();
  await pp.setViewportSize({ width: 794, height: 1123 });
  await pp.setContent(html);
  await pp.emulateMedia({ media: 'print' });
  await pp.screenshot({ path: `${out}14-protokoll.jpg`, type: 'jpeg', quality: 80, fullPage: false, clip: { x: 0, y: 0, width: 794, height: 1123 } });
  await pp.close();
  console.log('Bild 14-protokoll');
}

// ---- 12 Handy und Beamer ----------------------------------------------------------------
{
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mp = await m.newPage();
  await mp.goto(url); await mp.evaluate(() => localStorage.clear()); await mp.reload();
  await mp.click('#btn-demo');
  await mp.click('#add-analog');
  const vbm = await mp.locator('#view').boundingBox();
  const cl = async (x, y) => mp.mouse.click(vbm.x + (x / W) * vbm.width, vbm.y + (y / H) * vbm.height);
  await cl(d.cx, d.cy); await cl(...pt(135)); await mp.locator('#valdlg-input').fill('0'); await mp.click('#valdlg button[value=ok]');
  await cl(...pt(45)); await mp.locator('#valdlg-input').fill('10'); await mp.click('#valdlg button[value=ok]');
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${out}15-handy.jpg`, type: 'jpeg', quality: 80 });
  await m.close();
  console.log('Bild 15-handy');
}
await page.click('#tab-4');
await page.selectOption('#ysel', { index: 0 });
await page.setViewportSize({ width: 1360, height: 1240 });
await page.keyboard.press('b');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}16-beamer.jpg`, type: 'jpeg', quality: 80 });
console.log('Bild 16-beamer');

// ---- 13 Mikrofon mit dem Demo-Ton -----------------------------------------------------------
await page.setViewportSize({ width: 1360, height: 900 });
await page.keyboard.press('b'); // Beamer-Modus wieder aus
await page.click('#tab-1');
await page.click('#btn-tone');
await page.waitForSelector('#micbox:not([hidden])');
await page.check('#mic-level');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(900);
{
  const vbm = await page.locator('#view').boundingBox();
  await badgeAt(vbm.x + 24, vbm.y + 40, 1); await badgeAt(vbm.x + 24, vbm.y + 226, 2); await badgeAt(vbm.x + vbm.width * 0.6, vbm.y + 245, 3);
  await shotRect('18-mikrofon', vbm.x - 8, vbm.y - 8, vbm.width + 16, vbm.height + 16);
}
await badge('#mic-freq', 1, -8, -6); await badge('#mic-level', 2, -8, -6);
await shot('18b-mikrofon-messgroessen', '#micbox', 14);
await page.waitForTimeout(300);

if (errors.length) throw new Error('Seitenfehler: ' + errors.join(' | '));
await browser.close();
console.log('GUIDE SHOTS OK');
