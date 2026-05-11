import type { EquipmentDefinition, SpellDefinition } from "../../domain/content";
import type { RuleChoiceOption } from "../../domain/rules";

export type RuleOptionSourceType =
  | "weapon"
  | "weapon-mastery"
  | "fighting-style"
  | "fighting-style-feat"
  | "spell"
  | "cantrip"
  | "skill"
  | "tool"
  | "language"
  | "ability"
  | "feat"
  | "item"
  | "class-feature-option"
  | "other";

export interface RuleOptionSource {
  id: string;
  optionType: RuleOptionSourceType;
  filters: Record<string, unknown>;
  sourceContext?: string;
  diagnostics: string[];
}

export interface RuleOptionSourceResult {
  source: RuleOptionSource;
  options: RuleChoiceOption[];
  diagnostics: string[];
}

export interface RuleOptionSourceContext {
  equipmentCatalog?: EquipmentDefinition[];
  spellCatalog?: SpellDefinition[];
}

export interface SpellOptionSourceFilters {
  spellClassKeys?: string[];
  minLevel?: number;
  maxLevel?: number;
}

const MASTERY_LABELS: Record<string, string> = {
  cleave: "Cleave",
  graze: "Graze",
  nick: "Nick",
  push: "Push",
  sap: "Sap",
  slow: "Slow",
  topple: "Topple",
  vex: "Vex",
};

