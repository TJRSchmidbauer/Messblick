// Versuchsseiten und Link-Vorschau im gebauten Stand. Setzt `npm run build` und `npx vite preview --port 4173` voraus.
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
const check = (c, msg) => { if (!c) throw new Error(msg); };

// 1) Startseite: Vorschau-Angaben mit absoluter Adresse, Bild vorhanden und 1200×630
await page.goto(url);
const meta = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')].map((m) => [m.getAttribute('property') ?? m.getAttribute('name'), m.content])));
for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) check(meta[k], 'Angabe fehlt: ' + k);
check(/^https:\/\/.+\/og\.png$/.test(meta['og:image']) && !/__SITE_URL__/.test(JSON.stringify(meta)), 'og:image ist nicht absolut: ' + meta['og:image']);
const img = await page.evaluate(async () => { const i = new Image(); i.src = 'og.png'; await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
check(img[0] === 1200 && img[1] === 630, 'Vorschaubild hat die falsche Größe: ' + img);
check(JSON.parse(await page.locator('script[type="application/ld+json"]').textContent()).name === 'Messblick', 'Strukturierte Daten fehlen');

// 2) Übersicht der Versuche: gestaltet (Stylesheet geladen), alle Links führen zu vorhandenen Seiten
await page.goto(url + 'versuche/');
check(/Versuche für den Physikunterricht/.test(await page.locator('h1.vtitle').textContent()), 'Übersicht fehlt');
check((await page.evaluate(() => getComputedStyle(document.querySelector('header.shell')).backgroundColor)) !== 'rgba(0, 0, 0, 0)', 'Stylesheet nicht geladen');
const links = await page.$$eval('.vlist a', (as) => as.map((a) => a.href));
check(links.length >= 18, 'Zu wenige Versuche: ' + links.length);
for (const l of links) check((await page.request.get(l)).ok(), 'Seite fehlt: ' + l);
check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Übersicht scrollt horizontal');

// 3) Eine Versuchsseite: Inhalt, Namensnennung, Handybreite
await page.goto(url + 'versuche/fadenpendel.html');
const text = await page.locator('main').innerText();
check(/Fadenpendel/.test(text) && /Fallbeschleunigung/.test(text) && /So gehst du vor/.test(text), 'Inhalt der Versuchsseite fehlt');
check(/Tobias Schmidbauer/.test(await page.locator('.site-foot .credit').textContent()), 'Namensnennung fehlt');
await page.setViewportSize({ width: 390, height: 800 });
check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Versuchsseite scrollt auf dem Handy horizontal');
await page.setViewportSize({ width: 1280, height: 900 });

// 4) Der Knopf öffnet die App mit eingestellter Vorlage
await page.locator('a.btn.primary').first().click();
await page.waitForSelector('#panel-1:not([hidden])');
await page.waitForFunction(() => document.getElementById('tpl-select').value === 'fadenpendel');
check(await page.locator('#tplbox').isVisible(), 'Vorlagenwahl nicht sichtbar');
check((await page.getAttribute('#route-tpl', 'aria-pressed')) === 'true', 'Startweg „Standardversuch“ nicht gewählt');
check(/Versuch: Fadenpendel/.test(await page.locator('#statusbar').textContent()), 'Statusleiste nennt den Versuch nicht');
check(/Fadenpendel.*ist eingestellt/.test(await page.locator('#hint').textContent()), 'Hinweis fehlt');
check(new URL(page.url()).hash === '', 'Der Anker bleibt in der Adresse stehen');
// unbekannter Versuch: verständliche Meldung, kein Absturz
await page.goto(url + '#vorlage=gibtsnicht');
await page.waitForSelector('#error:not([hidden])');
check(/gibt es nicht/.test(await page.locator('#error').textContent()), 'Meldung für unbekannten Versuch fehlt');

// 5) Sitemap und robots.txt
const sm = await (await page.request.get(url + 'sitemap.xml')).text();
check((sm.match(/<loc>/g) ?? []).length >= 21 && /versuche\/fadenpendel\.html/.test(sm), 'Sitemap unvollständig');
check(/Sitemap: https:\/\//.test(await (await page.request.get(url + 'robots.txt')).text()), 'robots.txt fehlt');
check(fs.existsSync('dist/versuche/index.html'), 'dist/versuche fehlt');
check(errors.length === 0, 'Fehler: ' + errors.join(' | '));
await browser.close();
console.log('VERSUCHE OK', links.length, 'Seiten');
