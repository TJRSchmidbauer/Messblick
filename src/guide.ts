import { TEMPLATES } from './templates';

/** Hell oder dunkel wie das System (die App speichert die Wahl; die Anleitung folgt dem System). */
const dark = matchMedia('(prefers-color-scheme: dark)');
const contrast = matchMedia('(prefers-contrast: more)');
const apply = (): void => { document.documentElement.dataset.theme = contrast.matches ? 'contrast' : dark.matches ? 'dark' : 'light'; };
apply();
dark.addEventListener('change', apply);
contrast.addEventListener('change', apply);

/** Tabelle der Versuchsvorlagen: kommt direkt aus den Vorlagen der App und bleibt deshalb immer aktuell. */
const body = document.querySelector<HTMLTableSectionElement>('#tpl-table tbody');
if (body) {
  for (const t of TEMPLATES) {
    const tr = document.createElement('tr');
    const cells = [t.title, t.topic, t.results.map((r) => r.label).join('; ')];
    cells.forEach((text, i) => {
      const td = document.createElement('td');
      if (i === 0) { const b = document.createElement('b'); b.textContent = text; td.appendChild(b); } else td.textContent = text;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
}
