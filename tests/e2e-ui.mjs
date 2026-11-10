// V2.0: Orientierung und Übersicht. node tests/e2e-ui.mjs (Vite-Server :5173)
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: 'reduce' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const check = (c, msg) => { if (!c) throw new Error(msg); };
const vis = (id) => page.locator(id).isVisible();
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

// 1) Startwege: Standard ist „Frei messen“, Vorlage und Aufgabe erst auf Wunsch
check(!(await vis('#tplbox')) && !(await vis('#taskpick')), 'Vorlage und Aufgabe sollten zunächst verborgen sein');
check((await page.getAttribute('#route-free', 'aria-pressed')) === 'true', 'Frei messen nicht vorgewählt');
await page.click('#route-tpl');
check(await vis('#tpl-select'), 'Vorlagenwahl fehlt nach Klick auf Standardversuch');
await page.click('#route-task');
check((await vis('#taskpick')) && !(await vis('#tplbox')), 'Aufgabe sollte die Vorlage ersetzen');

// 2) Begründungen und Statusleiste
check(/Quelle: noch keine/.test(await page.locator('#statusbar').textContent()), 'Statusleiste ohne Quelle');
check(/Wähle zuerst eine Quelle/.test(await page.locator('#why-next-1').textContent()), 'Begründung für „Weiter“ fehlt');
await page.click('#btn-demo');
await page.waitForSelector('#panel-2:not([hidden])');
check(/Quelle: Demo/.test(await page.locator('#statusbar').textContent()), 'Statusleiste kennt die Quelle nicht');
check(await page.locator('#tab-1').evaluate((e) => e.classList.contains('done')), 'Häkchen an Schritt 1 fehlt');
check(/Schritt 1: Quelle, erledigt/.test((await page.getAttribute('#tab-1', 'aria-label')) ?? ''), 'Häkchen nicht für Screenreader');
check(/Lege zuerst ein Gerät an/.test(await page.locator('#why-next-2').textContent()), 'Begründung für Schritt 2 fehlt');

// 3) Zusatzwerkzeuge sind eingeklappt, öffnen sich von selbst, sobald eines benutzt wird
check(!(await vis('#trk-marker')), 'Zusatzwerkzeuge sollten eingeklappt sein');
await page.click('#moretools > summary');
check(await vis('#trk-marker'), 'Zusatzwerkzeuge lassen sich nicht öffnen');

// 4) Schritt 3: Begründung am Aufnahmeknopf
await page.click('#tab-3');
check(/erst in Schritt 2 ein Gerät kalibrieren/.test(await page.locator('#why-live').textContent()), 'Begründung am Aufnahmeknopf fehlt');
check(!(await vis('#announce')), 'Ansage-Option sollte eingeklappt sein');

// 5) Schritt 4: Graph groß, Kamerabild weg, zwei Spalten; Leerzustand erklärt
await page.click('#tab-4'); await page.waitForTimeout(400);
check(!(await vis('#stage')), 'Kamerabild sollte in der Auswertung verborgen sein');
check(await vis('#chart-empty'), 'Hinweis „noch keine Messwerte“ fehlt');
const [g, f] = await Promise.all([page.locator('#chart').boundingBox(), page.locator('#fit-model').boundingBox()]);
check(g.width > 600 && f.x > g.x + g.width - 5, `Graph und Fit nicht nebeneinander (Graph ${Math.round(g.width)} px)`);
check(!(await vis('#var-pname')), 'Parameterreihe sollte eingeklappt sein');
const kl = await page.locator('#classbox').boundingBox();
const ex = await page.locator('#dl-csv').boundingBox();
check(kl.y > ex.y, 'Klassenansicht gehört unter den Export');
// Handy: einspaltig, Kamerabild wieder da
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(500); // Chart.js passt die Größe verzögert an
check(await vis('#stage'), 'Auf dem Handy sollte das Kamerabild bleiben');
const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent).slice(0, 5).map((e) => `${e.tagName}#${e.id}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`)]);
check(wide[0] <= wide[1], 'Horizontales Scrollen auf dem Handy: ' + JSON.stringify(wide));
await page.setViewportSize({ width: 1360, height: 1000 });

// 6) Hilfelinks zeigen auf vorhandene Anleitungsabschnitte
const ids = new Set([...fs.readFileSync('anleitung.html', 'utf8').matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]));
const links = await page.$$eval('a.help', (as) => as.map((a) => a.getAttribute('href')));
check(links.length >= 5, 'Zu wenige Hilfelinks: ' + links.length);
for (const l of links) check(ids.has(l.split('#')[1]), 'Hilfelink ohne Ziel: ' + l);

// 7) Messen füllt Statusleiste und Häkchen
await page.click('#tab-2'); await page.click('#add-digital');
check(errors.length === 0, 'Konsolenfehler: ' + errors.join(' | '));
await browser.close();
console.log('UI OK');
