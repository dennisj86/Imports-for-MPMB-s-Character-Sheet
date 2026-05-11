export interface DiceTerm {
  kind: "dice" | "constant";
  sign: 1 | -1;
  count?: number;
  sides?: number;
  value?: number;
}

export interface DiceTermResult extends DiceTerm {
  rolls: number[];
  subtotal: number;
}

export interface DiceRollResult {
  expression: string;
  terms: DiceTermResult[];
  total: number;
}

function normalizeExpression(value: string): string {
  return value.replace(/\s+/g, "");
}

function parseToken(token: string): DiceTerm {
  const normalized = token.replace(/\s+/g, "");
  const sign: 1 | -1 = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const diceMatch = unsigned.match(/^(\d*)d(\d+)$/i);
  if (diceMatch) {
    const count = diceMatch[1] ? Number(diceMatch[1]) : 1;
    const sides = Number(diceMatch[2]);
    if (!Number.isFinite(count) || !Number.isFinite(sides) || count <= 0 || sides <= 0) {
      throw new Error(`Invalid dice term '${token}'.`);
    }
    return {
      kind: "dice",
      sign,
      count,
      sides,
    };
  }
  if (!/^\d+$/.test(unsigned)) {
    throw new Error(`Invalid token '${token}' in dice expression.`);
  }
  return {
    kind: "constant",
    sign,
    value: Number(unsigned),
  };
}

export function parseDiceExpression(expression: string): DiceTerm[] {
  const normalized = normalizeExpression(expression);
  if (!normalized) {
    throw new Error("Dice expression cannot be empty.");
  }
  const tokens = normalized.match(/[+-]?[^+-]+/g);
  if (!tokens || tokens.length === 0) {
    throw new Error(`Failed to parse dice expression '${expression}'.`);
  }
  return tokens.map((token) => parseToken(token));
}

function rollDie(sides: number, rng: () => number): number {
  const random = rng();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new Error("RNG returned value outside [0, 1).");
  }
  return Math.floor(random * sides) + 1;
}

export function rollDiceExpression(expression: string, rng: () => number = Math.random): DiceRollResult {
  const parsed = parseDiceExpression(expression);
  const terms: DiceTermResult[] = parsed.map((term) => {
    if (term.kind === "constant") {
      const value = term.value ?? 0;
      return {
        ...term,
        rolls: [value],
        subtotal: term.sign * value,
      };
    }
    const count = term.count ?? 1;
    const sides = term.sides ?? 1;
    const rolls = Array.from({ length: count }, () => rollDie(sides, rng));
    const rawTotal = rolls.reduce((sum, value) => sum + value, 0);
    return {
      ...term,
      rolls,
      subtotal: term.sign * rawTotal,
    };
  });
  return {
    expression,
    terms,
    total: terms.reduce((sum, term) => sum + term.subtotal, 0),
  };
}
