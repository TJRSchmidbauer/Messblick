import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

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
  plugins: [offlineWorker()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
