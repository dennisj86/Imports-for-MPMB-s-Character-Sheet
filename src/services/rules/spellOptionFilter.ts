import { toSlug } from "../../lib/slug";
import type { SpellDefinition } from "../../domain/content";
import type { RuleChoiceOption } from "../../domain/rules";

export interface SpellOptionFilterInput {
  spellCatalog?: SpellDefinition[];
  classKeys?: string[];
  minLevel?: number;
  maxLevel?: number;
  excludeSpellIds?: string[];
}

export interface SpellOptionFilterResult {
  options: RuleChoiceOption[];
  diagnostics: string[];
}

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-2014-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-2024-/, "")
    .replace(/^open5e-2014-/, "")
    .replace(/^open5e-/, "");
}

export function filterSpellOptions(input: SpellOptionFilterInput): SpellOptionFilterResult {
  const spells = input.spellCatalog ?? [];
  const classKeys = (input.classKeys ?? []).map(normalizeToken).filter(Boolean);
  const excluded = new Set(input.excludeSpellIds ?? []);
  const minLevel = input.minLevel ?? 0;
  const maxLevel = input.maxLevel ?? 9;
  const diagnostics: string[] = [];
  if (spells.length === 0) {
    diagnostics.push("Spell catalog is unavailable; spell options cannot be resolved.");
    return { options: [], diagnostics };
  }
  if (classKeys.length === 0) {
    diagnostics.push("Spell list filter is missing; global spell options are intentionally not exposed.");
    return { options: [], diagnostics };
  }
  const options = spells
    .filter((spell) => spell.level >= minLevel && spell.level <= maxLevel)
    .filter((spell) => !excluded.has(spell.id))
    .filter((spell) => classKeys.some((classKey) => spell.classes.map(normalizeToken).includes(classKey)))
    .map((spell) => ({
      id: spell.id,
      label: spell.name,
      value: spell.key,
      optionType: minLevel === 0 && maxLevel === 0 ? "cantrip" as const : "spell" as const,
      sourceId: spell.id,
      sourceType: "spell",
      tags: [minLevel === 0 && maxLevel === 0 ? "cantrip" : "spell", ...spell.classes.map((entry) => `class-${normalizeToken(entry)}`)],
      metadata: {
        level: spell.level,
        classes: spell.classes,
        filterClassKeys: classKeys,
      },
      diagnostics: [`Filtered by spell list ${classKeys.join(", ")} and level ${minLevel}-${maxLevel}.`],
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  diagnostics.push(`${options.length} spell option(s) matched ${classKeys.join(", ")} level ${minLevel}-${maxLevel}.`);
  return { options, diagnostics };
}
