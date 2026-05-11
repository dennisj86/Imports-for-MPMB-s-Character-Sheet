import { toSlug } from "../../lib/slug";
import type {
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  FeatureDefinition,
  MpmContentSnapshot,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type {
  ActiveEffectCatalogEntry,
  ActiveEffectDefinition,
  ActiveEffectDurationType,
  ActiveEffectState,
  ActiveEffectTarget,
  ActiveEffectType,
  KnownUnmappedActiveEffectEntry,
  RuleModifier,
  RuleModifierTarget,
  RuleSourceDescriptor,
  RuleSourceType,
} from "../../domain/rules";
import type { RollType } from "../../domain/rolls";
import { resolveRuleMappingContribution } from "./ruleMappingResolver";

export type ActiveEffectCatalogSourceFilter = "spells" | "features" | "items" | "custom";
export type ActiveEffectCatalogEffectFilter = "all" | ActiveEffectType;

export interface ActiveEffectCatalogSearchFilters {
  query?: string;
  sourceFilters?: ActiveEffectCatalogSourceFilter[];
  effectFilter?: ActiveEffectCatalogEffectFilter;
  excludeEffectIds?: string[];
  limit?: number;
}

export interface ActiveEffectCatalogSearchDiagnostics {
  query: string;
  activeSourceFilters: ActiveEffectCatalogSourceFilter[];
  activeEffectFilter: ActiveEffectCatalogEffectFilter;
  searchedSourceTypes: RuleSourceType[];
  mappedOnlyHint: string;
}

export interface ActiveEffectCatalogSearchResult {
  matches: ActiveEffectCatalogEntry[];
  futureMatches: KnownUnmappedActiveEffectEntry[];
  diagnostics: ActiveEffectCatalogSearchDiagnostics;
}

const ACTIVE_EFFECT_SEARCH_ALIASES: Record<string, string[]> = {
  bless: ["blessing"],
  guidance: ["guidance-cantrip"],
  resistance: ["resistance-cantrip"],
  "shield-of-faith": ["sof", "faith-shield"],
  "bardic-inspiration": ["bardic", "inspiration-die", "bardic-die"],
  "war-god-s-blessing": ["war-gods-blessing", "war-god-blessing", "attack-plus-10", "plus-10-attack"],
  "potion-of-heroism": ["heroism-potion"],
};

const KNOWN_UNMAPPED_ACTIVE_EFFECTS: KnownUnmappedActiveEffectEntry[] = [
  {
    id: "future-effect:heroic-inspiration",
    label: "Heroic Inspiration",
    aliases: ["hero", "heroic", "inspiration", "reroll"],
    sourceType: "condition",
    reasonUnsupported: "Heroic Inspiration needs an optional reroll/replace result pipeline, which is not implemented yet.",
    expectedFutureEffectType: "reroll",
  },
  {
    id: "future-effect:enhance-ability",
    label: "Enhance Ability",
    aliases: ["bears-endurance", "bulls-strength", "cats-grace", "eagles-splendor", "foxs-cunning", "owls-wisdom"],
    sourceType: "spell",
    reasonUnsupported: "The current active effect pipeline does not model ability-specific advantage selection for a temporary effect.",
    expectedFutureEffectType: "advantage",
  },
  {
    id: "future-effect:pass-without-trace",
    label: "Pass without Trace",
    aliases: ["pwt", "stealth-aura"],
    sourceType: "spell",
    reasonUnsupported: "The current pipeline does not scope a temporary flat bonus to only Stealth checks.",
    expectedFutureEffectType: "roll-bonus",
  },
  {
    id: "future-effect:warding-bond",
    label: "Warding Bond",
    aliases: ["bond", "warding"],
    sourceType: "spell",
    reasonUnsupported: "Warding Bond combines AC, saving throw, resistance, and damage-link behavior that needs a mixed effect model.",
    expectedFutureEffectType: "mixed",
  },
];

const SEARCH_SCOPE_SOURCE_TYPES: Record<ActiveEffectCatalogSourceFilter, RuleSourceType[]> = {
  spells: ["spell"],
  features: ["class-feature", "subclass-feature", "species-feature", "background-feature", "feat"],
  items: ["item"],
  custom: ["custom"],
};

function normalizeDice(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, "");
}

