# Teilprojekt 1: Auswertung (Fit, Messunsicherheit, abgeleitete Größen)

Stand: 2026-11-09 · Status: Entwurf zur Durchsicht

## Zweck und Erfolgskriterium
Lehrkräfte (und Schüler) sollen im Unterricht aus einer Messreihe sofort das physikalische Ergebnis ablesen können (z. B. Zeitkonstante τ, Halbwertszeit, Planck-Konstante aus der Geradensteigung), mit Messunsicherheit, so wie es die Pflichtexperimente in Q12/Q13 eA verlangen. **Erfolg:** Eine Entladekurve (Kondensator) wird aufgenommen, im Graphen wird der Abfall markiert, das Modell „Zerfall mit Offset“ gewählt, und die App zeigt τ ± σ und R² mit Fitkurve und Residuen, ohne dass Daten exportiert werden müssen.

Rahmen aus PRODUCT.md: alles lokal im Browser, nur Deutsch, bedienbar am Beamer und auf dem Tablet, Design nach DESIGN.md (Kanalfarbe + Symbol, Register Rule).

Teil einer Zerlegung: 1 Auswertung → 2 Versuchsvorlagen/Offline → 3 Protokoll/Abgabe → 4 Robustheit an echten Geräten. Diese Spec deckt nur 1 ab.

## Im Umfang
1. **Fit** mit Modellwahl und Fitbereich (Ziehen im Graphen), Ergebnisbox, Fitkurve, Residuen-Plot.
2. **Messunsicherheit pro Gerät** mit Fehlerbalken; Fit gewichtet damit.
3. **Abgeleitete Kanäle:** Ableitung, Integral, Formelkanal (z. B. `U*I`) mit Fehlerfortpflanzung.
4. **Export:** Fitergebnis im XLSX-Zusatzblatt „Fit“ und in der PNG-Beschriftung.

## Nicht im Umfang
Automatische Modellauswahl, Versuchsvorlagen (Teil 2), PDF/Word-Protokoll (Teil 3), Resonanzkurve und Poisson-Fit mit Untergrund (spätere Modelle), Speichern von Fits in der Sitzung über das Neuladen hinaus (nur Messdaten werden gespeichert; Fit wird nach dem Laden neu gewählt).

## Architektur
Neues Verzeichnis `src/analysis/`, reine Logik ohne DOM (Tests laufen mit Vitest in Node):

| Datei | Aufgabe | Abhängig von |
|---|---|---|
| `fit/models.ts` | Modelldefinitionen: `id`, `name`, `formula` (Anzeigetext), `params` (Namen/Einheitenregel), `f(x, p)`, `guess(punkte)` | – |
| `fit/linear.ts` | Gewichtete lineare Regression `y = a·x + b` und `y = a·x` in geschlossener Form, inkl. Parameter-Unsicherheit | – |
| `fit/lm.ts` | Gewichtetes Levenberg–Marquardt, numerische Jacobi-Matrix, Kovarianz aus `(JᵀWJ)⁻¹`, χ²_red, R² | – |
| `fit/fit.ts` | `fitModel(model, points, {range?}) → FitResult` (Parameter ± σ, R², χ²_red, n, Warnungen, Residuen) | models, linear, lm |
| `uncertainty.ts` | `sigmaOf(config, value, ctx)` je Modus (siehe unten) | – |
| `derive.ts` | `derivative`, `integral`, `evalFormula` (eigener Parser, kein `eval`) mit Fehlerfortpflanzung | uncertainty |

**Modelle (erste Version):** Gerade `a·x+b`, Proportional `a·x`, Zerfall mit Offset `A·e^(−x/τ)+C`, Sättigung `A·(1−e^(−x/τ))+C`, Potenz `a·x^b`, Sinus mit Offset `A·sin(ω·x+φ)+C`, gedämpfter Sinus `A·e^(−δ·x)·sin(ω·x+φ)+C`.

**Messunsicherheit (`uncertainty.ts`):** Modi pro Kanal:
- `class`: σ = Klasse/100 × Messbereichsendwert (Zeigerinstrument; Ablesefehler optional zusätzlich quadratisch addiert),
- `digits`: σ = n × Ziffernschritt (Digitalanzeige; Schritt aus den Dezimalstellen),
- `abs`: fester ±-Wert,
- `poisson`: σ = √N (Zählraten),
- `none` (Standard): σ unbekannt.

`Session`/`ChannelDef` bekommen ein optionales Feld `uncertainty`. Gespeicherter Zustand bleibt `version: 1` (neues Feld optional, ältere Dateien laden unverändert).

