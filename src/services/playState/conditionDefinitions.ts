import type { ActiveConditionState } from "../../domain/playState";
import { toSlug } from "../../lib/slug";

export interface ConditionDefinition {
  id: string;
  label: string;
  category?: "standard" | "level-based" | "custom";
  source?: string;
  shortRulesHint?: string;
  clearableOnRest?: "short-rest" | "long-rest";
}

export const STANDARD_CONDITION_DEFINITIONS: ConditionDefinition[] = [
  { id: "condition:blinded", label: "Blinded", category: "standard", source: "basic-rules", shortRulesHint: "Cannot see." },
  { id: "condition:charmed", label: "Charmed", category: "standard", source: "basic-rules", shortRulesHint: "Charm limits hostile targeting." },
  { id: "condition:deafened", label: "Deafened", category: "standard", source: "basic-rules", shortRulesHint: "Cannot hear." },
  { id: "condition:frightened", label: "Frightened", category: "standard", source: "basic-rules", shortRulesHint: "Fear affects approach and attacks." },
  { id: "condition:grappled", label: "Grappled", category: "standard", source: "basic-rules", shortRulesHint: "Speed is held at 0." },
  { id: "condition:incapacitated", label: "Incapacitated", category: "standard", source: "basic-rules", shortRulesHint: "No actions or reactions." },
  { id: "condition:invisible", label: "Invisible", category: "standard", source: "basic-rules", shortRulesHint: "Unseen without special senses." },
  { id: "condition:paralyzed", label: "Paralyzed", category: "standard", source: "basic-rules", shortRulesHint: "Incapacitated and cannot move." },
  { id: "condition:petrified", label: "Petrified", category: "standard", source: "basic-rules", shortRulesHint: "Transformed and incapacitated." },
  { id: "condition:poisoned", label: "Poisoned", category: "standard", source: "basic-rules", shortRulesHint: "Impaired checks and attacks." },
  { id: "condition:prone", label: "Prone", category: "standard", source: "basic-rules", shortRulesHint: "On the ground." },
  { id: "condition:restrained", label: "Restrained", category: "standard", source: "basic-rules", shortRulesHint: "Speed is 0 and movement is limited." },
  { id: "condition:stunned", label: "Stunned", category: "standard", source: "basic-rules", shortRulesHint: "Incapacitated and barely responsive." },
  { id: "condition:unconscious", label: "Unconscious", category: "standard", source: "basic-rules", shortRulesHint: "Incapacitated, prone, unaware." },
  { id: "condition:exhaustion", label: "Exhaustion", category: "level-based", source: "basic-rules", shortRulesHint: "Track exhaustion level manually." },
];

const CONDITION_BY_ID = new Map(STANDARD_CONDITION_DEFINITIONS.map((entry) => [entry.id, entry]));
const CONDITION_BY_LABEL = new Map(STANDARD_CONDITION_DEFINITIONS.map((entry) => [entry.label.toLowerCase(), entry]));
const CONDITION_BY_LEGACY_ID = new Map(STANDARD_CONDITION_DEFINITIONS.map((entry) => [`condition:${toSlug(entry.label)}`, entry]));

export function findConditionDefinition(input: string | undefined): ConditionDefinition | undefined {
  const normalized = input?.trim();
  if (!normalized) {
    return undefined;
  }
  const normalizedLower = normalized.toLowerCase();
  return CONDITION_BY_ID.get(normalizedLower) ?? CONDITION_BY_LEGACY_ID.get(normalizedLower) ?? CONDITION_BY_LABEL.get(normalizedLower);
}

function customConditionId(nameOrId: string): string {
  const withoutPrefix = nameOrId.replace(/^condition:(custom:)?/i, "");
  return `condition:custom:${toSlug(withoutPrefix) || "condition"}`;
}

export function normalizeActiveConditionState(
  condition: Partial<ActiveConditionState> & { label?: string },
  now?: string,
): ActiveConditionState | undefined {
  const rawId = condition.id?.trim();
  const rawName = condition.name?.trim() ?? condition.label?.trim();
  const definition = findConditionDefinition(rawId) ?? findConditionDefinition(rawName);
  const addedAt = condition.addedAt ?? now ?? new Date().toISOString();

  if (definition) {
    return {
      id: definition.id,
      name: definition.label,
      source: condition.source ?? definition.source,
      category: condition.category ?? definition.category,
      clearableOnRest: condition.clearableOnRest ?? definition.clearableOnRest,
      notes: condition.notes,
      addedAt,
    };
  }

  const label = rawName || rawId?.replace(/^condition:custom:/i, "").replace(/^condition:/i, "") || "";
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return undefined;
  }
  return {
    id: rawId?.startsWith("condition:custom:") ? customConditionId(rawId) : customConditionId(normalizedLabel),
    name: normalizedLabel,
    source: condition.source ?? "manual",
    category: condition.category ?? "custom",
    clearableOnRest: condition.clearableOnRest,
    notes: condition.notes,
    addedAt,
  };
}
