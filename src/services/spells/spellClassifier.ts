import type { SpellDefinition } from "../../domain/content";
import type { AbilityKey } from "../../domain/derivedStats";

export type SpellCategory =
  | "attack"
  | "save"
  | "damage"
  | "healing"
  | "buff"
  | "debuff"
  | "utility"
  | "defensive"
  | "summon/create"
  | "reaction"
  | "ritual"
  | "concentration"
  | "cantrip"
  | "unknown";

export interface SpellClassification {
  categories: SpellCategory[];
  hasSpellAttack: boolean;
  saveAbility?: AbilityKey;
  damageFormula?: string;
  healingFormula?: string;
  summary: string;
}

const ABILITY_PATTERNS: Array<[AbilityKey, RegExp]> = [
  ["str", /\b(str|strength)\b[^.]{0,40}\b(saving throw|save)\b|\b(saving throw|save)\b[^.]{0,40}\b(str|strength)\b/i],
  ["dex", /\b(dex|dexterity)\b[^.]{0,40}\b(saving throw|save)\b|\b(saving throw|save)\b[^.]{0,40}\b(dex|dexterity)\b/i],
  ["con", /\b(con|constitution)\b[^.]{0,40}\b(saving throw|save)\b|\b(saving throw|save)\b[^.]{0,40}\b(con|constitution)\b/i],
  ["int", /\b(int|intelligence)\b[^.]{0,40}\b(saving throw|save)\b|\b(saving throw|save)\b[^.]{0,40}\b(int|intelligence)\b/i],
  ["wis", /\b(wis|wisdom)\b[^.]{0,40}\b(saving throw|save)\b|\b(saving throw|save)\b[^.]{0,40}\b(wis|wisdom)\b/i],
  ["cha", /\b(cha|charisma)\b[^.]{0,40}\b(saving throw|save)\b|\b(saving throw|save)\b[^.]{0,40}\b(cha|charisma)\b/i],
];

const DICE_PATTERN = /\b\d*d\d+\s*(?:[+-]\s*\d+)?\b/i;

function normalizeDice(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, "");
}

function compactText(spell: SpellDefinition): string {
  return [
    spell.name,
    spell.school,
    spell.castingTime,
    spell.range,
    spell.duration,
    spell.description,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n");
}

function firstSentence(text: string | undefined): string {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "No structured summary available.";
  }
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return sentence.length > 180 ? `${sentence.slice(0, 177).trim()}...` : sentence;
}

function detectSaveAbility(text: string): AbilityKey | undefined {
  for (const [ability, pattern] of ABILITY_PATTERNS) {
    if (pattern.test(text)) {
      return ability;
    }
  }
  return undefined;
}

function detectContextFormula(text: string, contextPattern: RegExp): string | undefined {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    if (contextPattern.test(sentence)) {
      const match = sentence.match(DICE_PATTERN);
      if (match) {
        return normalizeDice(match[0]);
      }
    }
  }
  return undefined;
}

function add(categories: Set<SpellCategory>, condition: boolean, category: SpellCategory) {
  if (condition) {
    categories.add(category);
  }
}

export function classifySpell(spell: SpellDefinition): SpellClassification {
  const text = compactText(spell);
  const lower = text.toLowerCase();
  const categories = new Set<SpellCategory>();
  const hasSpellAttack = /\bspell attack\b/i.test(text);
  const saveAbility = detectSaveAbility(text);
  const damageFormula = detectContextFormula(text, /\bdamage\b/i);
  const healingFormula = detectContextFormula(text, /\b(heal|healing|regain|restore|hit points?)\b/i);

  add(categories, spell.level === 0, "cantrip");
  add(categories, spell.ritual, "ritual");
  add(categories, spell.concentration || /\bconcentration\b/i.test(text), "concentration");
  add(categories, hasSpellAttack, "attack");
  add(categories, Boolean(saveAbility), "save");
  add(categories, Boolean(damageFormula), "damage");
  add(categories, Boolean(healingFormula), "healing");
  add(categories, /\breaction\b/.test(lower) || /\bcasting time:\s*reaction\b/i.test(text), "reaction");
  add(categories, /\bsummon|conjure|create\b/.test(lower), "summon/create");
  add(categories, /\b(ac|armor class|temporary hit points|resistance to|shield)\b/.test(lower), "defensive");
  add(categories, /\b(disadvantage|frightened|charmed|poisoned|restrained|incapacitated|prone|slow|bane)\b/.test(lower), "debuff");
  add(
    categories,
    /\b(bless|guidance|resistance|advantage|bonus|add (?:a |one )?\dd\d|increase|enhance|protect|aid)\b/.test(lower),
    "buff",
  );
  add(
    categories,
    /\b(detect|identify|locate|comprehend|message|mending|light|minor illusion|prestidigitation|shape|open|close|clean|soil)\b/.test(lower),
    "utility",
  );

  if (categories.size === 0 || Array.from(categories).every((entry) => entry === "concentration" || entry === "ritual" || entry === "cantrip")) {
    categories.add("unknown");
  }

  return {
    categories: Array.from(categories),
    hasSpellAttack,
    saveAbility,
    damageFormula,
    healingFormula,
    summary: firstSentence(spell.description),
  };
}