function normalizeSearchToken(value: string | undefined): string {
  return toSlug(value ?? "").trim();
}

function searchTextIncludes(searchText: string, query: string): boolean {
  const normalizedQuery = normalizeSearchToken(query);
  if (!normalizedQuery) {
    return true;
  }
  if (searchText.includes(normalizedQuery)) {
    return true;
  }
  return normalizedQuery
    .split("-")
    .filter(Boolean)
    .every((token) => searchText.includes(token));
}

function aliasesForCatalogEntry(effect: Pick<ActiveEffectDefinition, "label" | "sourceName">): string[] {
  const keys = [normalizeSearchToken(effect.label), normalizeSearchToken(effect.sourceName)];
  return Array.from(new Set(keys.flatMap((key) => ACTIVE_EFFECT_SEARCH_ALIASES[key] ?? [])));
}

function searchTextForCatalogEntry(entry: Pick<ActiveEffectCatalogEntry, "label" | "sourceName" | "aliases" | "applicableRollTypes" | "effectType">): string {
  return [
    entry.label,
    entry.sourceName,
    ...(entry.aliases ?? []),
    ...entry.applicableRollTypes,
    entry.effectType,
  ]
    .map(normalizeSearchToken)
    .filter(Boolean)
    .join(" ");
}

function searchTextForFutureEntry(entry: KnownUnmappedActiveEffectEntry): string {
  return [
    entry.label,
    ...(entry.aliases ?? []),
    entry.reasonUnsupported,
    entry.expectedFutureEffectType,
  ]
    .map(normalizeSearchToken)
    .filter(Boolean)
    .join(" ");
}

