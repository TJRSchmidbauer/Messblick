# Messung am Demo-Multimeter: Befunde und Zahlen

Anlass: Ein Handyvideo eines Demo-Voltmeters (Skala 0 bis 30 V) wurde mit Messblick nicht richtig abgelesen. Dieses Dokument hält fest, was die Untersuchung ergeben hat, wie gemessen wurde und was sich daraus im Programm geändert hat. Das Video selbst liegt nicht im Repository.

## Das Video

- 1816 × 1080 Bildpunkte, H.264, 29,97 Bilder pro Sekunde, 15,9 s.
- Skala von 0 bis 30 V, etwa 70° Bogen, Zeiger schwingt in drei Wellen zwischen 0 und etwa 29 V.
- **Der Drehpunkt des Zeigers ist nicht sichtbar.** Er liegt hinter der schwarzen Frontplatte, etwa 160 Bildpunkte (Originalauflösung) unter dem Skalenfenster. Sichtbar ist nur der obere Teil des Zeigers.

## Vergleichsmessung („Wahrheit“)

Für jedes Videobild wurde der Zeigerwinkel unabhängig vom Programm bestimmt: Je Bild wurde in mehreren Bildzeilen unterhalb der Skala der dunkelste Punkt gesucht und durch diese Punkte eine Gerade gelegt (Ausreißer verworfen). Der Schnittpunkt der Geraden aus allen Bildern ist der Drehpunkt (etwa x = 1145, y = 906). Aus dem Winkel folgt der Sollwert über die Skalenstriche (0 V bei −133,3°, 30 V bei −62,7°).

Grenzen: Die Vergleichsmessung ist selbst eine Näherung und bei den schnellen Schwingungen unsicher (der Zeiger ist verwischt). Es ist ein einziges Video von einem Gerät. Zwischen Vergleichsmessung und Programm bestand ein Zeitversatz von etwa 0,1 s, der beim Vergleich ausgeglichen wurde.

Das Skript: [`zeigerwinkel.py`](zeigerwinkel.py).

## Ursachen

1. **Verdeckter Drehpunkt.** Die App verlangte einen Klick auf den Drehpunkt. Wer stattdessen das untere sichtbare Zeigerende anklickt, kalibriert eine falsche Geometrie.
2. **Falsche Bogenrichtung.** „Skala größer als 180°“ war standardmäßig an (passend zur 270°-Skala der eingebauten Demo). Ein Demo-Multimeter überstreicht etwa 100°.
3. **Suche im ganzen Kreis.** Der Zeiger wurde als dunkelste Richtung im Vollkreis gesucht. Gehäuse, Abdeckung und Beschriftung sind an echten Geräten oft dunkler als der dünne Zeiger.
4. **Zu wenige Messpunkte.** Videodateien wurden mit 2 Messpunkten pro Sekunde ausgewertet: 32 Punkte für 16 s, der Graph sah dünn aus.
5. **Alte Version im Browser.** Nach einer Veröffentlichung zeigte der erste Neuladevorgang noch die alte Seite aus dem Offline-Speicher.

## Zahlen

### Zeigerleser auf 26 Einzelbildern (0,5-s-Raster), richtiger Drehpunkt

| Leser | Bilder auf ±0,5 V richtig | mittlerer Fehler |
|---|---|---|
| vorher, Standard (großer Bogen) | 0 von 26 | 11,4 V |
| vorher, kleiner Bogen | 0 von 26 | 34,5 V |
| nachher | 14 von 26 | 0,7 V |

Mit einem Klick auf das sichtbare Zeigerende statt des verdeckten Drehpunkts: vorher 3 von 26 (8,6 V), nachher 4 von 26 (6,8 V), und die App meldet „sehr unsicher“ und warnt vor dem unpassenden Drehpunkt.

### Gesamte Auswertung in der App (10 pro Sekunde, 135 Bilder mit Vergleichswert)

| Kalibrierung | Median-Abweichung | 90 % der Bilder unter |
|---|---|---|
| „Drehpunkt verdeckt“, drei Skalenstriche | etwa 0,4 V (Zeitversatz −0,1 s) | 0,94 V |
| Drehpunkt auf das sichtbare Zeigerende geklickt | etwa 4,7 bis 5,4 V | etwa 20 V |

