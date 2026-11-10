# Physik-Messwerterfassung

**Messgeräte im Physikunterricht abfilmen, Werte ablesen, Graph und Tabelle erhalten.**
Eine Webanwendung für Lehrkräfte und Schüler: Ein analoges Zeigerinstrument (z. B. PHYWE-Demogerät) oder eine Digitalanzeige (z. B. Multimeter) wird per Kamera oder Videodatei abgefilmt. Die App liest die Werte ab und erzeugt eine **CSV-/XLSX-Datei** sowie **Graphen** (Wert über Zeit oder über einem zweiten Messgerät).

Alles läuft **lokal im Browser**: kein Server, kein Konto, keine Übertragung von Video oder Messwerten, keine Schriften oder Skripte von fremden Servern.

![Quelle wählen](docs/screenshots/01-quelle.png)

## Anleitung
Eine Schritt-für-Schritt-Anleitung mit Bildern aus der App steht in der App selbst (Knopf „Anleitung“ oben rechts, Datei `anleitung.html`) und funktioniert auch offline. Sie führt von der Demo über Kalibrierung, Messen und Auswertung bis zu Versuchsvorlagen und Protokoll und enthält eine Hilfe bei typischen Problemen. Die Bilder erzeugt `tests/guide-screenshots.mjs` aus der laufenden App; die Tabelle der Versuchsvorlagen kommt direkt aus dem Code.