function applicableRollTypesFromText(text: string): RollType[] {
  const lower = text.toLowerCase();
  const types = new Set<RollType>();
  if (/\battack roll\b|\battack rolls\b/.test(lower)) {
    types.add("attack-roll");
    types.add("spell-attack");
  }
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

function modifierSummaryFromModifiers(modifiers: RuleModifier[]): ActiveEffectDefinition["modifierSummary"] {
  const summary: NonNullable<ActiveEffectDefinition["modifierSummary"]> = {};
  for (const modifier of modifiers) {
    if (!summary.dice && modifier.valueType === "dice" && typeof modifier.value === "string") {
      summary.dice = normalizeDice(modifier.value);
    }
    if (summary.flat === undefined && modifier.valueType === "flat" && typeof modifier.value === "number") {
      summary.flat = Number(modifier.value);
    }
  }
  return summary.dice !== undefined || summary.flat !== undefined ? summary : undefined;
}

function effectTypeFromModifiers(
  modifiers: RuleModifier[],
  applicableRollTypes: RollType[],
): ActiveEffectType {
  if (modifiers.some((modifier) => modifier.target === "armor-class" && modifier.valueType === "flat")) {
    return "ac-bonus";
  }
  if (modifiers.some((modifier) => modifier.valueType === "advantage")) {
    return "advantage";
  }
  if (modifiers.some((modifier) => modifier.valueType === "disadvantage")) {
    return "disadvantage";
  }
  if (
    applicableRollTypes.length > 0 &&
    modifiers.some((modifier) => modifier.valueType === "dice" || modifier.valueType === "flat")
  ) {
    return "roll-bonus";
  }
  return "note";
}

function targetScopeForEffect(effect: Pick<ActiveEffectDefinition, "targets">): "self" | "selected" | "global" {
  if (effect.targets.includes("self")) {
    return "self";
  }
  if (effect.targets.includes("global")) {
    return "global";
  }
  return "selected";
}

function catalogConfigurableFields(effect: ActiveEffectDefinition): ActiveEffectCatalogEntry["configurableFields"] {
  return Array.from(new Set(["source-caster-name", "notes", ...(effect.configurableFields ?? [])]));
}

function createCatalogEntry(effect: ActiveEffectDefinition): ActiveEffectCatalogEntry {
  return {
    id: effect.id,
    label: effect.label,
    aliases: aliasesForCatalogEntry(effect),
    sourceType: effect.sourceType,
    sourceName: effect.sourceName,
    effectType: effect.effectType,
    applicableRollTypes: [...effect.applicableRollTypes],
    modifier: effect.modifierSummary ?? {},
    durationType: effect.durationType,
    targetScope: targetScopeForEffect(effect),
    requiresPrompt: effect.requiresPrompt,
    configurableFields: catalogConfigurableFields(effect),
    effect,
  };
}

function dedupeCatalogEntries(entries: ActiveEffectCatalogEntry[]): ActiveEffectCatalogEntry[] {
  const byKey = new Map<string, ActiveEffectCatalogEntry>();
  for (const entry of entries) {
    const key = [
      entry.sourceType,
      entry.sourceName,
      entry.label,
      entry.effectType,
      entry.durationType,
      entry.targetScope,
      entry.modifier.dice ?? "",
      entry.modifier.flat ?? "",
      entry.applicableRollTypes.join(","),
    ].join("|");
    if (!byKey.has(key)) {
      byKey.set(key, entry);
    }
  }
  return Array.from(byKey.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function rulesModeFromSpell(spell: Pick<SpellDefinition, "sourceMeta">): "2014" | "2024" {
  return spell.sourceMeta?.edition === "2014" || spell.sourceMeta?.edition === "2024" ? spell.sourceMeta.edition : "2024";
}

function providerFromSourceMeta(sourceMeta: { sourceSystem?: string } | undefined): "mpmb" | "open5e" {
  return sourceMeta?.sourceSystem === "open5e" ? "open5e" : "mpmb";
}

function createMappedActiveEffectFromSpell(spell: SpellDefinition): ActiveEffectDefinition | undefined {
  const source: RuleSourceDescriptor = {
    id: `rule-source:spell:${spell.id}`,
    sourceType: "spell",
    sourceId: spell.id,
    sourceName: spell.name,
    rulesMode: rulesModeFromSpell(spell),
    provider: providerFromSourceMeta(spell.sourceMeta),
    tags: spell.concentration ? ["concentration"] : [],
    choices: [],
    modifiers: [],
    effects: [],
    diagnostics: [],
    sourceText: [spell.castingTime, spell.duration, spell.description].filter(Boolean).join("\n"),
  };
  return resolveRuleMappingContribution(source).effects[0];
}

export function createActiveEffectFromSpell(spell: SpellDefinition): ActiveEffectDefinition | undefined {
  const mapped = createMappedActiveEffectFromSpell(spell);
  if (mapped) {
    return {
      ...mapped,
      label: mapped.label || spell.name,
      modifierSummary: mapped.modifierSummary ?? modifierSummaryFromModifiers(mapped.modifiers),
    };
  }
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
    label: spell.name,
    sourceName: spell.name,
    sourceType: "spell",
    effectType: "roll-bonus",
    durationType: spell.concentration ? "concentration" : "manual",
    targets: ["selected"],
    applicableRollTypes,
    modifiers: [modifier],
    requiresPrompt: true,
    modifierSummary: { dice },
    concentrationLinked: spell.concentration,
    diagnostics: ["Active effect is optional; the user chooses whether to apply it to a roll."],
  };
}

export interface ActiveEffectSpellCandidate {
  spellId: string;
  spellName: string;
  effect: ActiveEffectDefinition;
}

export function resolveActiveEffectSpellCandidates(
  spells: SpellDefinition[],
): ActiveEffectSpellCandidate[] {
  const bySpellId = new Map<string, ActiveEffectSpellCandidate>();
  for (const spell of spells) {
    const effect = createActiveEffectFromSpell(spell);
    if (!effect || bySpellId.has(spell.id)) {
      continue;
    }
    bySpellId.set(spell.id, {
      spellId: spell.id,
      spellName: spell.name,
      effect,
    });
  }
  return Array.from(bySpellId.values()).sort((left, right) => left.spellName.localeCompare(right.spellName));
}

function createCatalogRuleSourceDescriptor(input: {
  sourceType: RuleSourceType;
  sourceId: string;
  sourceName: string;
  text?: string;
  structuredData?: unknown;
  sourceMeta?: { sourceSystem?: string; edition?: string };
  level?: number;
}): RuleSourceDescriptor {
  return {
    id: `rule-source:catalog:${input.sourceType}:${input.sourceId}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    rulesMode: input.sourceMeta?.edition === "2014" || input.sourceMeta?.edition === "2024" ? input.sourceMeta.edition : "2024",
    provider: providerFromSourceMeta(input.sourceMeta),
    level: input.level,
    tags: [],
    choices: [],
    modifiers: [],
    effects: [],
    diagnostics: [],
    sourceText: input.text,
    structuredData: input.structuredData,
  };
}

function createFeatureCatalogEntries(
  owner: ClassDefinition | SubclassDefinition,
  sourceType: "class-feature" | "subclass-feature",
  features: FeatureDefinition[],
  context: {
    equipmentCatalog: EquipmentDefinition[];
    spellCatalog: SpellDefinition[];
  },
): ActiveEffectCatalogEntry[] {
  return features.flatMap((feature) => {
    const source = createCatalogRuleSourceDescriptor({
      sourceType,
      sourceId: `${owner.id}:${feature.id}`,
      sourceName: feature.name,
      text: feature.description,
      structuredData: feature.structuredData,
      sourceMeta: owner.sourceMeta,
      level: feature.minLevel,
    });
    return resolveRuleMappingContribution(source, context).effects.map(createCatalogEntry);
  });
}

function createFeatCatalogEntries(
  feats: FeatDefinition[],
  context: {
    equipmentCatalog: EquipmentDefinition[];
    spellCatalog: SpellDefinition[];
  },
): ActiveEffectCatalogEntry[] {
  return feats.flatMap((feat) => {
    const source = createCatalogRuleSourceDescriptor({
      sourceType: "feat",
      sourceId: feat.id,
      sourceName: feat.name,
      text: [feat.prerequisite, feat.description].filter(Boolean).join("\n"),
      structuredData: feat.structuredData,
      sourceMeta: feat.sourceMeta,
    });
    return resolveRuleMappingContribution(source, context).effects.map(createCatalogEntry);
  });
}

function createItemCatalogEntries(
  equipment: EquipmentDefinition[],
  context: {
    equipmentCatalog: EquipmentDefinition[];
    spellCatalog: SpellDefinition[];
  },
): ActiveEffectCatalogEntry[] {
  return equipment.flatMap((item) => {
    const source = createCatalogRuleSourceDescriptor({
      sourceType: "item",
      sourceId: item.id,
      sourceName: item.name,
      text: [item.type, item.description].filter(Boolean).join("\n"),
      sourceMeta: item.sourceMeta,
    });
    return resolveRuleMappingContribution(source, context).effects.map(createCatalogEntry);
  });
}

function createSpellCatalogEntries(spells: SpellDefinition[]): ActiveEffectCatalogEntry[] {
  return spells
    .map((spell) => createActiveEffectFromSpell(spell))
    .filter((effect): effect is ActiveEffectDefinition => Boolean(effect))
    .map(createCatalogEntry);
}

export function buildActiveEffectCatalog(
  snapshot: Pick<MpmContentSnapshot, "classes" | "subclasses" | "feats" | "spells" | "equipment">,
): ActiveEffectCatalogEntry[] {
  const context = {
    equipmentCatalog: snapshot.equipment,
    spellCatalog: snapshot.spells,
  };
  return dedupeCatalogEntries([
    ...createSpellCatalogEntries(snapshot.spells),
    ...snapshot.classes.flatMap((classDef) => createFeatureCatalogEntries(classDef, "class-feature", classDef.features, context)),
    ...snapshot.subclasses.flatMap((subclassDef) => createFeatureCatalogEntries(subclassDef, "subclass-feature", subclassDef.features, context)),
    ...createFeatCatalogEntries(snapshot.feats, context),
    ...createItemCatalogEntries(snapshot.equipment, context),
  ]);
}

export function buildKnownUnmappedActiveEffectCatalog(): KnownUnmappedActiveEffectEntry[] {
  return [...KNOWN_UNMAPPED_ACTIVE_EFFECTS].sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeSourceFilters(filters: ActiveEffectCatalogSourceFilter[] | undefined): ActiveEffectCatalogSourceFilter[] {
  const requested: ActiveEffectCatalogSourceFilter[] = filters?.length ? filters : ["spells", "features", "items", "custom"];
  return Array.from(new Set<ActiveEffectCatalogSourceFilter>(requested));
}

function searchedSourceTypesForFilters(filters: ActiveEffectCatalogSourceFilter[]): RuleSourceType[] {
  return Array.from(
    new Set(filters.flatMap((filter) => SEARCH_SCOPE_SOURCE_TYPES[filter] ?? [])),
  );
}

function sourceFilterForRuleSourceType(sourceType: RuleSourceType): ActiveEffectCatalogSourceFilter {
  if (sourceType === "spell") return "spells";
  if (sourceType === "item") return "items";
  if (sourceType === "custom") return "custom";
  return "features";
}

export function searchActiveEffectCatalog(
  catalog: ActiveEffectCatalogEntry[],
  futureCatalog: KnownUnmappedActiveEffectEntry[] = buildKnownUnmappedActiveEffectCatalog(),
  filters: ActiveEffectCatalogSearchFilters = {},
): ActiveEffectCatalogSearchResult {
  const query = filters.query?.trim() ?? "";
  const activeSourceFilters = normalizeSourceFilters(filters.sourceFilters);
  const searchedSourceTypes = searchedSourceTypesForFilters(activeSourceFilters);
  const effectFilter = filters.effectFilter ?? "all";
  const excludedIds = new Set(filters.excludeEffectIds ?? []);
  const limit = filters.limit ?? 25;

  const matches = catalog
    .filter((entry) => activeSourceFilters.includes(sourceFilterForRuleSourceType(entry.sourceType)))
    .filter((entry) => effectFilter === "all" || entry.effectType === effectFilter)
    .filter((entry) => !excludedIds.has(entry.effect.id))
    .filter((entry) => searchTextIncludes(searchTextForCatalogEntry(entry), query))
    .slice(0, limit);

  const futureMatches = query
    ? futureCatalog
        .filter((entry) => searchTextIncludes(searchTextForFutureEntry(entry), query))
        .slice(0, limit)
    : [];

  return {
    matches,
    futureMatches,
    diagnostics: {
      query,
      activeSourceFilters,
      activeEffectFilter: effectFilter,
      searchedSourceTypes,
      mappedOnlyHint: "Only mapped active effects are searchable.",
    },
  };
}

export interface ActiveEffectActivationOptions {
  diceExpression?: string;
  sourceCasterName?: string;
  note?: string;
}

function withActivationOverrides(
  effect: ActiveEffectDefinition,
  options: ActiveEffectActivationOptions = {},
): ActiveEffectDefinition {
  const diceExpression = normalizeDice(options.diceExpression);
  const label = options.sourceCasterName ? `${effect.label} (${options.sourceCasterName})` : effect.label;
  return {
    ...effect,
    label,
    modifierSummary: {
      ...(effect.modifierSummary ?? {}),
      ...(diceExpression ? { dice: diceExpression } : {}),
    },
    modifiers: effect.modifiers.map((modifier) => {
      const nextValue =
        diceExpression && modifier.valueType === "dice" && typeof modifier.value === "string"
          ? diceExpression
          : modifier.value;
      return {
        ...modifier,
        value: nextValue,
        sourceName: label,
      };
    }),
  };
}

export function instantiateActiveEffect(
  effect: ActiveEffectDefinition,
  startedAt = new Date().toISOString(),
  target?: ActiveEffectTarget,
  options: ActiveEffectActivationOptions = {},
): ActiveEffectState {
  const activated = withActivationOverrides(effect, options);
  return {
    ...activated,
    targets: target ? [target] : effect.targets,
    startedAt,
    status: "active",
    sourceCasterName: options.sourceCasterName,
    note: options.note,
  };
}

export interface CreateCustomActiveEffectInput {
  name: string;
  applicableRollTypes: RollType[];
  durationType?: ActiveEffectDurationType;
  dice?: string;
  flat?: number;
  note?: string;
}

export function createCustomActiveEffect(
  input: CreateCustomActiveEffectInput,
): ActiveEffectDefinition | undefined {
  const label = input.name.trim();
  const dice = normalizeDice(input.dice);
  const flat = typeof input.flat === "number" && Number.isFinite(input.flat) ? Math.trunc(input.flat) : undefined;
  if (!label || (!dice && flat === undefined)) {
    return undefined;
  }
  const slug = toSlug(label);
  const sourceDescriptorId = `rule-source:custom:${slug}`;
  const modifiers: RuleModifier[] = [];
  if (dice) {
    modifiers.push({
      id: `rule-modifier:${sourceDescriptorId}:dice`,
      sourceDescriptorId,
      sourceName: label,
      sourceType: "custom",
      target: "other",
      valueType: "dice",
      value: dice,
      condition: "manual",
      diagnostics: ["User-defined custom bonus die."],
    });
  }
  if (flat !== undefined) {
    modifiers.push({
      id: `rule-modifier:${sourceDescriptorId}:flat`,
      sourceDescriptorId,
      sourceName: label,
      sourceType: "custom",
      target: "other",
      valueType: "flat",
      value: flat,
      condition: "manual",
      diagnostics: ["User-defined custom flat bonus."],
    });
  }
  const effectType = effectTypeFromModifiers(modifiers, input.applicableRollTypes);
  return {
    id: `active-effect:custom:${slug}`,
    sourceDescriptorId,
    label,
    sourceName: label,
    sourceType: "custom",
    effectType,
    durationType: input.durationType ?? "manual",
    targets: ["self"],
    applicableRollTypes: [...input.applicableRollTypes],
    modifiers,
    requiresPrompt: input.applicableRollTypes.length > 0,
    modifierSummary: {
      ...(dice ? { dice } : {}),
      ...(flat !== undefined ? { flat } : {}),
    },
    concentrationLinked: false,
    diagnostics: input.note ? [input.note] : ["User-defined custom active effect."],
  };
}

export function activeEffectsForRollType(effects: ActiveEffectState[] | undefined, rollType: RollType): ActiveEffectState[] {
  return (effects ?? []).filter((effect) => effect.status === "active" && effect.applicableRollTypes.includes(rollType));
}

export function activeEffectModifiersForTarget(
  effects: ActiveEffectState[] | undefined,
  target: RuleModifierTarget,
  options: { targetScope?: ActiveEffectTarget } = {},
): RuleModifier[] {
  const targetScope = options.targetScope ?? "self";
  return (effects ?? [])
    .filter((effect) => effect.status === "active")
    .filter((effect) => effect.targets.includes("global") || effect.targets.includes(targetScope))
    .flatMap((effect) => effect.modifiers.filter((modifier) => modifier.target === target));
}

export function dismissConcentrationLinkedEffects(effects: ActiveEffectState[]): ActiveEffectState[] {
  return effects.map((effect) =>
    effect.concentrationLinked && effect.status === "active"
      ? { ...effect, status: "dismissed" as const }
      : effect,
  );
}
