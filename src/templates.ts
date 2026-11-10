import { evalWithError, parseExpression, uncertaintyBudget, type BudgetItem } from './analysis/derive';
import { compareToLiterature, type Comparison } from './analysis/literature';
import type { Transform } from './analysis/variation';

/**
 * Versuchsvorlagen: stellen Kanäle, Achsen und Fitmodell passend zu einem Standardversuch ein
 * und rechnen aus den Fitparametern die gesuchte Größe samt Unsicherheit und Literaturvergleich.
 * Themenbereiche zur Orientierung; die Zuordnung zu Jahrgangsstufe und Lehrplan bitte vor dem Einsatz prüfen.
 */

export interface TplInput {
  id: string;
  label: string;
  unit: string;
  /** Eingabe ist nur für den Vergleich nötig (nicht für das Ergebnis). */
  optional?: boolean;
}

export interface TplLiterature {
  label: string;
  /** Fester Wert (Naturkonstante) ... */
  value?: number;
  /** ... oder Ausdruck über die Eingaben (z. B. Nennwert, Thomson-Formel). */
  expr?: string;
  source?: string;
}

export interface TplResult {
  label: string;
  unit: string;
  /** Ausdruck über Fitparameter (Namen wie im Fit, z. B. τ, a) und Eingaben (id). Konstante pi ist erlaubt. */
  expr: string;
  lit?: TplLiterature;
}

export type TplMode = 'time' | 'channels' | 'series';

export interface Template {
  id: string;
  title: string;
  topic: string;
  summary: string;
  steps: string[];
  mode: TplMode;
  /** Messgröße kommt vom Mikrofon (Frequenz oder Pegel) statt von Kamerageräten. */
  audio?: boolean;
  /** Geräte in Reihenfolge: Name und Einheit; bei mode 'channels' ist das erste die x-, das zweite die y-Achse. */
  channels?: { name: string; unit: string; poisson?: boolean }[];
  /** Fitmodell für time/channels. */
  fit?: string;
  /** Beschriftungen und Auftragung für mode 'series'. */
  series?: { pname: string; punit: string; vname: string; vunit: string; tx: Transform; ty: Transform; model: string };
  inputs: TplInput[];
  results: TplResult[];
}

const E = '1.602176634e-19';
const H_LIT: TplLiterature = { label: 'Literaturwert', value: 6.62607015, source: 'exakt festgelegt (SI)' };

