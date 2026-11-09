# Physik-Messwerterfassung

Webanwendung für den Physikunterricht: Ein analoges oder digitales Messgerät (z. B. PHYWE-Demo-Zeigerinstrument, Multimeter) wird per Kamera oder Videodatei abgefilmt. Die App liest die Werte ab und erzeugt eine **CSV-/XLSX-Datei** sowie **Graphen** (Wert über Zeit oder über einem zweiten Messgerät).

Alles läuft **lokal im Browser** – das Video verlässt das Gerät nie. Es ist kein Server nötig (statische Seite, GitHub Pages).

## Benutzung
1. **Quelle**: Kamera, Videodatei oder Demo.
2. **Kalibrieren** (pro Messgerät, beliebig viele):
   - *Zeigerinstrument*: Drehpunkt klicken, dann zwei Skalenstriche mit bekanntem Wert anklicken und den Wert eingeben. „Großer Bogen“ umschalten, falls die Skala mehr als 180° überstreicht.
   - *Digitalanzeige* (7-Segment, LCD/LED): Rechteck eng um die Ziffern ziehen, Ziffernanzahl und ggf. Dezimalstellen einstellen.
   Die „Live“-Anzeige am Kanal zeigt sofort, ob die Ablesung stimmt.
3. **Messen**: Live aufnehmen (Kamera) oder die Videodatei Frame-genau auswerten (schneller als Echtzeit).
4. **Auswertung**: Graph mit x = Zeit oder beliebigem anderen Messgerät, Glättung, Werte einzeln korrigieren, Export als CSV (deutsch: `;` und Dezimalkomma), XLSX und PNG.

## Entwicklung
```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Reader, Session, Export)
npm run build      # Produktionsbuild nach dist/
node tests/e2e-demo.mjs   # E2E mit Demo-Quelle (Dev-Server auf :5173 nötig, playwright installiert)
```

Struktur: `src/readers` (Analog/Digital), `src/source` (Kamera/Datei/Demo), `src/session` (Daten), `src/export`, `src/ui`, `src/sampler.ts`.

## Grenzen / Ausblick
- Digital: 7-Segment-Anzeigen werden per Segment-Abtastung gelesen; Punktmatrix-/LCD-Schriften erfordern einen OCR-Fallback (z. B. Tesseract.js, noch nicht enthalten).
- Kamera sollte frontal und ruhig stehen (Stativ); die Kalibrierung gilt für einen festen Bildausschnitt.
- Multimeter-Bereichswechsel: Einheit bzw. Dezimalstellen am Kanal manuell anpassen.
- Noch nicht an echten Geräten (PHYWE, Multimeter) getestet – bisher synthetische Bilder und Demo.