**Abgeleitete Kanäle:** `ChannelDef.derived?: { kind: 'derivative'|'integral'|'formula'; of?: string; expr?: string }`. Werte werden bei Bedarf aus den Samples berechnet (nicht gespeichert) und stehen in `series()`, `table()` und den Exporten wie echte Kanäle zur Verfügung. Ableitung: zentrale Differenzen (Ränder einseitig), bei aktivierter Glättung auf der geglätteten Reihe. Integral: Trapezregel, kumulativ. Formelparser: Zahlen, Kanalnamen (Bezeichner = Kanalname mit `_` statt Leerzeichen, z. B. `Gerät_1`; die Oberfläche bietet zum Einfügen Schaltflächen je Kanal an), `+ - * / ^`, Klammern, `sqrt ln exp sin cos abs`. Fehlerfortpflanzung numerisch über zentrale Differenzen der Ausdrucks-Funktion nach jedem Eingangskanal (Gauß, unkorreliert).

## Bedienung (Schritt 4 „Auswertung“)
- **Kanalkarte (Schritt 2):** Bereich „Unsicherheit“ mit Modus-Auswahl und den nötigen Feldern (Klasse + Messbereich, Ziffernschritte, fester Wert). Leer = keine Fehlerbalken, Fit ungewichtet.
- **Graph:** Fehlerbalken als kleines Chart.js-Plugin (vertikale Balken, in Kanalfarbe). Schalter „Bereich wählen“: solange aktiv, markiert Ziehen den Fitbereich (halbtransparentes Band) und Zoom/Verschieben sind pausiert; sonst unverändert.
- **Fit-Leiste:** Modell-Auswahl, Datenreihe (y-Kanal des Graphen), „Fit berechnen“ (automatisch bei Änderung). Ergebnisbox mit Formel, Parametern ± σ (sinnvoll gerundet auf 2 signifikante Stellen der Unsicherheit), R², n Punkte, Warnungen. Fitkurve als zusätzliche Reihe, darunter ein zweiter, flacher Graph mit Residuen.
- **Abgeleitete Größe:** Schaltfläche „Neue Größe“ (Ableitung, Integral, Formel) legt einen Kanal mit Name und Einheit an; er bekommt eine eigene Kanalfarbe/-form (max. vier Kanäle gesamt bleibt bestehen, abgeleitete zählen mit).
- **Export:** XLSX-Blatt „Fit“ (Modell, Formel, Parameter, σ, R², Bereich, Datenreihe). PNG-Beschriftung erhält die Ergebniszeilen unter dem Titel. CSV unverändert.
- Fitergebnis und Bereich sind Sitzungsstatus im Speicher; Neuladen verwirft sie.

## Fehlerbehandlung (deutsche Meldungen mit Hilfe)
| Fall | Verhalten |
|---|---|
| weniger Punkte als Parameter + 1 | kein Fit; „Zu wenige Punkte im Bereich (n = …, nötig ≥ …). Bereich größer wählen.“ |
| LM konvergiert nicht / singulär | Ergebnis markiert „nicht belastbar“, Hinweis „Anderes Modell oder anderen Bereich wählen“ |
| Potenz/log-Achse mit x ≤ 0 oder y ≤ 0 | Punkte ausgelassen, Anzahl genannt; sonst Fehlermeldung |
| σ = 0 oder keine Unsicherheit | ungewichteter Fit; σ der Parameter aus Residuenstreuung; Hinweis in der Ergebnisbox |
| ungültiger Ausdruck im Formelkanal | Fehlermeldung an der Eingabe mit Position; nichts wird angelegt |
| Division durch 0 / NaN | Punkt entfällt, Anzahl wird angezeigt |

## Tests
Unit (Vitest, Node, feste Zufallssaat):
- `linear`: exakte Parameter bei rauschfreien Daten; bekannte σ-Formeln; gewichtet vs. ungewichtet.
- `lm`: synthetischer Zerfall `A·e^(−x/τ)+C` mit bekanntem σ: Parameter innerhalb 3σ der gemeldeten Unsicherheit in ≥ 95 % von 200 Läufen; Sinus aus der Demo-Kurve (ω ≈ 1/3, A ≈ 4, C ≈ 5); Randfälle (zu wenige Punkte, Konstante Daten, NaN).
- `uncertainty`: Güteklasse 1,5 bei 10 V → 0,15 V; Digitalschritt; Poisson.
- `derive`: Ableitung von sin, Integral von Konstante/Gerade gegen analytische Werte; Parser (Priorität, Klammern, Fehlerfälle, keine Code-Ausführung); Fehlerfortpflanzung `U/I` gegen die analytische Formel.
E2E (Playwright, Demo-Quelle): Kanal „Spannung“ mit Unsicherheit, Fit „Sinus mit Offset“ auf der Dateiauswertung, Ergebnisbox zeigt ω ≈ 0,33 und A ≈ 4; XLSX enthält Blatt „Fit“; Konsolenfehler = 0.

## Offene Entscheidungen (mit Vorgabe, falls keine Gegenrede)
- Rundung der Parameter: 2 signifikante Stellen der Unsicherheit.
- Start-Heuristik pro Modell (z. B. τ aus Zeit bis 1/e) statt Nutzereingabe von Startwerten.
- Abgeleitete Kanäle zählen zum Maximum von vier Kanälen.