function normalizeToken(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readableDamage(damage: unknown): string | undefined {
  if (!Array.isArray(damage) || damage.length < 3) {
    return undefined;
  }
  const count = damage[0];
  const die = damage[1];
  const type = damage[2];
  if (typeof count !== "number" && typeof count !== "string") return undefined;
  if (typeof die !== "number" && typeof die !== "string") return undefined;
  if (typeof type !== "string") return undefined;
  return die ? `${count}d${die} ${type}` : `${count} ${type}`;
}

function isSpellLikeWeapon(entry: EquipmentDefinition): boolean {
  const text = `${entry.type ?? ""} ${entry.key} ${entry.name}`.toLowerCase();
  return /\b(cantrip|spell|spell attack|save dc)\b/.test(text);
}

function isNonWeaponCatalogEntry(entry: EquipmentDefinition): boolean {
  const rawRef = String(entry.sourceMeta?.rawSourceRef ?? "").toLowerCase();
  const text = `${entry.category ?? ""} ${entry.type ?? ""} ${entry.key} ${entry.name}`.toLowerCase();
  return /\b(magic item|adventuring gear|gear|wondrous item|armor|shield)\b/.test(rawRef) || /\b(adventuring gear|wondrous item)\b/.test(text);
}

function hasWeaponDefinitionEvidence(entry: EquipmentDefinition): boolean {
  const type = String(entry.type ?? "").toLowerCase();
  return Boolean(entry.weaponList || entry.mastery || readableDamage(entry.damage) || /\b(simple|martial|firearm)\b/.test(type));
}

function isRealWeapon(entry: EquipmentDefinition): boolean {
  if (entry.category !== "weapon") {
    return false;
  }
  if (isSpellLikeWeapon(entry)) {
    return false;
  }
  if (isNonWeaponCatalogEntry(entry)) {
    return false;
  }
  return hasWeaponDefinitionEvidence(entry);
}

function masteryLabel(entry: EquipmentDefinition): string | undefined {
  const token = normalizeToken(entry.mastery);
  return token ? MASTERY_LABELS[token] ?? entry.mastery : undefined;
}

function weaponTags(entry: EquipmentDefinition): string[] {
  const tags = new Set<string>();
  const text = `${entry.type ?? ""} ${entry.weaponList ?? ""} ${entry.description ?? ""}`.toLowerCase();
  if (/\bsimple\b/.test(text)) tags.add("simple");
  if (/\bmartial\b/.test(text)) tags.add("martial");
  if (/\bmelee\b/.test(text)) tags.add("melee");
  if (/\branged\b/.test(text) || /\bammunition\b/.test(text)) tags.add("ranged");
  if (/\bfinesse\b/.test(text)) tags.add("finesse");
  if (/\blight\b/.test(text)) tags.add("light");
  if (/\btwo-handed\b/.test(text)) tags.add("two-handed");
  if (entry.mastery) tags.add(`mastery-${normalizeToken(entry.mastery)}`);
  return Array.from(tags);
}

export function resolveWeaponMasteryOptions(context: RuleOptionSourceContext = {}): RuleOptionSourceResult {
  const candidates = context.equipmentCatalog ?? [];
  const included: RuleChoiceOption[] = [];
  const excluded: string[] = [];

  for (const entry of candidates) {
    if (!isRealWeapon(entry)) {
      if (entry.category === "weapon") {
        excluded.push(`${entry.name} (${entry.type ?? "unknown type"})`);
      }
      continue;
    }
    const mastery = masteryLabel(entry);
    const damage = readableDamage(entry.damage);
    included.push({
      id: entry.id,
      label: entry.name,
      value: entry.key,
      optionType: "weapon-mastery",
      sourceId: entry.id,
      sourceType: "equipment",
      tags: weaponTags(entry),
      metadata: {
        weaponType: entry.type,
        weaponList: entry.weaponList,
        damage,
        range: entry.range,
        mastery: entry.mastery,
        masteryLabel: mastery,
      },
      diagnostics: [
        "Included by Weapon Option Source.",
        `Catalog category: ${entry.category}.`,
        `Weapon type: ${entry.type ?? "unknown"}.`,
        ...(mastery ? [`Mastery: ${mastery}.`] : ["Mastery metadata unavailable."]),
      ],
    });
  }

  included.sort((left, right) => left.label.localeCompare(right.label));
  const diagnostics = [
    `Option Source weapon-mastery used equipment catalog; candidates ${candidates.length}; included ${included.length}; excluded ${Math.max(0, candidates.length - included.length)}.`,
    ...(excluded.length ? [`Excluded spell-like weapon entries: ${excluded.slice(0, 8).join(", ")}${excluded.length > 8 ? ", ..." : ""}.`] : []),
  ];

  return {
    source: {
      id: "option-source:weapon-mastery",
      optionType: "weapon-mastery",
      filters: { category: "weapon", excludeSpellLike: true },
      sourceContext: "equipmentCatalog",
      diagnostics,
    },
    options: included,
    diagnostics,
  };
}

export function resolveSpellCatalogOptions(
  context: RuleOptionSourceContext = {},
  kind: "cantrip" | "spell",
  filters: SpellOptionSourceFilters = {},
): RuleOptionSourceResult {
  const candidates = context.spellCatalog ?? [];
  const classKeys = new Set((filters.spellClassKeys ?? []).map(normalizeToken).filter(Boolean));
  const defaultMinLevel = kind === "cantrip" ? 0 : 1;
  const defaultMaxLevel = kind === "cantrip" ? 0 : 9;
  const minLevel = filters.minLevel ?? defaultMinLevel;
  const maxLevel = filters.maxLevel ?? defaultMaxLevel;
  const options = candidates
    .filter((spell) => spell.level >= minLevel && spell.level <= maxLevel)
    .filter((spell) => {
      if (classKeys.size === 0) return true;
      return spell.classes.some((entry) => classKeys.has(normalizeToken(entry)));
    })
    .map((spell): RuleChoiceOption => ({
      id: spell.id,
      label: spell.name,
      value: spell.key,
      optionType: kind,
      sourceId: spell.id,
      sourceType: "spell",
      tags: [kind, ...spell.classes.map((entry) => `class-${normalizeToken(entry)}`)],
      metadata: {
        level: spell.level,
        classes: spell.classes,
        filterClassKeys: Array.from(classKeys),
      },
      diagnostics: [`${kind === "cantrip" ? "Cantrip" : "Spell"} option generated from spell catalog.`],
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const diagnostics = [
    `Option Source ${kind} used spell catalog; candidates ${candidates.length}; included ${options.length}; level ${minLevel}-${maxLevel}; classes ${classKeys.size ? Array.from(classKeys).join(", ") : "any"}.`,
  ];
  return {
    source: {
      id: `option-source:${kind}`,
      optionType: kind,
      filters: { level: `${minLevel}-${maxLevel}`, spellClassKeys: Array.from(classKeys) },
      sourceContext: "spellCatalog",
      diagnostics,
    },
    options,
    diagnostics,
  };
}
