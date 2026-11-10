// Aufgabenmodus: Lehrkraft speichert eine Aufgabe, ein neuer Browser lädt sie. node tests/e2e-task.mjs (Vite-Server :5173)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { keepUnfolded } from './helpers.mjs';

const url = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await keepUnfolded(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  return { ctx, page, errors };
};

// --- Lehrkraft ---
const t = await mk();
await t.page.click('#btn-demo');
await t.page.waitForSelector('#panel-2:not([hidden])');
await t.page.click('#tab-1');
await t.page.click('.taskedit summary');
await t.page.fill('#task-title', 'Federkonstante bestimmen');
await t.page.fill('#task-text-in', 'Bestimme die Federkonstante D der Feder.\n\nBegründe, warum T² über m aufgetragen wird.');
await t.page.fill('#task-hints-in', 'Masse in g eintippen\nJede Periodendauer dreimal messen');
await t.page.check('#task-hide');
await t.page.selectOption('#tpl-select', 'federpendel');
await t.page.click('#tpl-apply');
await t.page.click('#tab-4');
await t.page.fill('#tpl-in-Dnenn', '20');
await t.page.click('#tab-1');
const [dl] = await Promise.all([t.page.waitForEvent('download'), t.page.click('#task-save')]);
const tmp = process.env.TMPDIR_E2E ?? '/tmp/claude-0/-home-user-Physikmesswererfassung/ca9799fc-5dd4-51a9-ada3-7d1b4ad7cae1/scratchpad';
const path = `${tmp}/aufgabe-test.json`;
fs.copyFileSync(await dl.path(), path); // der Download verschwindet mit dem Browser-Kontext
const saved = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log('Datei:', dl.suggestedFilename(), JSON.stringify({ ...saved, text: saved.text.slice(0, 20) }));
if (saved.kind !== 'pmw-task' || saved.templateId !== 'federpendel' || saved.inputs?.Dnenn?.v !== '20' || saved.hideResults !== true || saved.hints.length !== 2) throw new Error('Aufgabendatei unvollständig');
if (!/federkonstante/.test(dl.suggestedFilename())) throw new Error('Dateiname: ' + dl.suggestedFilename());
// Titel Pflicht
await t.page.fill('#task-title', '');
await t.page.click('#task-save');
if (!/Titel/.test(await t.page.locator('#error, .error').first().innerText())) throw new Error('Meldung zum fehlenden Titel fehlt');
if (t.errors.length) throw new Error('Konsolenfehler (Lehrkraft): ' + t.errors.join(' | '));
await t.ctx.close();

// --- Schüler: frischer Browser lädt die Datei ---
const s = await mk();
await s.page.setInputFiles('#task-load', path);
await s.page.waitForSelector('#task-card:not([hidden])');
const card = await s.page.locator('#task-card').innerText();
console.log('Karte:', card.replace(/\n+/g, ' | ').slice(0, 200));
if (!/Federkonstante bestimmen/.test(card) || !/Begründe, warum T²/.test(card) || !/dreimal messen/.test(card)) throw new Error('Aufgabenkarte unvollständig');
await s.page.click('#tab-4');
if (!(await s.page.locator('#tpl-card').isVisible())) throw new Error('Vorlage wurde nicht angewendet');
if ((await s.page.locator('#tpl-in-Dnenn').inputValue()) !== '20') throw new Error('Eingabe wurde nicht übernommen');
if (!(await s.page.locator('#task-reveal').isVisible())) throw new Error('Ergebnis sollte zunächst ausgeblendet sein');
await s.page.click('#task-reveal');
if (await s.page.locator('#task-reveal').count()) throw new Error('Ergebnis lässt sich nicht aufdecken');
// bleibt nach dem Neuladen erhalten
await s.page.reload();
await s.page.waitForSelector('#task-card:not([hidden])');
// Schließen
await s.page.click('#task-close');
if (await s.page.locator('#task-card').isVisible()) throw new Error('Aufgabe lässt sich nicht schließen');
// fremde Datei
fs.writeFileSync(`${tmp}/fremd.json`, '{"kind":"anders","version":1}');
await s.page.click('#tab-1');
await s.page.setInputFiles('#task-load', `${tmp}/fremd.json`);
await s.page.waitForTimeout(400); // Datei wird asynchron gelesen
if (!/keine Aufgabe/.test(await s.page.locator('#error, .error').first().innerText())) throw new Error('Meldung zur fremden Datei fehlt');
if (s.errors.length) throw new Error('Konsolenfehler (Schüler): ' + s.errors.join(' | '));
await browser.close();
console.log('TASK OK');
