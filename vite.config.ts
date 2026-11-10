import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildPages } from './src/pages/versuche';
import { TEMPLATES } from './src/templates';

/** Kennung des Stands: Commit (CI: GITHUB_SHA) und Bauzeit, damit man sieht, welche Version im Browser läuft. */
function buildId(): string {
  let sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!sha) { try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sha = 'lokal'; } }
  return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * Öffentliche Adresse der App (mit Schrägstrich am Ende). Wird für Vorschau-Angaben, Sitemap und Versuchsseiten gebraucht.
 * Bei eigener Domain oder einem Fork: Umgebungsvariable SITE_URL setzen oder hier ändern.
 */
const SITE_URL = (process.env.SITE_URL ?? 'https://tjrschmidbauer.github.io/Messblick/').replace(/\/?$/, '/');

/** Schreibt nach dem Bauen die statischen Versuchsseiten, sitemap.xml und robots.txt. */
function versuchsseiten(): Plugin {
  let outDir = 'dist';
  return {
    name: 'versuchsseiten',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      // dieselben Stylesheets wie die gebaute Anleitung (gemeinsames Aussehen, Schriften inklusive)
      const guide = readFileSync(join(outDir, 'anleitung.html'), 'utf8');
      const css = [...guide.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"/g)].map((m) => m[1]);
      if (!css.length) throw new Error('Stylesheets der Anleitung nicht gefunden (für die Versuchsseiten).');
      for (const page of buildPages(TEMPLATES, { url: SITE_URL, css })) {
        const file = join(outDir, page.path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, page.html);
      }
    },
  };
}

/** Ersetzt __SITE_URL__ in den HTML-Dateien (absolute Adressen für die Link-Vorschau). */
function siteUrl(): Plugin {
  return { name: 'site-url', transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('__SITE_URL__', SITE_URL) } };
}

/** Schreibt nach dem Bauen dist/sw.js: Vorlage + Liste aller gebauten Dateien + Versionskennung aus deren Inhalt. */
function offlineWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'offline-worker',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const name of readdirSync(dir).sort()) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else if (name !== 'sw.js') files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const list = ['./', ...files].map((f) => (f === './' ? f : `./${f}`));
      const tpl = readFileSync('scripts/sw.template.js', 'utf8');
      writeFileSync(join(outDir, 'sw.js'), tpl.replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('__FILES__', JSON.stringify(list)));
    },
  };
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildId()) },
  plugins: [siteUrl(), versuchsseiten(), offlineWorker()],
  build: { rollupOptions: { input: { main: 'index.html', anleitung: 'anleitung.html' } } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
