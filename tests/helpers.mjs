// Gemeinsame Hilfen für die E2E-Tests: V2.0 klappt Bereiche ein, die Tests müssen sie öffnen.
/** Klappt alle <details> auf und zeigt die Startweg-Blöcke (Vorlage, Aufgabe). */
export async function unfold(page) {
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
    for (const id of ['tplbox', 'taskpick']) document.getElementById(id)?.removeAttribute('hidden');
  });
}

/** Hält Bereiche dauerhaft offen (für Tests, die nur Funktionen prüfen, nicht das Einklappen). */
export async function keepUnfolded(page) {
  await page.addInitScript(() => {
    setInterval(() => {
      if (window.__noUnfold) return;
      document.querySelectorAll('details').forEach((d) => { if (!d.open) d.open = true; });
      for (const id of ['tplbox', 'taskpick']) document.getElementById(id)?.removeAttribute('hidden');
    }, 50);
  });
}
