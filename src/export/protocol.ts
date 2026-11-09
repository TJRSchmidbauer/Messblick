/**
 * Versuchsprotokoll als eigenständige HTML-Datei (A4, druckfertig, als PDF speicherbar).
 * Gliederung: Fragestellung, Aufbau, Durchführung, Messwerte, Auswertung, Fehlerbetrachtung, Fazit.
 * Fragestellung, Durchführung, Fehlerbetrachtung und Fazit bleiben bewusst leer und lassen sich im Browser
 * vor dem Drucken beschriften: Schüler sollen selbst formulieren. Keine Skripte, keine externen Ressourcen.
 */
export interface ProtocolData {
  title: string;
  names: string;
  /** Bereits formatiertes Datum. */
  date: string;
  /** Bild vom Versuchsaufbau (Kamerabild) als data:-URL. */
  setupImage?: string;
  graphImage?: string;
  seriesImage?: string;
  template?: { title: string; topic: string; steps: string[] };
  devices: { name: string; unit: string; uncertainty: string }[];
  table?: { header: string[]; rows: (number | null)[][]; total: number };
  fit?: { model: string; formula: string; params: string[]; stats: string; warnings: string[] };
  results: { label: string; value: string; lit?: string; budget?: string }[];
  /** Weitere Hinweise aus der Auswertung (z. B. Korrekturen), je ein Satz. */
  notes: string[];
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const de = (v: number | null): string => (v === null ? '' : String(Number(v.toPrecision(5))).replace('.', ','));
/** Nur Bilder aus data:-URLs zulassen, damit die Datei nichts nachlädt. */
const img = (src: string | undefined, alt: string): string =>
  src && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src) ? `<img src="${src}" alt="${esc(alt)}" />` : '';

/** Höchstens `max` Zeilen, gleichmäßig verteilt, erste und letzte immer dabei. */
export function sampleRows<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  return Array.from({ length: max }, (_, i) => rows[Math.round((i * (rows.length - 1)) / (max - 1))]);
}

const blank = (hint: string, lines = 4): string =>
  `<div class="blank" contenteditable="true" role="textbox" aria-label="${esc(hint)}" style="min-height:${lines * 1.7}em"></div>`;

