import type { CharacterPlayEvent } from "../../domain/playState";
import type { RollResult } from "../../domain/rolls";

function isRollResult(value: unknown): value is RollResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RollResult>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.total === "number" &&
    typeof candidate.diceExpression === "string"
  );
}

export function getLatestRollResult(events: CharacterPlayEvent[]): RollResult | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== "roll") {
      continue;
    }
    const result = event.payload.rollResult;
    if (isRollResult(result)) {
      return result;
    }
  }
  return undefined;
}

