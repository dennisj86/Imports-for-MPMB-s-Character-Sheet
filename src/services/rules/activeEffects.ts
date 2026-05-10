import type { SpellDefinition } from "../../domain/content";
import type { ActiveEffectDefinition, ActiveEffectState, RuleModifier } from "../../domain/rules";
import type { RollType } from "../../domain/rolls";

function normalizeDice(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, "");
}

function applicableRollTypesFromText(text: string): RollType[] {
  const lower = text.toLowerCase();
  const types = new Set<RollType>();
  if (/\battack roll\b|\battack rolls\b/.test(lower)) types.add("attack-roll");
  if (/\bability check\b|\bability checks\b/.test(lower)) types.add("ability-check");
  if (/\bskill check\b|\bskill checks\b/.test(lower)) types.add("skill-check");
  if (/\bsaving throw\b|\bsaving throws\b/.test(lower)) types.add("saving-throw");
  if (/\bdeath save\b|\bdeath saving throw\b/.test(lower)) types.add("death-save");
  return Array.from(types);
}

function firstBonusDice(text: string): string | undefined {
  const match = text.match(/\b(?:add|adds|bonus|roll)\s+(?:a |an |one )?(\d*d\d+)\b/i) ?? text.match(/\b(\d*d\d+)\s+(?:bonus|to)\b/i);
  return normalizeDice(match?.[1]);
}

export function createActiveEffectFromSpell(spell: SpellDefinition): ActiveEffectDefinition | undefined {
  const text = String(spell.description ?? "");
  const dice = firstBonusDice(text);
  const applicableRollTypes = applicableRollTypesFromText(text);
  if (!dice || applicableRollTypes.length === 0) {
    return undefined;
  }
  const sourceDescriptorId = `rule-source:spell:${spell.id}`;
  const modifier: RuleModifier = {
    id: `rule-modifier:${sourceDescriptorId}:bonus-dice:${dice}`,
    sourceDescriptorId,
    sourceName: spell.name,
    sourceType: "spell",
    target: "other",
    valueType: "dice",
    value: dice,
    condition: "manual",
    diagnostics: ["Temporary roll bonus parsed as an optional active effect."],
  };
  return {
    id: `active-effect:spell:${spell.id}:bonus-dice:${dice}`,
    sourceDescriptorId,
    sourceName: spell.name,
    sourceType: "spell",
    durationType: spell.concentration ? "concentration" : "manual",
    targets: ["selected"],
    applicableRollTypes,
    modifiers: [modifier],
    requiresPrompt: true,
    concentrationLinked: spell.concentration,
    diagnostics: ["Active effect is optional; the user chooses whether to apply it to a roll."],
  };
}

export function instantiateActiveEffect(effect: ActiveEffectDefinition, startedAt = new Date().toISOString()): ActiveEffectState {
  return {
    ...effect,
    startedAt,
    status: "active",
  };
}

export function activeEffectsForRollType(effects: ActiveEffectState[] | undefined, rollType: RollType): ActiveEffectState[] {
  return (effects ?? []).filter((effect) => effect.status === "active" && effect.applicableRollTypes.includes(rollType));
}

export function dismissConcentrationLinkedEffects(effects: ActiveEffectState[]): ActiveEffectState[] {
  return effects.map((effect) =>
    effect.concentrationLinked && effect.status === "active"
      ? { ...effect, status: "dismissed" as const }
      : effect,
  );
}