## Funktionen
- **Quellen:** Kamera (live), Videodatei (Frame-genau, schneller als Echtzeit auswertbar) oder Demo zum Ausprobieren.
- **Zwei Gerätetypen, bis zu vier gleichzeitig:** Zeigerinstrument (Zeigerwinkel auf Skala abgebildet) und Digitalanzeige (7-Segment-Ziffern). Jedes Gerät hat eine feste Farbe und ein Symbol, in Bild, Live-Zahl, Graph und Tabelle.
- **Ziffern anlernen:** Liest die App eine LCD- oder Punktmatrix-Anzeige nur unsicher, tippt man einmal ein, was das Gerät gerade zeigt. Die App merkt sich diese Ziffern (nur lokal, in der Sitzung und in der Kalibrierdatei) und liest danach sicherer.
- **Geführte Kalibrierung:** Drehpunkt und zwei Skalenstriche anklicken bzw. Rechteck um die Ziffern ziehen. Punkte lassen sich ziehen oder mit Pfeiltasten verschieben, `Strg+Z` nimmt zurück. Die große Live-Zahl zeigt sofort, ob die Ablesung stimmt, Hinweise warnen bei Unschärfe, Spiegelung oder zu kleinem Gerät.
- **Messen:** Live aufnehmen (Leertaste) oder Video auswerten (abbrechbar). „Reihe sichern“ legt eine Messung beiseite, damit mehrere Reihen im Graphen verglichen werden können.
- **Auswertung:** Graph mit x = Zeit oder anderem Messgerät, zweite y-Achse, logarithmische Achsen, Zoom, Glättung, korrigierbare Wertetabelle.
- **Fit und Messunsicherheit:** Pro Gerät lässt sich die Messunsicherheit angeben (Güteklasse mit Messbereich, Ziffernschritte, fester Wert oder Zählrate √N). Der Graph zeigt dann Fehlerbalken, und der Fit wird damit gewichtet. Modelle: Gerade, Proportional, Zerfall mit Offset, Sättigung, Potenz, Sinus mit Offset, gedämpfter Sinus. Ergebnis mit Parametern ± σ (auf 2 gültige Stellen der Unsicherheit gerundet), R², χ²<sub>red</sub>, Fitkurve und Residuen. Der Fitbereich wird im Graphen per Ziehen gewählt.
- **Parameterreihe (eine Größe variieren):** Pro Durchgang den Parameter eintippen (z. B. Masse) und den Messwert aus der Live-Ablesung (Mittel über rund 2 s, mit Unsicherheit) oder einen Fitparameter übernehmen. Die App schlägt Auftragungen vor (y², 1/y, √y, ln y über x, x², 1/x …, gerankt nach R²), zeichnet sie mit Fit und exportiert die Reihe als CSV/XLSX.
- **Versuchsvorlagen:** In Schritt 1 wählbar: Kondensator laden und entladen, Spule (Ausschalten), Schwingkreis, Fotoeffekt (h), Planck-Konstante mit LEDs, Federpendel (D), Fadenpendel (g), Ohmsches Gesetz, radioaktiver Zerfall (T½), Abkühlkurve; mit dem Mikrofon: Resonanzrohr (offen und einseitig geschlossen, Schallgeschwindigkeit), schwingende Saite, Stimmgabel (Frequenz) und Schallpegel über dem Abstand (Exponent n). Die Vorlage benennt die Geräte, stellt Achsen und Fitmodell ein, zeigt den Ablauf und rechnet die gesuchte Größe mit Unsicherheit aus. Eingaben wie R, L, C (mit optionaler Unsicherheit in %) fließen in die Fehlerfortpflanzung ein.
- **Literaturvergleich:** Jedes Ergebnis mit Literatur-, Nenn- oder Theoriewert (z. B. Thomson-Formel) wird beurteilt: „verträglich“ bis 2σ, sonst „nicht verträglich“ mit Hinweis auf mögliche systematische Fehler. Das Ergebnis steht im XLSX-Blatt „Ergebnis“. Die Themenbereiche der Vorlagen sind zur Orientierung genannt; die Zuordnung zu Jahrgangsstufe und LehrplanPLUS bitte vor dem Einsatz prüfen.
- **Unsicherheitsbudget:** Bei Vorlagen-Ergebnissen zeigt ein aufklappbares Budget, welche Eingabe (z. B. R, τ) wie viel der Gesamtunsicherheit ausmacht, und nennt, wo sich eine genauere Messung lohnt.
- **Bereichswechsel erkennen:** Springt ein Wert um genau eine Zehnerpotenz (Messbereichswechsel am Multimeter, Dezimalpunkt), warnt die App live am Gerät und markiert die Stelle in der Auswertung. Ein Klick rechnet die Werte ab dort um, ein weiterer nimmt es zurück.
- **Vorhersage:** In Schritt 3 zeichnen Schüler vor der Messung die erwartete Kurve (Maus oder Finger). In der Auswertung liegt sie gepunktet über der Messung, dazu eine Rückmeldung mit Denkanstoß statt einer Note.
- **Protokoll:** Eine druckfertige A4-Seite mit Gliederung (Fragestellung, Aufbau mit Kamerabild, Durchführung, Messwerte, Auswertung mit Graph, Fit und Vorlagen-Ergebnis, Fehlerbetrachtung, Fazit). Die Textfelder bleiben bewusst leer und lassen sich im Browser beschriften; danach drucken oder als PDF speichern. Die Datei ist eigenständig, ohne Skripte und ohne externe Inhalte.
- **Bewegung verfolgen (Marker):** In Schritt 2 wählt man einen Marker (dunkle Kugel, Klebepunkt) mit einem Rechteck, setzt über zwei Punkte mit bekanntem Abstand den Maßstab und nimmt auf oder wertet das Video aus. Die App findet den Marker in jedem Bild wieder (normierte Kreuzkorrelation, Unterpixel-Genauigkeit, Vorhersage bei schneller Bewegung) und liefert Ort x und y in Metern. Geschwindigkeit und Beschleunigung ergeben sich über „Neue Größe → Ableitung“. Verlässt der Marker das Bild, fehlen die Werte, bis er wieder auftaucht. Die Suche rechnet im kleinen Fenster um die vorhergesagte Position (etwa 1,4 ms je Bild bei 640 × 360), deshalb läuft das Fadenkreuz bei Kamera und Demo in jedem Anzeigebild mit und zeigt x und y live. Auf der Demo-Pendelkugel trifft der Sinus-Fit ω = 2π/4 s auf fünf Stellen.
- **Lichtschranke aus der Kamera:** Eine kleine Bildzone misst die Helligkeit über der Zeit. Läuft ein Körper hindurch, erkennt die App die Durchgänge (auf unter einen Bildabstand genau interpoliert) und liefert Zeit zwischen den Durchgängen, Periodendauer (jeder zweite Durchgang) und mit der Körperbreite die Geschwindigkeit, jeweils mit Unsicherheit. Die Werte lassen sich in die Parameterreihe übernehmen. Für schnelle Vorgänge gibt es Messraten bis 60 pro Sekunde. Auf der Demo-Pendelkugel: 2,001 ± 0,010 s zwischen den Durchgängen, 4,000 ± 0,010 s Periodendauer.
- **Bildanker:** Ein ruhender, kontrastreicher Punkt im Bild wird verfolgt, jedes Bild wird vor dem Ablesen um dessen Verschiebung zurückgeschoben (nur Verschieben, kein Drehen oder Zoomen). Auf der wackelnden Demo-Kamera sinkt der größte Ablesefehler der Zeigerspannung von 0,31 V auf 0,006 V. Mit echter Kamera ungetestet.
- **Barrierefreiheit:** Der Graph wird in Worten beschrieben (Messpunkte, Bereich, Extremwerte, Form des Verlaufs, Fit). „Graph hören“ macht den Verlauf als Tonfolge hörbar (Tonhöhe folgt dem Wert), „Graph vorlesen" nutzt eine lokale deutsche Stimme, falls vorhanden. Mit den Pfeiltasten geht man im Graphen von Messpunkt zu Messpunkt, jeder Punkt wird für Screenreader angesagt. Dazu die Option „Messwerte ansagen“ in Schritt 3.
- **Mikrofon als Frequenzmesser:** Statt der Kamera liefert das Mikrofon (oder der Demo-Ton) die Grundfrequenz des lautesten Tons (FFT mit Parabel-Interpolation, etwa 0,2 Hz genau) und den relativen Pegel. Anzeige mit Oszilloskop, Spektrum und Tonname; Aufnahme, Fit, Export und Protokoll wie bei den Geräten. Echo-Unterdrückung, Rauschfilter und automatische Lautstärke sind aus. Auf dem Demo-Ton trifft der Sinus-Fit die Frequenz 440 Hz ± 110 Hz bis auf 0,05 Hz.
- **Aufgabe für die Klasse:** Lehrkräfte speichern aus ihrem Aufbau eine Aufgabendatei (Aufgabenstellung, Hinweise, Vorlage mit Eingaben, kalibrierte Geräte, optional ausgeblendetes Ergebnis). Schüler laden sie in Schritt 1, die Aufgabenkarte steht dann in jedem Schritt oben. Die Datei ist Text und wird beim Laden geprüft und gekürzt.
- **Neue Größen:** Ableitung und Integral nach der Zeit sowie Formeln wie `Gerät_1*Gerät_2` (mit Fehlerfortpflanzung). Der Formelparser rechnet selbst und führt keinen Code aus.
- **Export:** CSV (deutsch mit `;` und Dezimalkomma oder international), XLSX (eine Tabelle pro Reihe), PNG-Graph mit Titel, Name und Datum.
- **Offline und installierbar:** Nach dem ersten Besuch ist die App ohne Netz nutzbar (Hinweis „Offline nutzbar“ in der Fußzeile) und lässt sich über das Browsermenü als App installieren. Gedacht für Physiksäle mit schwachem WLAN.
- **Unterricht:** Beamer-Modus (`B`), Darstellung Hell, Dunkel oder Hoher Kontrast, Handy-Layout mit Schritten in Daumenreichweite, Tastenkürzel (`?`), automatisches Speichern der Sitzung, Kalibrierung als Datei speichern und laden.

