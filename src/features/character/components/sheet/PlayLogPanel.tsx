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
      const rollResult = result as { diceExpression?: string; rollMode?: string; modifier?: number; total?: number; outcomeLabel?: string };
      const modifier = typeof rollResult.modifier === "number" ? (rollResult.modifier >= 0 ? `+${rollResult.modifier}` : `${rollResult.modifier}`) : "";
      const outcome = rollResult.outcomeLabel && rollResult.outcomeLabel !== "normal" ? ` · ${rollResult.outcomeLabel}` : "";
      return `${rollResult.rollMode ?? "normal"} · ${rollResult.diceExpression ?? "roll"} ${modifier} = ${rollResult.total ?? "?"}${outcome}`;
    }
    return typeof event.payload.summary === "string" ? event.payload.summary : "Roll result.";
  }
  if (event.type === "resource-spend-blocked") {
    return typeof event.payload.reason === "string" ? `Resource spend blocked: ${event.payload.reason}` : "Resource spend blocked.";
  }
  if (event.type === "rest-short" || event.type === "rest-long") {
    const resources = typeof event.payload.resetResourceCount === "number" ? `${event.payload.resetResourceCount} resources` : undefined;
    const slots = typeof event.payload.resetSpellSlotCount === "number" ? `${event.payload.resetSpellSlotCount} slot pools` : undefined;
    const skipped = Array.isArray(event.payload.skipped) && event.payload.skipped.length ? `${event.payload.skipped.length} manual/special skipped` : undefined;
    return [resources, slots, skipped].filter(Boolean).join(" · ") || undefined;
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