export const TEMPLATES: Template[] = [
  {
    id: 'kond-entladen', title: 'Kondensator entladen', topic: 'Elektrisches Feld, Kondensator, Zeitkonstante', mode: 'time',
    summary: 'Spannung am entladenen Kondensator über der Zeit; aus der Zeitkonstante τ = R·C folgt die Kapazität.',
    steps: ['Ein Spannungsmessgerät anlegen und kalibrieren.', 'Kondensator laden, Aufnahme starten, Entladung über R aufnehmen.', 'In der Auswertung stimmt das Modell „Zerfall mit Offset“ schon; Fitbereich bei Bedarf wählen.', 'Widerstand R eintragen.'],
    channels: [{ name: 'Spannung U', unit: 'V' }], fit: 'decay',
    inputs: [{ id: 'R', label: 'Widerstand R', unit: 'Ω' }, { id: 'Cnenn', label: 'Nennwert der Kapazität', unit: 'µF', optional: true }],
    results: [
      { label: 'Zeitkonstante τ', unit: 's', expr: 'τ' },
      { label: 'Kapazität C = τ/R', unit: 'µF', expr: 'τ/R*1e6', lit: { label: 'Nennwert', expr: 'Cnenn' } },
    ],
  },
  {
    id: 'kond-laden', title: 'Kondensator laden', topic: 'Elektrisches Feld, Kondensator, Zeitkonstante', mode: 'time',
    summary: 'Spannung am ladenden Kondensator über der Zeit; Sättigungsverlauf mit τ = R·C.',
    steps: ['Ein Spannungsmessgerät anlegen und kalibrieren.', 'Aufnahme starten, dann den Stromkreis schließen.', 'Modell „Sättigung“ ist voreingestellt.', 'Widerstand R eintragen.'],
    channels: [{ name: 'Spannung U', unit: 'V' }], fit: 'saturation',
    inputs: [{ id: 'R', label: 'Widerstand R', unit: 'Ω' }, { id: 'Cnenn', label: 'Nennwert der Kapazität', unit: 'µF', optional: true }],
    results: [
      { label: 'Zeitkonstante τ', unit: 's', expr: 'τ' },
      { label: 'Kapazität C = τ/R', unit: 'µF', expr: 'τ/R*1e6', lit: { label: 'Nennwert', expr: 'Cnenn' } },
    ],
  },
  {
    id: 'spule', title: 'Spule: Ausschaltvorgang', topic: 'Magnetisches Feld, Selbstinduktion, Induktivität', mode: 'time',
    summary: 'Strom durch eine Spule nach dem Abschalten; aus τ = L/R folgt die Induktivität.',
    steps: ['Ein Strommessgerät anlegen und kalibrieren.', 'Aufnahme starten, dann den Strom abschalten (Freilaufweg beachten).', 'Modell „Zerfall mit Offset“ ist voreingestellt.', 'Gesamtwiderstand R des Kreises eintragen.'],
    channels: [{ name: 'Stromstärke I', unit: 'A' }], fit: 'decay',
    inputs: [{ id: 'R', label: 'Gesamtwiderstand R', unit: 'Ω' }, { id: 'Lnenn', label: 'Nennwert der Induktivität', unit: 'mH', optional: true }],
    results: [
      { label: 'Zeitkonstante τ', unit: 's', expr: 'τ' },
      { label: 'Induktivität L = τ·R', unit: 'mH', expr: 'τ*R*1e3', lit: { label: 'Nennwert', expr: 'Lnenn' } },
    ],
  },
  {
    id: 'schwingkreis', title: 'Elektromagnetischer Schwingkreis', topic: 'Schwingungen, Schwingkreis, Thomson-Formel', mode: 'time',
    summary: 'Gedämpfte Schwingung der Kondensatorspannung; Periodendauer gegen Thomson-Formel T = 2π√(LC).',
    steps: ['Ein Spannungsmessgerät anlegen und kalibrieren; Bildrate hoch genug wählen (mind. 10 Punkte je Periode).', 'Aufnahme starten und den Schwingkreis anregen.', 'Modell „Gedämpfter Sinus“ ist voreingestellt.', 'L und C eintragen für den Vergleich mit der Thomson-Formel.'],
    channels: [{ name: 'Spannung U', unit: 'V' }], fit: 'dampedsine',
    inputs: [{ id: 'L', label: 'Induktivität L', unit: 'mH' }, { id: 'C', label: 'Kapazität C', unit: 'µF' }],
    results: [
      { label: 'Periodendauer T = 2π/ω', unit: 's', expr: '2*pi/ω', lit: { label: 'Thomson-Formel', expr: '2*pi*sqrt(L*1e-3*C*1e-6)' } },
      { label: 'Frequenz f = ω/2π', unit: 'Hz', expr: 'ω/(2*pi)' },
      { label: 'Abklingkonstante δ', unit: '1/s', expr: 'δ' },
    ],
  },
  {
    id: 'fotoeffekt', title: 'Fotoeffekt: Planck-Konstante', topic: 'Quantenphysik, Fotoeffekt, Einstein-Gleichung', mode: 'series',
    summary: 'Grenzspannung der Gegenfeldmethode über der Lichtfrequenz; Steigung und Achsenabschnitt der Geraden liefern h und die Austrittsarbeit.',
    steps: ['Ein Spannungsmessgerät (Gegenspannung) anlegen und kalibrieren.', 'Pro Farbfilter die Frequenz bestimmen (f = c/λ, f in 10¹⁴ Hz eintippen) und die Grenzspannung übernehmen.', 'Die Auftragung U₀ über f ist voreingestellt: Gerade.'],
    channels: [{ name: 'Grenzspannung U₀', unit: 'V' }],
    series: { pname: 'Frequenz f', punit: '10¹⁴ Hz', vname: 'Grenzspannung U₀', vunit: 'V', tx: 'id', ty: 'id', model: 'line' },
    inputs: [],
    results: [
      { label: 'Planck-Konstante h = e·a', unit: '10⁻³⁴ J·s', expr: `a*${E}/1e14/1e-34`, lit: H_LIT },
      { label: 'Austrittsarbeit W = −e·b', unit: 'eV', expr: '-b' },
    ],
  },
  {
    id: 'led-planck', title: 'Planck-Konstante mit LEDs', topic: 'Quantenphysik, Energie von Photonen', mode: 'series',
    summary: 'Schwellspannung verschiedenfarbiger LEDs über dem Kehrwert der Wellenlänge; die Steigung ist h·c/e.',
    steps: ['Ein Spannungsmessgerät anlegen und kalibrieren.', 'Pro LED die Wellenlänge λ (Datenblatt, in nm) eintippen und die Schwellspannung übernehmen. Die Schwelle immer gleich festlegen, z. B. bei 1 mA.', 'Die Auftragung U_S über 1/λ ist voreingestellt.'],
    channels: [{ name: 'Schwellspannung U_S', unit: 'V' }],
    series: { pname: 'Wellenlänge λ', punit: 'nm', vname: 'Schwellspannung U_S', vunit: 'V', tx: 'inverse', ty: 'id', model: 'line' },
    inputs: [],
    results: [{ label: 'Planck-Konstante h = a·e/c', unit: '10⁻³⁴ J·s', expr: `a*${E}*1e-9/299792458/1e-34`, lit: H_LIT }],
  },
  {
    id: 'federpendel', title: 'Federpendel: Federkonstante', topic: 'Mechanische Schwingungen, harmonische Schwingung', mode: 'series',
    summary: 'Periodendauer für verschiedene Massen; T² über m ist eine Gerade, ihre Steigung ist 4π²/D.',
    steps: ['Ein Zeit- oder Zählgerät anlegen (oder die Periodendauer per Fit übernehmen).', 'Pro Masse (in g) die Periodendauer T übernehmen.', 'Die Auftragung T² über m ist voreingestellt.'],
    channels: [{ name: 'Periodendauer T', unit: 's' }],
    series: { pname: 'Masse m', punit: 'g', vname: 'Periodendauer T', vunit: 's', tx: 'id', ty: 'square', model: 'line' },
    inputs: [{ id: 'Dnenn', label: 'Nennwert der Federkonstante', unit: 'N/m', optional: true }],
    results: [{ label: 'Federkonstante D = 4π²/a', unit: 'N/m', expr: '4*pi*pi/(a*1000)', lit: { label: 'Nennwert', expr: 'Dnenn' } }],
  },
  {
    id: 'fadenpendel', title: 'Fadenpendel: Fallbeschleunigung', topic: 'Mechanische Schwingungen, Fadenpendel', mode: 'series',
    summary: 'Periodendauer für verschiedene Fadenlängen; T² über l ist eine Gerade, ihre Steigung ist 4π²/g.',
    steps: ['Ein Zeit- oder Zählgerät anlegen (oder die Periodendauer per Fit übernehmen).', 'Pro Länge (in cm) die Periodendauer T übernehmen, kleine Auslenkung.', 'Die Auftragung T² über l ist voreingestellt.'],
    channels: [{ name: 'Periodendauer T', unit: 's' }],
    series: { pname: 'Länge l', punit: 'cm', vname: 'Periodendauer T', vunit: 's', tx: 'id', ty: 'square', model: 'line' },
    inputs: [],
    results: [{ label: 'Fallbeschleunigung g = 4π²/a', unit: 'm/s²', expr: '4*pi*pi/(a*100)', lit: { label: 'Richtwert', value: 9.81, source: 'ortsabhängig, in Mitteleuropa etwa 9,81 m/s²' } }],
  },
  {
    id: 'resonanzrohr-offen', title: 'Resonanzrohr (beidseitig offen): Schallgeschwindigkeit', topic: 'Mechanische Wellen, Schall, stehende Wellen', mode: 'series', audio: true,
    summary: 'Grundfrequenz einer Luftsäule für verschiedene Rohrlängen. Beidseitig offen gilt f = c/(2L): f über 1/L ist eine Gerade mit der Steigung c/2.',
    steps: ['Als Quelle Mikrofon wählen; Mikrofon an die Rohröffnung halten.', 'Pro Rohrlänge L (in cm, Innenlänge) das Rohr anblasen oder anschlagen und die Frequenz übernehmen.', 'Die Auftragung f über 1/L ist voreingestellt. Die Mündungskorrektur ist nicht berücksichtigt: Der Achsenabschnitt weicht deshalb leicht von 0 ab.', 'Optional die Lufttemperatur für den Vergleich eintragen.'],
    series: { pname: 'Länge L', punit: 'cm', vname: 'Frequenz f', vunit: 'Hz', tx: 'inverse', ty: 'id', model: 'line' },
    inputs: [{ id: 'theta', label: 'Lufttemperatur', unit: '°C', optional: true }],
    results: [{ label: 'Schallgeschwindigkeit c = 2·a', unit: 'm/s', expr: '2*a/100', lit: { label: 'Näherung für trockene Luft', expr: '331.3+0.606*theta', source: 'c ≈ 331,3 + 0,606·ϑ' } }],
  },
  {
    id: 'resonanzrohr-geschlossen', title: 'Resonanzrohr (einseitig geschlossen): Schallgeschwindigkeit', topic: 'Mechanische Wellen, Schall, stehende Wellen', mode: 'series', audio: true,
    summary: 'Einseitig geschlossen gilt f = c/(4L): f über 1/L ist eine Gerade mit der Steigung c/4.',
    steps: ['Als Quelle Mikrofon wählen; Mikrofon an die offene Öffnung halten.', 'Pro Rohrlänge L (in cm) anblasen und die Frequenz übernehmen.', 'Die Auftragung f über 1/L ist voreingestellt.', 'Optional die Lufttemperatur für den Vergleich eintragen.'],
    series: { pname: 'Länge L', punit: 'cm', vname: 'Frequenz f', vunit: 'Hz', tx: 'inverse', ty: 'id', model: 'line' },
    inputs: [{ id: 'theta', label: 'Lufttemperatur', unit: '°C', optional: true }],
    results: [{ label: 'Schallgeschwindigkeit c = 4·a', unit: 'm/s', expr: '4*a/100', lit: { label: 'Näherung für trockene Luft', expr: '331.3+0.606*theta', source: 'c ≈ 331,3 + 0,606·ϑ' } }],
  },
  {
    id: 'saite', title: 'Schwingende Saite: Wellengeschwindigkeit', topic: 'Mechanische Wellen, stehende Wellen auf einer Saite', mode: 'series', audio: true,
    summary: 'Grundfrequenz einer gezupften Saite für verschiedene schwingende Längen: f = c/(2L), die Steigung von f über 1/L ist c/2.',
    steps: ['Als Quelle Mikrofon wählen; Mikrofon nah an die Saite.', 'Pro schwingender Länge L (in cm) zupfen und die Frequenz übernehmen. Gleiche Spannung halten.', 'Die Auftragung f über 1/L ist voreingestellt.'],
    series: { pname: 'Länge L', punit: 'cm', vname: 'Frequenz f', vunit: 'Hz', tx: 'inverse', ty: 'id', model: 'line' },
    inputs: [],
    results: [{ label: 'Wellengeschwindigkeit c = 2·a', unit: 'm/s', expr: '2*a/100' }],
  },
  {
    id: 'stimmgabel', title: 'Stimmgabel: Frequenz', topic: 'Schwingungen, Frequenz, Töne', mode: 'time', audio: true,
    summary: 'Frequenz eines gleichmäßigen Tons über der Zeit; der Mittelwert (Achsenabschnitt der Geraden) ist die Frequenz, die Steigung zeigt eine Drift.',
    steps: ['Als Quelle Mikrofon wählen; Stimmgabel anschlagen und neben das Mikrofon halten.', 'Einige Sekunden aufnehmen.', 'Modell „Gerade“ ist voreingestellt: b ist die Frequenz.', 'Optional den Nennwert (z. B. 440 Hz) eintragen.'],
    fit: 'line',
    inputs: [{ id: 'fnenn', label: 'Nennfrequenz', unit: 'Hz', optional: true }],
    results: [
      { label: 'Frequenz f', unit: 'Hz', expr: 'b', lit: { label: 'Nennwert', expr: 'fnenn' } },
      { label: 'Drift', unit: 'Hz/s', expr: 'a' },
    ],
  },
  {
    id: 'schallpegel-abstand', title: 'Schallpegel und Abstand', topic: 'Schall, Abstandsgesetz, Schallpegel', mode: 'series', audio: true,
    summary: 'Pegel in dB über dem Logarithmus des Abstands: Eine Punktquelle im Freien verliert 20·lg 2 ≈ 6 dB je Abstandsverdopplung, das entspricht I ∝ 1/r². Die Steigung gibt den Exponenten.',
    steps: ['Als Quelle Mikrofon wählen; gleichmäßigen Ton (Lautsprecher mit Sinuston) verwenden.', 'Pro Abstand r (in cm) den Pegel übernehmen. Wähle bei der Messgröße „Pegel (Mikrofon)“.', 'Die Auftragung Pegel über ln(r) ist voreingestellt.'],
    series: { pname: 'Abstand r', punit: 'cm', vname: 'Pegel', vunit: 'dB', tx: 'ln', ty: 'id', model: 'line' },
    inputs: [],
    results: [{ label: 'Exponent n in I ∝ 1/rⁿ', unit: '', expr: '-a/4.3429448', lit: { label: 'Richtwert Punktquelle im Freien', value: 2, source: 'in Räumen durch Reflexionen meist kleiner' } }],
  },
  {
    id: 'ohm', title: 'Ohmsches Gesetz', topic: 'Elektrizitätslehre, Stromstärke, Spannung, Widerstand', mode: 'channels',
    summary: 'Spannung über Stromstärke an einem Widerstand; die Steigung der Ursprungsgeraden ist R.',
    steps: ['Zwei Geräte anlegen und kalibrieren: erst die Stromstärke, dann die Spannung.', 'Spannung langsam am Netzgerät erhöhen und dabei aufnehmen.', 'Die Auftragung U über I mit „Proportional“ ist voreingestellt.'],
    channels: [{ name: 'Stromstärke I', unit: 'A' }, { name: 'Spannung U', unit: 'V' }], fit: 'prop',
    inputs: [{ id: 'Rnenn', label: 'Nennwert des Widerstands', unit: 'Ω', optional: true }],
    results: [{ label: 'Widerstand R = U/I', unit: 'Ω', expr: 'a', lit: { label: 'Nennwert', expr: 'Rnenn' } }],
  },
  {
    id: 'hooke', title: 'Hookesches Gesetz: Federkonstante', topic: 'Mechanik, Kraft, Federkraft, Hookesches Gesetz', mode: 'channels',
    summary: 'Federkraft über der Dehnung; die Steigung der Ursprungsgeraden ist die Federkonstante D.',
    steps: ['Zwei Geräte anlegen: erst die Dehnung s (z. B. Marker oder Skala), dann die Kraft F (Federwaage oder Gewichtskraft als Digitalanzeige).', 'Mehrere Gewichte nacheinander anhängen und je Stufe aufnehmen.', 'Die Auftragung F über s mit „Proportional“ ist voreingestellt. Bei Überdehnung die letzten Punkte weglassen.'],
    channels: [{ name: 'Dehnung s', unit: 'm' }, { name: 'Kraft F', unit: 'N' }], fit: 'prop',
    inputs: [{ id: 'Dnenn', label: 'Nennwert der Federkonstante', unit: 'N/m', optional: true }],
    results: [{ label: 'Federkonstante D = F/s', unit: 'N/m', expr: 'a', lit: { label: 'Nennwert', expr: 'Dnenn' } }],
  },
  {
    id: 'waermekapazitaet', title: 'Spezifische Wärmekapazität (Tauchsieder)', topic: 'Wärmelehre, innere Energie, spezifische Wärmekapazität', mode: 'time',
    summary: 'Temperatur eines erwärmten Wassers über der Zeit; aus der Steigung folgt c = P/(m·Steigung).',
    steps: ['Ein Thermometer (Digitalanzeige) anlegen und kalibrieren.', 'Wasser mit konstanter Heizleistung erwärmen und mit niedriger Rate aufnehmen (z. B. 1 Punkt je 10 s).', 'Heizleistung P und Masse m eintragen. Wärmeverluste machen den Wert zu groß; nur den Bereich nahe der Raumtemperatur fitten.'],
    channels: [{ name: 'Temperatur ϑ', unit: '°C' }], fit: 'line',
    inputs: [{ id: 'P', label: 'Heizleistung P', unit: 'W' }, { id: 'm', label: 'Masse des Wassers m', unit: 'kg' }],
    results: [{ label: 'Spezifische Wärmekapazität c = P/(m·a)', unit: 'J/(kg·K)', expr: 'P/(m*a)', lit: { label: 'Literaturwert Wasser', value: 4182, source: 'bei 20 °C' } }],
  },
  {
    id: 'spulenfeld', title: 'Magnetfeld einer langen Spule (Hall-Sonde): Feldkonstante', topic: 'Magnetisches Feld, Spule, magnetische Flussdichte, Hall-Sonde', mode: 'channels',
    summary: 'Flussdichte im Inneren einer langen Spule über der Stromstärke; die Steigung ist μ₀·N/l, daraus folgt die magnetische Feldkonstante μ₀.',
    steps: ['Zwei Geräte anlegen: erst die Stromstärke I, dann die Flussdichte B (Teslameter mit Hall-Sonde, Anzeige in mT).', 'Sonde ruhig in die Mitte der Spule halten, Strom stufenweise erhöhen und je Stufe aufnehmen. Nullabgleich der Sonde vorher nicht vergessen.', 'Windungszahl N und Länge l der Spule eintragen. Die Auftragung B über I mit „Proportional“ ist voreingestellt; Erdfeld und Streufelder erscheinen als Achsenabschnitt (dann „Gerade“ wählen).'],
    channels: [{ name: 'Stromstärke I', unit: 'A' }, { name: 'Flussdichte B', unit: 'mT' }], fit: 'prop',
    inputs: [{ id: 'N', label: 'Windungszahl N', unit: '' }, { id: 'l', label: 'Länge der Spule l', unit: 'cm' }],
    results: [{ label: 'Magnetische Feldkonstante μ₀ = a·l/N', unit: 'µN/A²', expr: 'a*l/N*10', lit: { label: 'Literaturwert', value: 1.25663706, source: 'µ₀ ≈ 1,2566·10⁻⁶ N/A²' } }],
  },
  {
    id: 'zerfall', title: 'Radioaktiver Zerfall: Halbwertszeit', topic: 'Kernphysik, Zerfallsgesetz, Halbwertszeit', mode: 'time',
    summary: 'Zählrate über der Zeit mit Nulleffekt; aus der Zerfallskonstante folgt die Halbwertszeit.',
    steps: ['Das Zählgerät anlegen (Zählungen je Messintervall) und kalibrieren; die Unsicherheit √N ist voreingestellt.', 'Aufnehmen, bis die Rate deutlich abgenommen hat.', 'Modell „Zerfall mit Offset“: der Offset C ist der Nulleffekt.'],
    channels: [{ name: 'Zählung N', unit: '', poisson: true }], fit: 'decay',
    inputs: [{ id: 'Tnenn', label: 'Literatur-Halbwertszeit', unit: 's', optional: true }],
    results: [
      { label: 'Halbwertszeit T½ = τ·ln 2', unit: 's', expr: 'τ*ln(2)', lit: { label: 'Literaturwert', expr: 'Tnenn' } },
      { label: 'Nulleffekt C', unit: 'je Intervall', expr: 'C' },
    ],
  },
  {
    id: 'abkuehlung', title: 'Abkühlkurve', topic: 'Wärmelehre, Temperatur, Abkühlung', mode: 'time',
    summary: 'Temperatur eines abkühlenden Körpers über der Zeit; der Offset ist die Umgebungstemperatur.',
    steps: ['Ein Thermometer (Digitalanzeige) anlegen und kalibrieren.', 'Langzeitaufnahme mit niedriger Rate (z. B. 1 Punkt je 10 s).', 'Modell „Zerfall mit Offset“ ist voreingestellt.'],
    channels: [{ name: 'Temperatur ϑ', unit: '°C' }], fit: 'decay',
    inputs: [{ id: 'Traum', label: 'gemessene Raumtemperatur', unit: '°C', optional: true }],
    results: [
      { label: 'Abkühlzeitkonstante τ', unit: 's', expr: 'τ' },
      { label: 'Umgebungstemperatur C', unit: '°C', expr: 'C', lit: { label: 'gemessene Raumtemperatur', expr: 'Traum' } },
    ],
  },
];