| Geräte kalibrieren | Auswertung mit zwei y-Achsen |
|---|---|
| ![Geräte kalibrieren](docs/screenshots/02-geraete.png) | ![Graph über der Zeit](docs/screenshots/04-auswertung-zeit-zwei-achsen.png) |

| Kanal über Kanal (z. B. U über I) | Beamer-Modus |
|---|---|
| ![Kanal über Kanal](docs/screenshots/03-auswertung-kanal-ueber-kanal.png) | ![Beamer-Modus](docs/screenshots/05-beamer-modus.png) |

| Dunkle Darstellung | Auf dem Handy |
|---|---|
| ![Dunkle Darstellung](docs/screenshots/06-dunkel.png) | ![Handy-Ansicht](docs/screenshots/07-handy.png) |

Alle Bilder stammen aus der laufenden App mit der eingebauten Demo-Quelle (synthetisches Zeigerinstrument und Digitalanzeige). Der Workflow `Screenshots aktualisieren` erzeugt sie bei Änderungen an der Oberfläche automatisch neu.

## Benutzung
Vier Schritte, oben als Register: **1 Quelle → 2 Geräte → 3 Messen → 4 Auswertung**.

1. **Quelle:** Kamera, Videodatei oder Demo wählen.
2. **Geräte:** Zeigerinstrument oder Digitalanzeige anlegen und kalibrieren. Beim Zeigerinstrument: Drehpunkt klicken, dann zwei Skalenstriche anklicken und den jeweiligen Wert im Dialog eingeben („Skala größer als 180°“ umschalten, falls nötig). Bei der Digitalanzeige: Rechteck eng um die Ziffern ziehen, Ziffernanzahl und ggf. Dezimalstellen einstellen.
3. **Messen:** Aufnahme starten oder Video auswerten.
4. **Auswertung:** Achsen wählen, Graph prüfen, exportieren.

