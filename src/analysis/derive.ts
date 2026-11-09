/**
 * Abgeleitete Größen: Ableitung, Integral und Formelkanal mit Fehlerfortpflanzung.
 * Eigener Parser, kein eval: Zahlen, Namen, die Konstante pi, + - * / ^, Klammern, sqrt ln exp sin cos abs.
 */

export interface XY {
  x: number;
  y: number;
}

/** Ableitung dy/dx: zentrale Differenzen, an den Rändern einseitig. Punkte ohne x-Fortschritt ergeben NaN. */
export function derivative(pts: XY[]): number[] {
  const n = pts.length;
  return pts.map((_, i) => {
    if (n < 2) return NaN;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    return b.x === a.x ? NaN : (b.y - a.y) / (b.x - a.x);
  });
}

/** Kumuliertes Integral nach der Trapezregel, Start bei 0. */
export function integral(pts: XY[]): number[] {
  const out: number[] = [];
  let acc = 0;
  pts.forEach((p, i) => {
    if (i > 0) acc += ((p.y + pts[i - 1].y) / 2) * (p.x - pts[i - 1].x);
    out.push(acc);
  });
  return out;
}

/* ----------------------------- Formelparser ----------------------------- */

export class ParseError extends Error {
  constructor(message: string, public pos: number) {
    super(message);
  }
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string; pos: number }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'fn'; name: string; a: Node };

/** Ohne Prototyp: Namen wie `constructor` oder `__proto__` sind weder Funktion noch Größe. */
const FUNCTIONS: Record<string, (x: number) => number> = Object.assign(Object.create(null), {
  sqrt: Math.sqrt, ln: Math.log, exp: Math.exp, sin: Math.sin, cos: Math.cos, abs: Math.abs,
});
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

interface Token {
  t: 'num' | 'id' | 'op' | 'end';
  s: string;
  pos: number;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === ',' || c === '.') && /[0-9]/.test(src[i + 1] ?? '')) {
      const m = /^(\d+([.,]\d+)?|[.,]\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', s: m[0].replace(',', '.'), pos: i });
      i += m[0].length;
    } else if (/[A-Za-zÄÖÜäöüß_τωφδπ]/.test(c)) {
      const m = /^[A-Za-zÄÖÜäöüß_τωφδπ][A-Za-zÄÖÜäöüß_τωφδπ0-9]*/.exec(src.slice(i))!;
      out.push({ t: 'id', s: m[0], pos: i });
      i += m[0].length;
    } else if ('+-*/^()'.includes(c)) {
      out.push({ t: 'op', s: c, pos: i });
      i++;
    } else {
      throw new ParseError(`Unerwartetes Zeichen „${c}“ an Stelle ${i + 1}.`, i);
    }
  }
  out.push({ t: 'end', s: '', pos: src.length });
  return out;
}

export interface Expression {
  /** Namen der verwendeten Größen. */
  vars: string[];
  /** Wert für eine Belegung der Größen; NaN bei Division durch 0 u. Ä. */
  eval: (values: Record<string, number>) => number;
}

