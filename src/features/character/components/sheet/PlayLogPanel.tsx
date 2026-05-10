import type { CharacterPlayEvent } from "../../../../domain/playState";

interface PlayLogPanelProps {
  events: CharacterPlayEvent[];
}

function describeEvent(event: CharacterPlayEvent): string | undefined {
  if (event.type === "spell-cast") {
    const mode = typeof event.payload.castMode === "string" ? event.payload.castMode : undefined;
    const slot = typeof event.payload.slotLevel === "number" ? `Slot L${event.payload.slotLevel}` : undefined;
    const concentration = typeof event.payload.concentrationChange === "string" && event.payload.concentrationChange !== "none"
      ? `Concentration ${event.payload.concentrationChange}`
      : undefined;
    return [mode, slot, concentration].filter(Boolean).join(" · ") || undefined;
  }
  if (event.type === "spell-cast-blocked") {
    return typeof event.payload.reason === "string" ? event.payload.reason : "No usable slot.";
  }
  if (event.type === "roll") {
    const result = event.payload.rollResult;
    if (result && typeof result === "object" && "total" in result && "diceExpression" in result) {
      const rollResult = result as { diceExpression?: string; rollMode?: string; modifier?: number; total?: number; outcomeLabel?: string; bonusDice?: Array<{ expression?: string; total?: number }> };
      const modifier = typeof rollResult.modifier === "number" ? (rollResult.modifier >= 0 ? `+${rollResult.modifier}` : `${rollResult.modifier}`) : "";
      const outcome = rollResult.outcomeLabel && rollResult.outcomeLabel !== "normal" ? ` · ${rollResult.outcomeLabel}` : "";
      const bonus = rollResult.bonusDice?.length
        ? ` · bonus ${rollResult.bonusDice.map((entry) => `${entry.expression ?? "dice"}=${entry.total ?? "?"}`).join(", ")}`
        : "";
      return `${rollResult.rollMode ?? "normal"} · ${rollResult.diceExpression ?? "roll"} ${modifier}${bonus} = ${rollResult.total ?? "?"}${outcome}`;
    }
    return typeof event.payload.summary === "string" ? event.payload.summary : "Roll result.";
  }
  if (event.type === "active-effect-start") {
    return Array.isArray(event.payload.applicableRollTypes)
      ? `Applies to ${event.payload.applicableRollTypes.join(", ")}.`
      : "Active effect started.";
  }
  if (event.type === "active-effect-dismiss") {
    return typeof event.payload.reason === "string" ? event.payload.reason : "Active effect dismissed.";
  }
  if (event.type === "resource-spend-blocked") {
    return typeof event.payload.reason === "string" ? `Resource spend blocked: ${event.payload.reason}` : "Resource spend blocked.";
  }
  if (event.type === "hit-die-spent") {
    const result = event.payload.result;
    if (result && typeof result === "object" && "rawRoll" in result) {
      const hitDie = result as { dieExpression?: string; rawRoll?: number; constitutionModifier?: number; healingTotal?: number; appliedHealing?: number };
      const con = typeof hitDie.constitutionModifier === "number" ? (hitDie.constitutionModifier >= 0 ? `+${hitDie.constitutionModifier}` : `${hitDie.constitutionModifier}`) : "";
      return `${hitDie.dieExpression ?? "hit die"} rolled ${hitDie.rawRoll ?? "?"} ${con} = ${hitDie.healingTotal ?? "?"}; applied ${hitDie.appliedHealing ?? "?"} HP`;
    }
    return "Hit die spent.";
  }
  if (event.type === "hit-die-spend-blocked") {
    return typeof event.payload.reason === "string" ? `Hit die blocked: ${event.payload.reason}` : "Hit die blocked.";
  }
  if (event.type === "hit-dice-recovered") {
    const recovery = event.payload.recovery;
    if (recovery && typeof recovery === "object" && "recoveredTotal" in recovery) {
      const result = recovery as { recoveredTotal?: number; recoveryBudget?: number };
      return `Recovered ${result.recoveredTotal ?? 0} of up to ${result.recoveryBudget ?? 0} hit dice.`;
    }
    return "Hit dice recovered.";
  }
  if (event.type === "rest-short" || event.type === "rest-long") {
    const resources = typeof event.payload.resetResourceCount === "number" ? `${event.payload.resetResourceCount} resources` : undefined;
    const slots = typeof event.payload.resetSpellSlotCount === "number" ? `${event.payload.resetSpellSlotCount} slot pools` : undefined;
    const skipped = Array.isArray(event.payload.skipped) && event.payload.skipped.length ? `${event.payload.skipped.length} manual/special skipped` : undefined;
    const hitDice =
      event.type === "rest-short" && typeof event.payload.hitDiceAvailable === "number" && typeof event.payload.hitDiceMax === "number"
        ? `${event.payload.hitDiceAvailable}/${event.payload.hitDiceMax} hit dice available`
        : event.type === "rest-long" && typeof event.payload.hitDiceRecovered === "number"
          ? `${event.payload.hitDiceRecovered} hit dice recovered`
          : undefined;
    const healing = typeof event.payload.hitDiceAppliedHealing === "number" && event.payload.hitDiceAppliedHealing > 0
      ? `${event.payload.hitDiceAppliedHealing} HP from hit dice`
      : undefined;
    return [resources, slots, hitDice, healing, skipped].filter(Boolean).join(" · ") || undefined;
  }
  return undefined;
}

export function PlayLogPanel({ events }: PlayLogPanelProps) {
  const rows = events.slice(-25).reverse();
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No local play actions yet.</p>;
  }
  return (
    <ul className="max-h-80 space-y-1 overflow-auto text-sm">
      {rows.map((event) => (
        <li key={event.id} className="rounded border border-slate-200 p-2">
          <p className="font-medium">{event.shortLabel}</p>
          {describeEvent(event) ? <p className="text-xs text-slate-700">{describeEvent(event)}</p> : null}
          <p className="text-xs text-slate-600">{new Date(event.timestamp).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}
