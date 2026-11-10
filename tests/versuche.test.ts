import { describe, expect, it } from 'vitest';
import { buildPages, templatePage } from '../src/pages/versuche';
import { TEMPLATES, templateById } from '../src/templates';

const site = { url: 'https://example.org/app/', css: ['assets/x.css', 'assets/y.css'] };

describe('Versuchsseiten', () => {
  const pages = buildPages(TEMPLATES, site);
  it('je Vorlage eine Seite, dazu Übersicht, Sitemap und robots.txt', () => {
    expect(pages.map((p) => p.path)).toEqual(['versuche/index.html', ...TEMPLATES.map((t) => `versuche/${t.id}.html`), 'sitemap.xml', 'robots.txt']);
    const sm = pages.find((p) => p.path === 'sitemap.xml')!.html;
    for (const t of TEMPLATES) expect(sm).toContain(`https://example.org/app/versuche/${t.id}.html`);
    expect(pages.find((p) => p.path === 'robots.txt')!.html).toContain('Sitemap: https://example.org/app/sitemap.xml');
  });
  it('jede Seite hat Titel, Beschreibung, Vorschau-Angaben, Namensnennung und den Link in die App', () => {
    for (const t of TEMPLATES) {
      const h = pages.find((p) => p.path === `versuche/${t.id}.html`)!.html;
      expect(h, t.id).toContain(`<link rel="canonical" href="https://example.org/app/versuche/${t.id}.html" />`);
      expect(h, t.id).toMatch(/<meta property="og:image" content="https:\/\/example\.org\/app\/og\.png"/);
      expect(h, t.id).toContain(`href="../index.html#vorlage=${t.id}"`);
      expect(h, t.id).toContain('<link rel="stylesheet" href="../assets/x.css" />\n  <link rel="stylesheet" href="../assets/y.css" />');
      expect(h, t.id).toContain('Tobias Schmidbauer');
      expect(h, t.id).toContain('CC BY-NC 4.0');
      expect(h, t.id).not.toMatch(/undefined|NaN|\[object/);
      const d = /<meta name="description" content="([^"]*)"/.exec(h)![1];
      expect(d.length, t.id).toBeGreaterThan(60);
      expect(d.length, t.id).toBeLessThanOrEqual(300);
      expect(() => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(h)![1]), t.id).not.toThrow();
      for (const s of t.steps) expect(h, t.id).toContain(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    }
  });
  it('Inhalt stimmt für ein Beispiel (Fadenpendel) und Sonderzeichen werden maskiert', () => {
    const h = templatePage(templateById('fadenpendel')!, site).html;
    expect(h).toContain('Fallbeschleunigung');
    expect(h).toContain('9,81');
    expect(h).toMatch(/Periodendauer T.*für verschiedene Werte von Länge l/);
    const evil = { ...templateById('ohm')!, title: 'A<script>alert(1)</script>"B', summary: 'x & y' };
    const e = templatePage(evil, site).html;
    expect(e).not.toContain('<script>alert');
    expect(e).toContain('A&lt;script&gt;');
  });
  it('Übersicht verlinkt alle Versuche', () => {
    const idx = pages[0].html;
    for (const t of TEMPLATES) expect(idx).toContain(`href="${t.id}.html"`);
  });
});
