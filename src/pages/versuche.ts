import { modelById } from '../analysis/fit/models';
import { transformLabel } from '../analysis/variation';
import type { Template } from '../templates';

/**
 * Statische Versuchsseiten: je Vorlage eine eigenständige HTML-Seite (ohne Skripte), damit Suchmaschinen und Kolleginnen
 * den Versuch finden und mit einem Klick in der App öffnen. Reine Textarbeit, daher in Node testbar; der Bau ruft sie auf.
 */

export interface Page {
  /** Pfad relativ zum Ausgabeordner, z. B. versuche/fadenpendel.html */
  path: string;
  html: string;
}
export interface SiteInfo {
  /** Öffentliche Adresse der App mit abschließendem Schrägstrich. */
  url: string;
  /** Stylesheets relativ zum Ausgabeordner (z. B. assets/style-abc.css), in Ladereihenfolge. */
  css: string[];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const AUTHOR = 'Tobias Schmidbauer';

function shell(site: SiteInfo, o: { path: string; title: string; description: string; body: string; jsonLd?: object; up: string }): string {
  const abs = site.url + o.path;
  return `<!doctype html>
<html lang="de" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.description)}" />
  <link rel="canonical" href="${esc(abs)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Messblick" />
  <meta property="og:locale" content="de_DE" />
  <meta property="og:title" content="${esc(o.title)}" />
  <meta property="og:description" content="${esc(o.description)}" />
  <meta property="og:url" content="${esc(abs)}" />
  <meta property="og:image" content="${esc(site.url)}og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" type="image/svg+xml" href="${o.up}favicon.svg" />
${site.css.map((c) => `  <link rel="stylesheet" href="${o.up}${esc(c)}" />`).join('\n')}
${o.jsonLd ? `  <script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body class="guide">
  <header class="shell">
    <div class="brand">
      <span class="wortmarke" aria-hidden="true">ts<i>.</i></span>
      <h1>Messblick<span class="tagline">Physik-Messwerterfassung</span></h1>
    </div>
    <div class="tools">
      <a class="btn ghost" href="${o.up}versuche/">Alle Versuche</a>
      <a class="btn ghost" href="${o.up}anleitung.html">Anleitung</a>
      <a class="btn" href="${o.up}index.html">Zur App</a>
    </div>
  </header>
  <main class="doc versuch">
    <article>
${o.body}
    </article>
  </main>
  <footer class="site-foot">
    <b>Verstehen<span class="dot">.</span> Bauen<span class="dot">.</span> Teilen<span class="dot">.</span></b>
    <span class="credit">„Messblick“ von <strong>${AUTHOR}</strong> (schmidbauer.io) · Lizenz <a href="${o.up}LICENSE.txt">CC BY-NC 4.0</a> (Namensnennung, nicht kommerziell)</span>
    <span>Läuft lokal in deinem Browser: kein Konto, keine Übertragung von Video oder Messwerten.</span>
    <nav class="legal" aria-label="Rechtliches">
      <a href="https://schmidbauer.io/impressum" target="_blank" rel="noopener noreferrer">Impressum</a>
      <a href="https://schmidbauer.io/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
    </nav>
  </footer>
</body>
</html>
`;
}

/** Was gemessen wird, in einem Satz. */
function measures(t: Template): string {
  if (t.mode === 'series') {
    const s = t.series!;
    return `${s.vname}${s.vunit ? ` (${s.vunit})` : ''} für verschiedene Werte von ${s.pname}${s.punit ? ` (${s.punit})` : ''}`;
  }
  const ch = (t.channels ?? []).map((c) => `${c.name}${c.unit ? ` (${c.unit})` : ''}`);
  return t.mode === 'channels' ? `${ch[1]} über ${ch[0]}` : `${ch.join(', ')} über der Zeit`;
}

function plotLine(t: Template): string {
  if (t.mode === 'series') {
    const s = t.series!, m = modelById(s.model);
    return `${transformLabel(s.ty, s.vname)} über ${transformLabel(s.tx, s.pname)}${m ? `, Fit „${m.name}“ (${m.formula})` : ''}`;
  }
  const m = t.fit ? modelById(t.fit) : undefined;
  return m ? `Fit „${m.name}“: y = ${m.formula}` : '';
}

export function templatePage(t: Template, site: SiteInfo): Page {
  const path = `versuche/${t.id}.html`;
  const source = t.audio ? 'dem Mikrofon' : 'der Kamera';
  const description = `${t.title} mit ${source} auswerten: ${t.summary} Kostenlos im Browser, ohne Konto.`.slice(0, 300);
  const results = t.results.map((r) => {
    const lit = r.lit ? ` Vergleich: ${r.lit.label}${r.lit.value !== undefined ? ` ${String(r.lit.value).replace('.', ',')}${r.unit ? ` ${r.unit}` : ''}` : ''}${r.lit.source ? ` (${r.lit.source})` : ''}.` : '';
    return `        <li><b>${esc(r.label)}</b>${r.unit ? ` in ${esc(r.unit)}` : ''}, mit Unsicherheit aus der Fehlerfortpflanzung.${esc(lit)}</li>`;
  }).join('\n');
  const inputs = t.inputs.length
    ? `      <h2>Das trägst du ein</h2>\n      <ul>\n${t.inputs.map((i) => `        <li>${esc(i.label)}${i.unit ? ` in ${esc(i.unit)}` : ''}${i.optional ? ' (optional, nur für den Vergleich)' : ''}</li>`).join('\n')}\n      </ul>\n`
    : '';
  const body = `      <p class="crumb"><a href="./">Versuche</a> › ${esc(t.title)}</p>
      <h1 class="vtitle">${esc(t.title)}</h1>
      <p class="lead">${esc(t.summary)}</p>
      <p class="note">Themenbereich: ${esc(t.topic)}. Die Zuordnung zu Jahrgangsstufe und Lehrplan bitte vor dem Einsatz prüfen.</p>
      <p><a class="btn primary" href="../index.html#vorlage=${esc(t.id)}">Diesen Versuch in Messblick öffnen</a></p>
      <h2>Das brauchst du</h2>
      <ul>
        <li>${t.audio ? 'Ein Gerät mit Mikrofon (Handy, Tablet oder Laptop).' : 'Ein Handy, Tablet oder eine Webcam, möglichst auf einem Stativ, oder ein vorher gefilmtes Video.'}</li>
        <li>Gemessen wird: ${esc(measures(t))}.</li>
        <li>Einen aktuellen Browser. Es wird nichts installiert und nichts übertragen.</li>
      </ul>
      <h2>So gehst du vor</h2>
      <ol class="steps">
${t.steps.map((s) => `        <li>${esc(s)}</li>`).join('\n')}
      </ol>
      <h2>Auswertung</h2>
      <p>${esc(plotLine(t))}. Die Vorlage stellt Achsen und Fitmodell ein.</p>
${inputs}      <h2>Das Ergebnis</h2>
      <ul>
${results}
      </ul>
      <p>Ergebnisse mit Literatur-, Nenn- oder Theoriewert beurteilt Messblick als „verträglich“ (bis 2σ) oder „nicht verträglich“. Tabelle, Graph und ein druckfertiges Protokoll lassen sich exportieren.</p>
      <p><a class="btn primary" href="../index.html#vorlage=${esc(t.id)}">Diesen Versuch in Messblick öffnen</a> <a class="btn ghost" href="../anleitung.html#vorlagen">Anleitung zu den Versuchsvorlagen</a></p>`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'LearningResource', name: t.title, description: t.summary, inLanguage: 'de',
    learningResourceType: 'Experiment', educationalLevel: 'Gymnasium Oberstufe', about: t.topic, isAccessibleForFree: true,
    url: site.url + path, license: 'https://creativecommons.org/licenses/by-nc/4.0/', author: { '@type': 'Person', name: AUTHOR, url: 'https://schmidbauer.io' },
    isPartOf: { '@type': 'WebApplication', name: 'Messblick', url: site.url, applicationCategory: 'EducationalApplication', operatingSystem: 'Browser' },
  };
  return { path, html: shell(site, { path, title: `${t.title} auswerten · Messblick`, description, body, jsonLd, up: '../' }) };
}

export function indexPage(templates: Template[], site: SiteInfo): Page {
  const path = 'versuche/index.html';
  const groups = new Map<string, Template[]>();
  for (const t of templates) {
    const area = t.topic.split(',')[0].trim();
    groups.set(area, [...(groups.get(area) ?? []), t]);
  }
  const body = `      <h1 class="vtitle">Versuche für den Physikunterricht</h1>
      <p class="lead">${templates.length} Standardversuche, die Messblick mit Kamera oder Mikrofon auswertet: Geräte ablesen, Graph, Fit und die gesuchte Größe mit Unsicherheit und Literaturvergleich. Kostenlos, im Browser, ohne Konto.</p>
${[...groups.entries()].map(([area, ts]) => `      <h2>${esc(area)}</h2>
      <ul class="vlist">
${ts.map((t) => `        <li><a href="${esc(t.id)}.html">${esc(t.title)}</a><span>${esc(t.summary)}</span></li>`).join('\n')}
      </ul>`).join('\n')}
      <p><a class="btn primary" href="../index.html">Messblick öffnen</a> <a class="btn ghost" href="../anleitung.html">Anleitung</a></p>`;
  const description = `${templates.length} Physikversuche mit Kamera oder Mikrofon auswerten: Kondensator, Pendel, Fotoeffekt, Schall und mehr. Kostenlos im Browser.`;
  return { path, html: shell(site, { path, title: 'Physikversuche mit der Kamera auswerten · Messblick', description, body, up: '../' }) };
}

/** Alle Seiten samt Sitemap und robots.txt. */
export function buildPages(templates: Template[], site: SiteInfo): Page[] {
  const pages = [indexPage(templates, site), ...templates.map((t) => templatePage(t, site))];
  const urls = [site.url, `${site.url}anleitung.html`, `${site.url}versuche/`, ...templates.map((t) => `${site.url}versuche/${t.id}.html`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  return [...pages, { path: 'sitemap.xml', html: sitemap }, { path: 'robots.txt', html: `User-agent: *\nAllow: /\nSitemap: ${site.url}sitemap.xml\n` }];
}