export function buildProtocolHtml(d: ProtocolData): string {
  const section = (n: number, title: string, body: string): string => `<section><h2>${n}. ${esc(title)}</h2>${body}</section>`;
  const rows = d.table ? sampleRows(d.table.rows, 25) : [];
  const parts: string[] = [];

  parts.push(section(1, 'Fragestellung', `${d.template ? `<p class="hint">Vorlage: ${esc(d.template.title)} (${esc(d.template.topic)})</p>` : ''}${blank('Fragestellung und Vermutung', 3)}`));
  parts.push(section(2, 'Aufbau', `${img(d.setupImage, 'Kamerabild des Versuchsaufbaus')}
    ${d.devices.length ? `<table><thead><tr><th>Messgerät</th><th>Einheit</th><th>Messunsicherheit</th></tr></thead><tbody>${d.devices.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.unit)}</td><td>${esc(v.uncertainty)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${blank('Beschreibung des Aufbaus', 3)}`));
  parts.push(section(3, 'Durchführung', `${d.template ? `<p class="hint">Ablauf der Vorlage: ${d.template.steps.map(esc).join(' · ')}</p>` : ''}${blank('Durchführung in eigenen Worten', 4)}`));
  parts.push(section(4, 'Messwerte', d.table && d.table.total
    ? `<table class="data"><thead><tr>${d.table.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${de(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
       <p class="hint">${rows.length < d.table.total ? `${rows.length} von ${d.table.total} Messpunkten, gleichmäßig ausgewählt. ` : ''}Alle Werte stehen in der CSV- oder XLSX-Datei.</p>`
    : '<p class="hint">Keine Messwerte vorhanden.</p>'));

  const result = d.results.map((r) => `<div class="result"><b>${esc(r.label)}</b><div class="val">${esc(r.value)}</div>${r.lit ? `<p>${esc(r.lit)}</p>` : ''}</div>`).join('');
  parts.push(section(5, 'Auswertung', `${img(d.graphImage, 'Graph der Messung')}
    ${d.fit ? `<div class="result"><b>Fit: ${esc(d.fit.model)}</b><div class="val">y = ${esc(d.fit.formula)}</div><ul>${d.fit.params.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p>${esc(d.fit.stats)}</p>${d.fit.warnings.map((w) => `<p class="hint">${esc(w)}</p>`).join('')}</div>` : ''}
    ${img(d.seriesImage, 'Auftragung der Parameterreihe')}
    ${result}`));
  parts.push(section(6, 'Fehlerbetrachtung', `${d.results.some((r) => r.budget) ? d.results.filter((r) => r.budget).map((r) => `<p class="hint">${esc(r.label)}: ${esc(r.budget!)}</p>`).join('') : ''}
    ${d.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')}
    <p class="hint">Nenne mindestens zwei Fehlerquellen, ordne sie als zufällig oder systematisch ein und sage, wie sie das Ergebnis beeinflussen.</p>${blank('Fehlerbetrachtung', 5)}`));
  parts.push(section(7, 'Fazit', `<p class="hint">Beantworte die Fragestellung mit deinem Ergebnis und begründe.</p>${blank('Fazit', 4)}`));

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(d.title || 'Versuchsprotokoll')}</title>
<style>
  @page { size: A4; margin: 16mm 16mm 18mm; }
  :root { --ink: #2e2a28; --soft: #6b625c; --line: #d9ccc0; --accent: #a0502c; --cream: #fbf4ec; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11pt/1.5 "Atkinson Hyperlegible", system-ui, sans-serif; color: var(--ink); background: #fff; }
  main { max-width: 190mm; margin: 0 auto; padding: 1.2rem; }
  header { border-bottom: 2px solid var(--ink); margin-bottom: 1rem; padding-bottom: .5rem; }
  h1 { font: 700 20pt/1.2 "Space Grotesk", system-ui, sans-serif; margin: 0; }
  h2 { font: 700 13pt/1.3 "Space Grotesk", system-ui, sans-serif; margin: 1.2rem 0 .4rem; break-after: avoid; }
  .meta { color: var(--soft); margin: .2rem 0 0; }
  section { break-inside: auto; }
  img { max-width: 100%; height: auto; border: 1px solid var(--line); display: block; margin: .4rem 0; break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: .4rem 0; font-size: 10pt; break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: .2rem .5rem; text-align: left; }
  th { background: var(--cream); }
  table.data td { font-variant-numeric: tabular-nums; text-align: right; }
  .blank { border: 1.5px dotted var(--soft); border-radius: 4px; padding: .4rem .6rem; margin: .4rem 0 .8rem; background-image: repeating-linear-gradient(transparent 0, transparent calc(1.7em - 1px), var(--line) calc(1.7em - 1px), var(--line) 1.7em); line-height: 1.7em; }
  .hint { color: var(--soft); font-size: 10pt; margin: .3rem 0; }
  .result { border-left: 4px solid var(--accent); padding: .3rem .8rem; margin: .6rem 0; break-inside: avoid; }
  .result .val { font: 700 13pt "JetBrains Mono", ui-monospace, monospace; }
  .result p, .result ul { margin: .2rem 0; }
  footer { margin-top: 1.5rem; padding-top: .5rem; border-top: 1px solid var(--line); color: var(--soft); font-size: 9pt; }
  .screen-note { background: var(--cream); border: 1px solid var(--line); padding: .5rem .8rem; border-radius: 6px; margin-bottom: 1rem; font-size: 10pt; }
  @media print { .screen-note { display: none; } .blank { border-style: none; } main { padding: 0; } }
</style></head>
<body><main>
<p class="screen-note">Die gepunkteten Felder lassen sich hier im Browser beschriften. Danach über „Drucken“ ausdrucken oder als PDF speichern.</p>
<header><h1>${esc(d.title || 'Versuchsprotokoll')}</h1><p class="meta">${[d.names, d.date].filter(Boolean).map(esc).join(' · ')}</p></header>
${parts.join('\n')}
<footer>Erstellt mit der Physik-Messwerterfassung. Die Auswertung lief lokal im Browser, es wurden keine Daten übertragen.</footer>
</main></body></html>`;
}