export const templateById = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);

export interface TplInputValue {
  value: number | null;
  /** Relative Unsicherheit in Prozent; null = als exakt behandeln. */
  relPercent: number | null;
}

export interface TplResultLine {
  label: string;
  unit: string;
  value: number | null;
  sigma: number | null;
  /** Hinweis, warum nichts berechnet wurde. */
  problem?: string;
  lit?: { label: string; value: number; sigma: number | null; source?: string; comparison: Comparison };
  /** Beiträge der Eingangsgrößen zur Unsicherheit, größter zuerst; Namen sind Anzeigenamen. */
  budget?: BudgetItem[];
}

/** Rechnet die Ergebniszeilen einer Vorlage aus Fitparametern und Eingaben (Fehlerfortpflanzung nach Gauß, unkorreliert). */
export function evalTemplateResults(
  t: Template, params: { name: string; value: number; sigma: number }[], inputs: Record<string, TplInputValue>,
): TplResultLine[] {
  const values: Record<string, number> = {};
  const sigmas: Record<string, number | null> = {};
  for (const p of params) { values[p.name] = p.value; sigmas[p.name] = Number.isFinite(p.sigma) ? p.sigma : null; }
  const missing = new Set<string>();
  for (const inp of t.inputs) {
    const v = inputs[inp.id];
    if (!v || v.value === null || !Number.isFinite(v.value)) { missing.add(inp.id); continue; }
    values[inp.id] = v.value;
    sigmas[inp.id] = v.relPercent !== null && v.relPercent > 0 ? Math.abs(v.value) * (v.relPercent / 100) : null;
  }
  const label = (id: string): string => t.inputs.find((i) => i.id === id)?.label ?? id;

  return t.results.map((r) => {
    const base = { label: r.label, unit: r.unit };
    const expr = parseExpression(r.expr);
    const need = expr.vars.filter((v) => missing.has(v));
    if (need.length) return { ...base, value: null, sigma: null, problem: `Bitte eintragen: ${need.map(label).join(', ')}.` };
    const unknown = expr.vars.filter((v) => !(v in values));
    if (unknown.length) return { ...base, value: null, sigma: null, problem: `Der Fit liefert keinen Wert für ${unknown.join(', ')}.` };
    const res = evalWithError(expr, values, sigmas);
    if (!Number.isFinite(res.value)) return { ...base, value: null, sigma: null, problem: 'Nicht berechenbar (Division durch 0 o. Ä.).' };
    const line: TplResultLine = { ...base, value: res.value, sigma: res.sigma };
    const budget = uncertaintyBudget(expr, values, sigmas).map((b) => ({ ...b, name: label(b.name) }));
    if (budget.length > 1) line.budget = budget;
    if (r.lit) {
      let lv: number | null = null, ls: number | null = null;
      if (r.lit.value !== undefined) lv = r.lit.value;
      else if (r.lit.expr) {
        const le = parseExpression(r.lit.expr);
        if (!le.vars.some((v) => missing.has(v))) {
          const lr = evalWithError(le, values, sigmas);
          if (Number.isFinite(lr.value)) { lv = lr.value; ls = lr.sigma; }
        }
      }
      if (lv !== null) line.lit = { label: r.lit.label, value: lv, sigma: ls, source: r.lit.source, comparison: compareToLiterature(res.value, res.sigma, lv, ls) };
    }
    return line;
  });
}
