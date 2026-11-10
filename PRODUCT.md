# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Physiklehrkräfte am bayerischen Gymnasium und ihre Schülerinnen und Schüler, schwerpunktmäßig Q12/Q13 (auch erhöhtes Anforderungsniveau). Zwei gleichwertige Einsatzszenarien: Lehrerversuch am Laptop mit Beamer (Klasse schaut zu) und Schülerexperimente in Gruppen an Tablet oder Handy. Dieselbe Oberfläche muss in beiden funktionieren.

## Product Purpose
Ein analoges oder digitales Messgerät (z. B. PHYWE-Demo-Zeigerinstrument, Multimeter) wird per Kamera oder Videodatei abgefilmt. Die App liest die Werte ab und liefert Messreihen als CSV/XLSX sowie Graphen (Wert über Zeit oder über einem zweiten Messgerät). Erfolg: Im Unterricht ohne Zusatzhardware aus einem Versuch auswertbare Daten gewinnen.

## Positioning
Kamera statt Messschnittstelle: funktioniert mit den Messgeräten, die die Schule ohnehin besitzt, ohne Sensorik-Anschaffung. Zugleich kostenlos, ohne Installation und ohne Konto.

## Operating Context
Physiksaal, Unterrichtsstunde mit knapper Zeit; wechselnde Bediener; teils unzuverlässiges Schul-WLAN; Projektor/Beamer; Kamera auf Stativ oder Handy.

## Capabilities and Constraints
- Läuft komplett im Browser (Vite + TypeScript, statisch, GitHub Pages); Video verlässt das Gerät nie.
- Quellen: Kamera, Videodatei, Demo. Mehrere Kanäle gleichzeitig; Zeiger- (Winkel) und 7-Segment-Reader.
- Export CSV (deutsch/international), XLSX, PNG.
- Nur Deutsch; Fachbegriffe wie im LehrplanPLUS Bayern.
- Offline im Physiksaal nutzbar: Service Worker speichert die App beim ersten Laden; installierbar (Manifest, Symbole).
- Noch nicht an echten Geräten getestet.

## Brand Commitments
Name: „Physik-Messwerterfassung“. Visuelle Marke: schmidbauer.io (Corporate Design): Apricot #F6B48F, Ziegelrot #E8836B, Kohle #2E2A28, Creme #FBF4EC, Link #A0502C; Schriften Space Grotesk (Überschriften), Atkinson Hyperlegible (Text), JetBrains Mono (Zahlen); Wortmarke „ts.“; flächig und ruhig, keine Verläufe, keine Schatten. Claim: „Verstehen. Bauen. Teilen.“
Keine Verweise auf fremde Webseiten und keine fremd geladenen Ressourcen (Schriften, Skripte, Bilder): alles wird mitausgeliefert. Einzige Ausnahme sind die Links „Impressum“ und „Datenschutz“ in der Fußzeile auf die eigene Seite schmidbauer.io; sie laden nichts nach, sondern öffnen erst beim Anklicken in einem neuen Tab.

## Evidence on Hand
Demo-Quelle und synthetische Testbilder; keine realen Fotos oder Videos von PHYWE-Geräten oder Multimetern vorhanden. Lehrplanbezug: LehrplanPLUS Physik 12/13 eA.

## Product Principles
1. Im Unterricht zählt jede Minute: der Weg vom Aufbau zur ersten Messkurve muss kurz und geführt sein.
2. Lokal und privat: kein Upload, keine Konten, auch offline nutzbar.
3. Ablesung ist nachvollziehbar: Live-Wert, Konfidenz und manuelle Korrektur sind immer sichtbar.
4. Fachlich passend zum Lehrplan: Auswertungen sprechen die Sprache der Experimente in Q12/Q13.
5. Beamer und Touch gleichwertig: lesbar aus der letzten Reihe und bedienbar mit dem Daumen.

## Accessibility & Inclusion
Projektortauglicher Kontrast, Tastaturbedienung und Signale nicht allein über Farbe (konkrete Norm nicht festgelegt). Graph als Text beschrieben, hörbar (Sonifikation) und per Tastatur punktweise erkundbar; Messwerte für Screenreader ansagbar. Nicht mit Screenreadern geprüft, nur per Test der Bedienwege.
