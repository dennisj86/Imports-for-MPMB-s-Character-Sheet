import type { PlayResourceCounter, PlaySpellSlotCounter } from "../../../services/playState";

export interface OverviewResourceHighlight {
  id: string;
  label: string;
  remaining: number;
  max: number;
  rechargeLabel?: string;
  source?: string;
  priority: number;
}

function normalizeResourceToken(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isSpellSlotResource(resource: PlayResourceCounter): boolean {
  return normalizeResourceToken(resource.name).includes("spell-slot");
}

function priorityForResource(resource: PlayResourceCounter): number {
  const normalized = normalizeResourceToken(resource.name);
  if (normalized.includes("lay-on-hands")) return 1200;
  if (normalized.includes("channel-divinity")) return 1150;
  if (isSpellSlotResource(resource)) return 1100;
  if (resource.sourceType === "class" || resource.sourceType === "subclass") return 980;
  if (resource.rechargeType === "short-rest") return 860;
  if (resource.rechargeType === "long-rest") return 820;
  if (resource.rechargeType === "at-will") return 640;
  return 500;
}

function dedupeKeyForResource(resource: PlayResourceCounter): string {
  const normalized = normalizeResourceToken(resource.name);
  if (normalized.includes("channel-divinity")) {
    return "channel-divinity";
  }
  if (normalized.includes("lay-on-hands")) {
    return "lay-on-hands";
  }
  return normalized;
}

function shouldReplaceResourceChoice(current: PlayResourceCounter, next: PlayResourceCounter): boolean {
  const currentPriority = priorityForResource(current);
  const nextPriority = priorityForResource(next);
  if (nextPriority !== currentPriority) {
    return nextPriority > currentPriority;
  }
  if (next.max !== current.max) {
    return next.max > current.max;
  }
  if (next.remaining !== current.remaining) {
    return next.remaining > current.remaining;
  }
  return next.name.localeCompare(current.name) < 0;
}

function spellSlotHighlight(spellSlots: PlaySpellSlotCounter[]): OverviewResourceHighlight | undefined {
  if (spellSlots.length === 0) {
    return undefined;
  }
  const max = spellSlots.reduce((sum, slot) => sum + slot.max, 0);
  if (max <= 0) {
    return undefined;
  }
  const remaining = spellSlots.reduce((sum, slot) => sum + slot.remaining, 0);
  const rechargeLabel = spellSlots.every((slot) => slot.rechargeLabel === spellSlots[0]?.rechargeLabel)
    ? spellSlots[0]?.rechargeLabel
    : "Mixed recharge";
  return {
    id: "overview:resource:spell-slots",
    label: "Spell Slots",
    remaining,
    max,
    rechargeLabel,
    source: "Spellcasting",
    priority: 1100,
  };
}

export function buildOverviewResourceHighlights(
  resources: PlayResourceCounter[],
  spellSlots: PlaySpellSlotCounter[],
  limit = 6,
): OverviewResourceHighlight[] {
  const deduped = new Map<string, PlayResourceCounter>();
  for (const resource of resources) {
    if (resource.max <= 0 || isSpellSlotResource(resource)) {
      continue;
    }
    const key = dedupeKeyForResource(resource);
    const current = deduped.get(key);
    if (!current || shouldReplaceResourceChoice(current, resource)) {
      deduped.set(key, resource);
    }
  }

  const highlights: OverviewResourceHighlight[] = Array.from(deduped.values()).map((resource) => ({
    id: `overview:resource:${resource.id}`,
    label: resource.name,
    remaining: resource.remaining,
    max: resource.max,
    rechargeLabel: resource.rechargeLabel,
    source: resource.sourceName,
    priority: priorityForResource(resource),
  }));

  const slots = spellSlotHighlight(spellSlots);
  if (slots) {
    highlights.push(slots);
  }

  return highlights
    .sort((left, right) => right.priority - left.priority || right.max - left.max || right.remaining - left.remaining || left.label.localeCompare(right.label))
    .slice(0, limit);
}