Die Abweichungen sind in den ruhigen Phasen klein (wenige Zehntel Volt) und wachsen bei den schnellen Schwingungen (verwischter Zeiger).

### Einfluss ungenauer Klicks beim „Drehpunkt verdeckt“-Verfahren

Drei Skalenstriche mit zufälligem Klickfehler (je vier Versuche, 26 Bilder):

| Klickfehler | Median | 90 % | Maximum |
|---|---|---|---|
| ±0 Bildpunkte | 0,45 V | 2,09 V | 4,34 V |
| ±3 Bildpunkte | 0,35 V | 2,29 V | 4,64 V |
| ±6 Bildpunkte | 0,53 V | 1,99 V | 4,74 V |

Der Klickfehler ist damit kaum der bestimmende Fehler; die größten Abweichungen kommen von den schnell bewegten Phasen.

### Nachgebautes Multimeter (Unit-Test `tests/meter-real.test.ts`)

100°-Skala im dunklen Gehäuse, Drehpunkt unter der Abdeckung, Ziffern, Zeigerschatten, Lichtverlauf, blasser Zeiger: alle Stellungen von 0 bis 10 V werden auf ±0,1 V gelesen. Eine Ablesung dauert etwa 4 ms.

### Messpunkte und Auswertezeit (16-s-Video, 1080p)

| Verfahren | Messpunkte | Dauer |
|---|---|---|
| 2 pro Sekunde, Springen | 32 | 7 s |
| 30 pro Sekunde, Springen | 477 | 96 s |
| 30 pro Sekunde, Abspielen | 473 | 30 s |

Ein Sprung zu einem Bild kostete in diesem Test 181 ms (Dekodieren ab dem letzten Schlüsselbild), das Auslesen des Bildes etwa 10 ms, beim Abspielen kam ein Bild nach etwa 35 ms. Die Werte aus dem Abspielen weichen von denen aus dem Springen im Median um 0,17 V ab (90 % unter 0,36 V, Maximum 0,61 V). Beim Abspielen fehlten vereinzelt Bilder (größter Abstand 0,067 s statt 0,033 s). Die Zeiten hängen von Gerät und Browser ab; gemessen wurde in einem Chromium ohne Oberfläche.

### Update-Weg der Seite

Alte Version und neue Version nacheinander ausgeliefert: Mit dem Service Worker „Cache zuerst“ zeigte der erste Neuladevorgang noch die alte Seite, erst der zweite die neue. Jetzt (Netz zuerst für die Startseite, Update-Suche bei jedem Start) genügt ein Neuladen, auch das Offline-Verhalten bleibt erhalten (`tests/e2e-update.mjs`).

## Was sich geändert hat

- Zeigerleser: Suche nur im Skalenbereich, Kontrast gegen den örtlichen Hintergrund, Median über die Radien (`src/readers/analog.ts`).
- Bogenrichtung wird am Zeiger erkannt.
- „Drehpunkt verdeckt“: Drehpunkt aus drei Skalenstrichen berechnet; Warnung bei unpassendem Drehpunkt.
- Skalenbogen, Skalenenden mit Werten und gelesener Zeiger werden ins Bild gezeichnet; Warnung, wenn der Wert außerhalb der Skala liegt.
- Videodateien: Standardrate 30, Hinweis auf die Punktzahl, Restzeit, Abspielen statt Springen ab 10 pro Sekunde.
- Update-Weg und Versionsanzeige.

## Offen

- Nur ein Gerät und ein Video untersucht; weitere Messgeräte (anderer Zeiger, Spiegelskala, Messer mit Schatten) fehlen.
- Schräge Aufnahmen (die Skala erscheint als Ellipse) und starke Spiegelungen auf der Scheibe sind nicht untersucht.
- Ob ein verwischter Zeiger bei schnellen Bewegungen besser aus der Zeigermitte oder dem Schwerpunkt gelesen wird, wurde nicht geprüft.
- Auf Handys wurde weder das Abspielen noch das Springen gemessen.
