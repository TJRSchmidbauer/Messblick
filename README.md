# Physik-Messwerterfassung

Webanwendung für den Physikunterricht: Ein analoges oder digitales Messgerät (z. B. PHYWE-Demo-Zeigerinstrument, Multimeter) wird per Kamera oder Videodatei abgefilmt. Die App liest die Werte ab und erzeugt eine **CSV-/XLSX-Datei** sowie **Graphen** (Wert über Zeit oder über einem zweiten Messgerät).

Alles läuft **lokal im Browser** – das Video verlässt das Gerät nie. Es ist kein Server nötig (statische Seite, GitHub Pages).

## Benutzung
Vier Schritte, oben als Register: **1 Quelle → 2 Geräte → 3 Messen → 4 Auswertung**.

1. **Quelle**: Kamera, Videodatei oder Demo.
2. **Geräte** (bis zu vier gleichzeitig, jedes mit eigener Farbe und eigenem Symbol):
   - *Zeigerinstrument*: Drehpunkt klicken, dann zwei Skalenstriche anklicken und den Wert im Dialog eingeben. „Skala größer als 180°“ umschalten, falls nötig.
   - *Digitalanzeige* (7-Segment): Rechteck eng um die Ziffern ziehen, Ziffernanzahl und ggf. Dezimalstellen einstellen.
   - Punkte lassen sich ziehen oder mit den Pfeiltasten verschieben, `Strg+Z` nimmt zurück. Die Zahl oben zeigt sofort, ob die Ablesung stimmt; Hinweise warnen bei Unschärfe, Spiegelung oder zu kleinem Bild.
   - Kalibrierung lässt sich als Datei speichern und laden.
3. **Messen**: Live aufnehmen (Leertaste) oder die Videodatei Frame-genau auswerten (abbrechbar). „Reihe sichern“ legt eine Messung beiseite, damit eine zweite im Graphen verglichen werden kann.
4. **Auswertung**: Graph mit x = Zeit oder anderem Gerät, zweite y-Achse, logarithmische Achsen, Zoom, Glättung, korrigierbare Wertetabelle. Export als CSV (deutsch: `;` und Komma), XLSX (eine Tabelle pro Reihe) und PNG mit Titel, Name und Datum.

Weitere Funktionen: **Beamer-Modus** (`B`), Darstellung Hell/Dunkel/Hoher Kontrast, automatisches Speichern im Browser (Sitzung wird nach dem Neuladen wiederhergestellt), Tastenkürzel (`?`).

## Entwicklung
```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Reader, Session, Export)
npm run build      # Produktionsbuild nach dist/
node tests/e2e-demo.mjs   # E2E mit Demo-Quelle (Dev-Server auf :5173 nötig, playwright installiert)
```

Struktur: `src/readers` (Analog/Digital), `src/source` (Kamera/Datei/Demo), `src/session` (Daten), `src/export`, `src/ui` (Icons, Graph), `src/quality.ts` (Bildhinweise), `src/storage.ts` (Autosave), `src/sampler.ts`. Gestaltung: `PRODUCT.md`, `DESIGN.md`.

## Grenzen / Ausblick
- Digital: 7-Segment-Anzeigen werden per Segment-Abtastung gelesen; Punktmatrix-/LCD-Schriften erfordern einen OCR-Fallback (z. B. Tesseract.js, noch nicht enthalten).
- Kamera sollte frontal und ruhig stehen (Stativ); die Kalibrierung gilt für einen festen Bildausschnitt.
- Multimeter-Bereichswechsel: Einheit bzw. Dezimalstellen am Kanal manuell anpassen.
- Offline-Nutzung (PWA) ist noch nicht umgesetzt.
- Noch nicht an echten Geräten (PHYWE, Multimeter) getestet – bisher synthetische Bilder und Demo.