## Auf GitHub Pages veröffentlichen
Der Workflow `.github/workflows/pages.yml` baut die Seite bei jedem Push auf `main` und veröffentlicht sie.
Einmalig im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen. Danach ist die App unter `https://<benutzer>.github.io/<repository>/` erreichbar. Die Kamera funktioniert dort, weil GitHub Pages HTTPS verwendet.

## Entwicklung
```bash
npm install
npm run dev               # Entwicklungsserver
npm test                  # Unit-Tests (Reader, Session, Export, Bildhinweise, Speicherung)
npm run build             # Produktionsbuild nach dist/
node tests/e2e-demo.mjs   # E2E mit Demo-Quelle (Dev-Server auf :5173 nötig, Playwright installiert); prüft u. a., dass keine externe Anfrage stattfindet
node tests/screenshots.mjs  # erzeugt die Bilder in docs/screenshots
node tests/guide-screenshots.mjs  # erzeugt die Bilder der Anleitung in public/anleitung-bilder
npm run build && npx vite preview --port 4173 && node tests/e2e-offline.mjs   # Offline-Test: Neuladen ohne Netz, Demo liest weiter
```

Struktur: `src/readers` (Analog/Digital), `src/source` (Kamera/Datei/Demo), `src/session` (Daten), `src/export`, `src/ui` (Icons, Graph), `src/quality.ts` (Bildhinweise), `src/storage.ts` (Speichern), `src/sampler.ts`. Gestaltung: `PRODUCT.md`, `DESIGN.md`. Rechenlogik für Fit, Unsicherheit und abgeleitete Größen: `src/analysis`. Entwurf dazu: `docs/superpowers/specs/`.

## Grenzen
- Digital: 7-Segment-Anzeigen werden per Segmentabtastung gelesen. Für LCD (schwacher Kontrast, Schrägschrift, Lichtverlauf) und Punktmatrix-Anzeigen (5×7) gibt es den Zeichenvergleich, im Modus „automatisch“ als Rückfall. Er kennt eingebaute Vorlagen und lernt die Ziffern des eigenen Geräts an. Andere Schriften (Buchstaben, Sonderzeichen) liest er nicht; bei Punktmatrix zählt der Dezimalpunkt als eigene Zelle.
- Mikrofon: Der Pegel ist relativ, kein geeichter Schalldruckpegel. Mit dem echten Mikrofon ist die Funktion nicht getestet (nur mit dem Demo-Ton und synthetischen Signalen); Eingangsempfindlichkeit und Rauschen hängen vom Gerät ab. Gemessen wird der lauteste Ton; zwei Töne gleichzeitig (Schwebung) erscheinen als schwankender Pegel, nicht als zwei Frequenzen.
- Lichtschranke: Die Zeitauflösung ist ein Bildabstand (bei 30 Bildern pro Sekunde etwa 33 ms, interpoliert deutlich besser). Wechselndes Licht im Raum kann Durchgänge vortäuschen; die Grundhelligkeit wird über die ganze Aufnahme gemittelt.
- Markerverfolgung: Die Kamera muss ruhig stehen (Verrutschen wird nicht ausgeglichen), der Marker darf sich nicht stark drehen oder verdecken, und Bewegungsunschärfe verschlechtert das Ergebnis. Bei Livequellen beginnt die Suche an der gewählten Stelle. Linsenverzerrung und Tiefenbewegung (auf die Kamera zu) sind nicht korrigiert, der Maßstab gilt nur in der Ebene der beiden Punkte.
- Die Kamera sollte ruhig stehen (Stativ); die Kalibrierung gilt für einen festen Bildausschnitt.
- Beim Multimeter-Bereichswechsel warnt die App bei Sprüngen um Faktor 10, 100 oder 1000. Einheit und Dezimalstellen müssen weiter von Hand angepasst werden; Sprünge um andere Faktoren als Zehnerpotenzen erkennt sie nicht.
- Offline: Nach dem ersten Laden (einmal mit Netz) läuft die App ohne Netz, auch nach einem Neustart des Browsers. Neue Versionen kommen beim nächsten Laden mit Netz an. Die Kamera braucht weiterhin eine sichere Adresse (HTTPS oder localhost); Videodatei und Demo gehen immer.
- Bisher mit synthetischen Bildern und der Demo getestet, noch nicht an echten PHYWE-Geräten oder Multimetern.
