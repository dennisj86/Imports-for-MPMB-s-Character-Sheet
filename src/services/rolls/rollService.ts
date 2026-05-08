import type { CharacterPlayEvent } from "../../domain/playState";
import type { RollOutcomeLabel, RollRequest, RollResult } from "../../domain/rolls";
import { rollDiceExpression } from "../../features/dice";
import { createPlayEvent } from "../playState/playEventLog";

function generateRollId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `roll-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clampInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value);
}

function rollD20(mode: RollRequest["rollMode"], rng: () => number): { rawRolls: number[]; keptRoll: number; droppedRolls: number[] } {
  const first = rollDiceExpression("1d20", rng).total;
  if (mode === "normal") {
    return {
      rawRolls: [first],
      keptRoll: first,
      droppedRolls: [],
    };
  }
  const second = rollDiceExpression("1d20", rng).total;
  const keptRoll = mode === "advantage" ? Math.max(first, second) : Math.min(first, second);
  return {
    rawRolls: [first, second],
    keptRoll,
    droppedRolls: [first, second].filter((entry, index) => entry !== keptRoll || index !== [first, second].indexOf(keptRoll)),
  };
}

function outcomeForRoll(
  request: RollRequest,
  naturalRoll: number | undefined,
): RollOutcomeLabel {
  if ((request.type === "attack-roll" || request.type === "spell-attack") && naturalRoll === 20) {
    return "natural-20";
  }
  if ((request.type === "attack-roll" || request.type === "spell-attack") && naturalRoll === 1) {
    return "natural-1";
  }
  return "normal";
}

function isD20Request(request: RollRequest): boolean {
  return request.diceExpression.replace(/\s+/g, "").toLowerCase() === "1d20";
}

export function executeRollRequest(
  request: RollRequest,
  options: {
    rng?: () => number;
    now?: string;
  } = {},
): RollResult {
  const rng = options.rng ?? Math.random;
  const timestamp = options.now ?? new Date().toISOString();
  const modifier = clampInteger(request.modifier);

  if (isD20Request(request)) {
    const d20 = rollD20(request.rollMode, rng);
    const total = d20.keptRoll + modifier;
    return {
      id: generateRollId(),
      requestId: request.id,
      timestamp,
      type: request.type,
      label: request.label,
      diceExpression: request.diceExpression,
      rollMode: request.rollMode,
      dice: d20,
      modifier,
      total,
      naturalRoll: d20.keptRoll,
      outcomeLabel: outcomeForRoll(request, d20.keptRoll),
      sourceSummary: request.metadata?.sourceSummary as string | undefined,
      metadata: request.metadata,
    };
  }

  const dice = rollDiceExpression(request.diceExpression, rng);
  const rawRolls = dice.terms.flatMap((term) => (term.kind === "dice" ? term.rolls : []));
  return {
    id: generateRollId(),
    requestId: request.id,
    timestamp,
    type: request.type,
    label: request.label,
    diceExpression: request.diceExpression,
    rollMode: request.rollMode,
    dice: {
      rawRolls,
      terms: dice.terms,
    },
    modifier,
    total: dice.total + modifier,
    outcomeLabel: "normal",
    sourceSummary: request.metadata?.sourceSummary as string | undefined,
    metadata: request.metadata,
  };
}

function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function createRollPlayEvent(result: RollResult): CharacterPlayEvent {
  return createPlayEvent({
    timestamp: result.timestamp,
    type: "roll",
    shortLabel: `${result.label}: ${result.total}`,
    payload: {
      rollResult: result,
      summary: `${result.diceExpression} ${formatModifier(result.modifier)} = ${result.total}`,
    },
  });
}

