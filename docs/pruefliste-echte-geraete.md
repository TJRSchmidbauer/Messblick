# Prüfliste für echte Geräte

Die automatischen Tests (Unit-Tests, Playwright mit Demo-Quellen) kennen weder echte Kameras noch Mikrofone, Beamer oder Screenreader. Diese Liste ist für den Test im Unterricht oder zu Hause gedacht. Pro Punkt notieren: Gerät, Browser, Ergebnis (ok, Problem + kurze Beschreibung).

Vorbereitung: Seite über HTTPS öffnen (GitHub Pages), Cache leeren, einmal vollständig laden und prüfen, dass „offline bereit“ erscheint.

## 1. Kamera und Ablesen
- [ ] Handy-Rückkamera wird gewählt und zeigt ein Live-Bild (iOS Safari, Android Chrome).
- [ ] Zeigerinstrument kalibrieren (Pivot, zwei Referenzen) und mit einer Handmessung vergleichen: Abweichung unter einem Skalenteil?
- [ ] 7-Segment-Multimeter ablesen; danach ein LCD mit schwachem Kontrast und „Zeichen anlernen“ testen.
- [ ] Die Belichtungsautomatik ändert die Helligkeit bei Handbewegung: Ablesung bleibt stabil?
- [ ] Stativ leicht verrücken, Bildanker setzen: Wird die Verschiebung ausgeglichen?

## 2. Marker und Lichtschranke
- [ ] Pendel mit farbigem Klebepunkt bei Raumlicht verfolgen: Bleibt die Verfolgung dran, wie viele Bilder gehen verloren?
- [ ] Lichtschranke an einem echten Pendel: Periodendauer mit Stoppuhr vergleichen.
- [ ] Videodatei vom Handy (30 und 60 Bilder/s) auswerten: Läuft die Auswertung in angemessener Zeit?

## 3. Mikrofon
- [ ] Mikrofonfreigabe wird erfragt und angenommen; ohne Freigabe erscheint eine verständliche Meldung.
- [ ] Stimmgabel 440 Hz in 10 cm und in 1 m Abstand: Wird der Ton erkannt, Abweichung?
- [ ] Raumgeräusch allein: Zeigt die App „kein Ton erkannt“ und keine Zufallswerte?
- [ ] Resonanzrohr: Schallgeschwindigkeit plausibel (um 340 bis 345 m/s bei 20 °C)?

## 4. Bedienung
- [ ] Beamer-Modus: Lesbarkeit aus der letzten Reihe.
- [ ] Nur Tastatur: Alle Schritte erreichbar, Graph per Pfeiltasten, Ansage der Messpunkte.
- [ ] Screenreader (NVDA, VoiceOver, TalkBack): Graphbeschreibung, Ergebnisse, Fehlermeldungen werden vorgelesen?
- [ ] Sonifikation des Graphen hörbar und verständlich.
- [ ] Zwei Klassen- oder Gruppenwerte per Code und per Link in die Klassenansicht übernehmen.

## 5. Export und Offline
- [ ] CSV in Excel/LibreOffice öffnen (Komma als Dezimaltrenner, Umlaute).
- [ ] XLSX-Blätter vollständig; Protokoll drucken oder als PDF speichern.
- [ ] Flugmodus: App startet und misst mit der Demo.

## Rückmeldung
Probleme bitte als Issue im Repository melden, mit Gerät, Browser, Schritten und möglichst Screenshot. Messwerte aus Schulversuchen ersetzen keine Prüfung durch die Lehrkraft.
