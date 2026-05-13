import type { RollResult } from "../../../domain/rolls";

export type DeathSaveRollResolution = "success" | "failure" | "critical-success" | "critical-failure";

function readNaturalRoll(result: RollResult): number | undefined {
  if (typeof result.naturalRoll === "number") {
    return result.naturalRoll;
  }
  if (typeof result.dice.keptRoll === "number") {
    return result.dice.keptRoll;
  }
  const first = result.dice.rawRolls[0];
  return typeof first === "number" ? first : undefined;
}

export function resolveDeathSaveRollResolution(result: RollResult): DeathSaveRollResolution {
  const natural = readNaturalRoll(result);
  if (natural === 20) {
    return "critical-success";
  }
  if (natural === 1) {
    return "critical-failure";
  }
  return result.total >= 10 ? "success" : "failure";
}