/** Übersetzt eine Formel; wirft ParseError mit Stelle und deutscher Meldung. */
export function parseExpression(src: string): Expression {
  if (src.trim() === '') throw new ParseError('Bitte eine Formel eingeben, z. B. U*I.', 0);
  const toks = tokenize(src);
  let i = 0;
  const peek = (): Token => toks[i];
  const take = (): Token => toks[i++];
  const expectOp = (s: string): void => {
    const t = take();
    if (t.t !== 'op' || t.s !== s) throw new ParseError(`„${s}“ erwartet an Stelle ${t.pos + 1}.`, t.pos);
  };
  const vars = new Set<string>();

  // Rangfolge: + − < * / < Minus-Vorzeichen < ^ (rechtsassoziativ)
  const parseSum = (): Node => {
    let a = parseProduct();
    while (peek().t === 'op' && (peek().s === '+' || peek().s === '-')) a = { k: 'bin', op: take().s as '+' | '-', a, b: parseProduct() };
    return a;
  };
  const parseProduct = (): Node => {
    let a = parseUnary();
    while (peek().t === 'op' && (peek().s === '*' || peek().s === '/')) a = { k: 'bin', op: take().s as '*' | '/', a, b: parseUnary() };
    return a;
  };
  const parseUnary = (): Node => {
    if (peek().t === 'op' && peek().s === '-') { take(); return { k: 'neg', a: parseUnary() }; }
    if (peek().t === 'op' && peek().s === '+') { take(); return parseUnary(); }
    return parsePower();
  };
  const parsePower = (): Node => {
    const a = parseAtom();
    if (peek().t === 'op' && peek().s === '^') { take(); return { k: 'bin', op: '^', a, b: parseUnary() }; }
    return a;
  };
  const parseAtom = (): Node => {
    const t = take();
    if (t.t === 'num') return { k: 'num', v: Number(t.s) };
    if (t.t === 'id') {
      if (peek().t === 'op' && peek().s === '(') {
        const fn = FUNCTIONS[t.s.toLowerCase()];
        if (!fn) throw new ParseError(`Unbekannte Funktion „${t.s}“. Erlaubt: sqrt, ln, exp, sin, cos, abs.`, t.pos);
        take();
        const a = parseSum();
        expectOp(')');
        return { k: 'fn', name: t.s.toLowerCase(), a };
      }
      if (t.s === 'pi' || t.s === 'π') return { k: 'num', v: Math.PI };
      vars.add(t.s);
      return { k: 'var', name: t.s, pos: t.pos };
    }
    if (t.t === 'op' && t.s === '(') { const a = parseSum(); expectOp(')'); return a; }
    throw new ParseError(t.t === 'end' ? 'Die Formel endet zu früh.' : `Unerwartet „${t.s}“ an Stelle ${t.pos + 1}.`, t.pos);
  };

  const root = parseSum();
  if (peek().t !== 'end') throw new ParseError(`Unerwartet „${peek().s}“ an Stelle ${peek().pos + 1}.`, peek().pos);

  const ev = (n: Node, v: Record<string, number>): number => {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': return has(v, n.name) && typeof v[n.name] === 'number' ? v[n.name] : NaN;
      case 'neg': return -ev(n.a, v);
      case 'fn': return FUNCTIONS[n.name](ev(n.a, v));
      case 'bin': {
        const a = ev(n.a, v), b = ev(n.b, v);
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? NaN : a / b;
          case '^': return Math.pow(a, b);
        }
      }
    }
  };
  return { vars: [...vars], eval: (values) => ev(root, values) };
}

export interface BudgetItem {
  /** Name der Größe im Ausdruck. */
  name: string;
  /** Beitrag |∂f/∂x · σ| zur Unsicherheit des Ergebnisses (in Einheiten des Ergebnisses). */
  contribution: number;
  /** Anteil an der Varianz (σ²) des Ergebnisses in Prozent; die Anteile ergeben zusammen 100. */
  share: number;
}

/**
 * Unsicherheitsbudget: Beitrag jeder Eingangsgröße zur Unsicherheit des Ergebnisses (Gauß, unkorreliert),
 * Ableitungen numerisch. Größen ohne bekannte Unsicherheit tauchen nicht auf; ohne eine einzige: leere Liste.
 */
export function uncertaintyBudget(
  expr: Expression, values: Record<string, number>, sigmas: Record<string, number | null>,
): BudgetItem[] {
  const items: { name: string; c: number }[] = [];
  for (const name of expr.vars) {
    const s = has(sigmas, name) ? sigmas[name] : null;
    if (s === null || s === undefined || !Number.isFinite(s)) continue;
    const x = values[name];
    const h = 1e-6 * Math.max(Math.abs(x), 1e-3);
    const d = (expr.eval({ ...values, [name]: x + h }) - expr.eval({ ...values, [name]: x - h })) / (2 * h);
    const c = Math.abs(d * s);
    if (Number.isFinite(c)) items.push({ name, c });
  }
  const total = items.reduce((acc, i) => acc + i.c * i.c, 0);
  return items
    .map((i) => ({ name: i.name, contribution: i.c, share: total > 0 ? (100 * i.c * i.c) / total : 0 }))
    .sort((a, b) => b.share - a.share);
}

/**
 * Wert und Unsicherheit eines Ausdrucks (Gauß, unkorreliert): σ² = Σ (∂f/∂xᵢ · σᵢ)², Ableitungen numerisch.
 * Fehlt zu einer Größe die Unsicherheit, zählt sie als exakt; `sigma` ist null, wenn gar keine bekannt ist.
 */
export function evalWithError(
  expr: Expression, values: Record<string, number>, sigmas: Record<string, number | null>,
): { value: number; sigma: number | null } {
  const value = expr.eval(values);
  const items = uncertaintyBudget(expr, values, sigmas);
  if (!items.length) return { value, sigma: null };
  const sum = items.reduce((acc, i) => acc + i.contribution ** 2, 0);
  return { value, sigma: Number.isFinite(sum) ? Math.sqrt(sum) : null };
}
