import { toSlug } from "../../lib/slug";
import type {
  BackgroundDefinition,
  ClassDefinition,
  CompatibilityMeta,
  ContentVersion,
  ConversionMode,
  EquipmentDefinition,
  FeatDefinition,
  RulesMode,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type { SourceProvider } from "./sourceProvider";
import { getClassProgressionRule, getDefaultSubclassUnlockLevel } from "./mappings/classProgressionRules";

export type RulesQueryContext = {
  provider?: SourceProvider | "all";
  rulesMode?: RulesMode;
  selectedClassId?: string;
  classLevel?: number;
};

export type ConvertedSpeciesTraits = {
  rulesMode: RulesMode;
  conversionMode: ConversionMode;
  ignoresLegacyAbilityScoreIncrease: boolean;
  traits?: string;
  notes: string[];
};

export type ConvertedBackgroundBenefits = {
  rulesMode: RulesMode;
  conversionMode: ConversionMode;
  abilityScoreRule: "native" | "background-2024";
  abilityScoreMode: "native" | "background-2024";
  skillText?: string;
  toolText?: string;
  equipmentText?: string;
  bonusFeat?: string;
  grantedFeatIds: string[];
  grantedFeatNames: string[];
  requiresOriginFeat: boolean;
  requiresOriginFeatSelection: boolean;
  notes: string[];
};

type EntityWithSource = {
  sourceMeta?: {
    sourceSystem?: "mpmb" | "open5e";
    edition?: "2014" | "2024" | "unknown";
    importPreset?: string;
  };
  sourceRefs: string[];
  key: string;
  name: string;
};

type EntityWithCompatibility = EntityWithSource & {
  compatibility?: CompatibilityMeta;
};

const DEFAULT_CONTEXT: Required<Pick<RulesQueryContext, "provider" | "rulesMode">> = {
  provider: "all",
  rulesMode: "2024",
};

function normalizeCanonicalToken(value: string): string {
  return toSlug(value)
    .replace(/\b20(14|24)\b/g, "")
    .replace(/srd-2024-/, "")
    .replace(/srd-2014-/, "")
    .replace(/srd-/, "")
    .replace(/open5e-2024-/, "")
    .replace(/open5e-2014-/, "")
    .replace(/open5e-/, "")
    .replace(/-legacy$/, "")
    .replace(/-ua$/, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferContentVersion(entity: EntityWithSource): ContentVersion {
  const edition = entity.sourceMeta?.edition;
  if (edition === "2014" || edition === "2024") {
    return edition;
  }
  const text = `${entity.key} ${entity.name} ${entity.sourceRefs.join(" ")}`.toLowerCase();
  if (text.includes("2024")) {
    return "2024";
  }
  if (text.includes("2014")) {
    return "2014";
  }
  if (entity.sourceMeta?.sourceSystem === "mpmb") {
    return "legacy";
  }
  return "unknown";
}

function inferSourceScore(entity: EntityWithSource): number {
  const sourceSystem = entity.sourceMeta?.sourceSystem ?? "mpmb";
  const edition = inferContentVersion(entity);
  const importPreset = entity.sourceMeta?.importPreset ?? "";
  const sourceRef = entity.sourceRefs[0] ?? "";
  let score = sourceSystem === "mpmb" ? 100 : 80;
  if (importPreset === "mpmb-upstream-2024" || importPreset === "mpmb-upstream-2014") {
    score += 35;
  } else if (importPreset === "mpmb-local") {
    score += 15;
  } else if (importPreset === "mpmb-pdf") {
    score += 4;
  }
  if (sourceRef.startsWith("srd-")) {
    score += 8;
  }
  if (edition === "2024") {
    score += 3;
  }
  return score;
}

function versionPriority(version: ContentVersion, rulesMode: RulesMode): number {
  if (rulesMode === "2024") {
    if (version === "2024") return 5;
    if (version === "legacy") return 4;
    if (version === "2014") return 3;
    return 2;
  }
  if (version === "2014") return 5;
  if (version === "legacy") return 4;
  if (version === "unknown") return 3;
  return 1;
}

function withCompatibility<T extends EntityWithSource>(
  entry: T,
  compatibility: Omit<CompatibilityMeta, "contentVersion"> & { contentVersion?: ContentVersion },
): T & { compatibility: CompatibilityMeta } {
  return {
    ...entry,
    compatibility: {
      contentVersion: compatibility.contentVersion ?? inferContentVersion(entry),
      ...compatibility,
    },
  };
}

function providerMatches(entity: EntityWithSource, provider: SourceProvider | "all"): boolean {
  if (provider === "all") {
    return true;
  }
  return entity.sourceMeta?.sourceSystem === provider;
}

function pickPreferred<T extends EntityWithSource>(entries: T[], rulesMode: RulesMode): T | undefined {
  const sorted = [...entries].sort((left, right) => {
    const byVersion = versionPriority(inferContentVersion(right), rulesMode) - versionPriority(inferContentVersion(left), rulesMode);
    if (byVersion !== 0) {
      return byVersion;
    }
    return inferSourceScore(right) - inferSourceScore(left);
  });
  return sorted[0];
}

function chooseForRulesMode<T extends EntityWithSource>(entries: T[], rulesMode: RulesMode): T | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const has2024 = entries.some((entry) => inferContentVersion(entry) === "2024");
  if (rulesMode === "2024" && has2024) {
    return pickPreferred(entries.filter((entry) => inferContentVersion(entry) === "2024"), rulesMode);
  }
  if (rulesMode === "2014") {
    const non2024 = entries.filter((entry) => inferContentVersion(entry) !== "2024");
    if (non2024.length > 0) {
      return pickPreferred(non2024, rulesMode);
    }
  }
  return pickPreferred(entries, rulesMode);
}

function canonicalClassKey(entry: ClassDefinition): string {
  return normalizeCanonicalToken(entry.canonicalClassKey ?? entry.key ?? entry.name);
}

function canonicalSubclassKey(entry: SubclassDefinition): string {
  const classKey = normalizeCanonicalToken(entry.canonicalClassKey ?? entry.classKey);
  let token = normalizeCanonicalToken(entry.key || entry.name);
  if (token.startsWith(`${classKey}-`)) {
    token = token.slice(classKey.length + 1);
  }
  return token || normalizeCanonicalToken(entry.name);
}

function canonicalGenericKey(entry: { key: string; name: string }): string {
  const fromKey = normalizeCanonicalToken(entry.key);
  if (fromKey) {
    return fromKey;
  }
  return normalizeCanonicalToken(entry.name);
}

function toReplacementGroup(kind: string, canonicalKey: string): string {
  return `${kind}:${canonicalKey}`;
}

function groupAndResolve<T extends EntityWithSource & { key: string; name: string }>(
  entries: T[],
  rulesMode: RulesMode,
  groupKeyOf: (entry: T) => { canonicalKey: string; replacementGroup: string },
  decorate: (entry: T, groupEntries: T[], canonicalKey: string, replacementGroup: string) => T,
): T[] {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const { replacementGroup } = groupKeyOf(entry);
    if (!grouped.has(replacementGroup)) {
      grouped.set(replacementGroup, []);
    }
    grouped.get(replacementGroup)?.push(entry);
  }

  const resolved: T[] = [];
  for (const [replacementGroup, groupEntries] of grouped.entries()) {
    const chosen = chooseForRulesMode(groupEntries, rulesMode);
    if (!chosen) {
      continue;
    }
    const { canonicalKey } = groupKeyOf(chosen);
    resolved.push(decorate(chosen, groupEntries, canonicalKey, replacementGroup));
  }
  return resolved;
}

function getSubclassUnlockLevel(classCanonicalKey: string, rulesMode: RulesMode): number {
  const progressionRule = getClassProgressionRule(classCanonicalKey);
  if (progressionRule) {
    return progressionRule.subclassUnlockByRulesMode[rulesMode];
  }
  return getDefaultSubclassUnlockLevel(rulesMode);
}

export function resolveClasses(entries: ClassDefinition[], context: RulesQueryContext = {}): ClassDefinition[] {
  const provider = context.provider ?? DEFAULT_CONTEXT.provider;
  const rulesMode = context.rulesMode ?? DEFAULT_CONTEXT.rulesMode;
  const filtered = entries.filter((entry) => providerMatches(entry, provider));

  return groupAndResolve(
    filtered,
    rulesMode,
    (entry) => {
      const canonicalKey = canonicalClassKey(entry);
      return {
        canonicalKey,
        replacementGroup: toReplacementGroup("class", canonicalKey),
      };
    },
    (entry, groupEntries, canonicalKey, replacementGroup) => {
      const contentVersion = inferContentVersion(entry);
      const has2024 = groupEntries.some((candidate) => inferContentVersion(candidate) === "2024");
      const conversionMode: ConversionMode =
        rulesMode === "2024" && contentVersion !== "2024" ? "legacy-only" : "native";
      return withCompatibility(entry, {
        contentVersion,
        canonicalKey,
        replacementGroup,
        replacedBy2024: has2024 && contentVersion !== "2024",
        legacyCompatibleIn2024: rulesMode === "2024" && contentVersion !== "2024",
        conversionMode,
      });
    },
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveSubclasses(
  entries: SubclassDefinition[],
  classes: ClassDefinition[],
  context: RulesQueryContext = {},
): SubclassDefinition[] {
  const provider = context.provider ?? DEFAULT_CONTEXT.provider;
  const rulesMode = context.rulesMode ?? DEFAULT_CONTEXT.rulesMode;
  const classById = new Map(classes.map((entry) => [entry.id, entry]));
  const selectedClass = context.selectedClassId ? classById.get(context.selectedClassId) : undefined;
  const selectedClassCanonical = selectedClass?.compatibility?.canonicalKey ?? (selectedClass ? canonicalClassKey(selectedClass) : undefined);

  const providerFiltered = entries.filter((entry) => providerMatches(entry, provider));
  const classScoped = selectedClassCanonical
    ? providerFiltered.filter((entry) => normalizeCanonicalToken(entry.canonicalClassKey ?? entry.classKey) === selectedClassCanonical)
    : providerFiltered;

  const resolved = groupAndResolve(
    classScoped,
    rulesMode,
    (entry) => {
      const classCanonical = normalizeCanonicalToken(entry.canonicalClassKey ?? entry.classKey);
      const subclassCanonical = canonicalSubclassKey(entry);
      return {
        canonicalKey: subclassCanonical,
        replacementGroup: `subclass:${classCanonical}:${subclassCanonical}`,
      };
    },
    (entry, groupEntries, canonicalKey, replacementGroup) => {
      const contentVersion = inferContentVersion(entry);
      const classCanonical = normalizeCanonicalToken(entry.canonicalClassKey ?? entry.classKey);
      const has2024 = groupEntries.some((candidate) => inferContentVersion(candidate) === "2024");
      const unlockLevel = getSubclassUnlockLevel(classCanonical, rulesMode);
      const notes: string[] = [];
      if (rulesMode === "2024" && contentVersion !== "2024") {
        notes.push(`Legacy subclass uses 2024 class progression (unlock level ${unlockLevel}).`);
      }
      return withCompatibility(entry, {
        contentVersion,
        canonicalKey,
        replacementGroup,
        replacedBy2024: has2024 && contentVersion !== "2024",
        legacyCompatibleIn2024: !has2024 || contentVersion === "2024",
        conversionMode: rulesMode === "2024" && contentVersion !== "2024" ? "2024-converted" : "native",
        notes,
        subclassUnlockLevel: unlockLevel,
      });
    },
  );

  if (context.classLevel === undefined) {
    return resolved.sort((a, b) => a.name.localeCompare(b.name));
  }
  return resolved
    .filter((entry) => {
      const unlockLevel = entry.compatibility?.subclassUnlockLevel ?? 1;
      return context.classLevel !== undefined && context.classLevel >= unlockLevel;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getConvertedSpeciesTraits(species: SpeciesDefinition, rulesMode: RulesMode): ConvertedSpeciesTraits {
  const version = inferContentVersion(species);
  const isConverted = rulesMode === "2024" && version !== "2024";
  const notes = isConverted ? ["Legacy species selected in 2024 mode: legacy Species ASI is ignored."] : [];
  return {
    rulesMode,
    conversionMode: isConverted ? "2024-converted" : "native",
    ignoresLegacyAbilityScoreIncrease: isConverted,
    traits: species.traits,
    notes,
  };
}

export function resolveSpecies(entries: SpeciesDefinition[], context: RulesQueryContext = {}): SpeciesDefinition[] {
  const provider = context.provider ?? DEFAULT_CONTEXT.provider;
  const rulesMode = context.rulesMode ?? DEFAULT_CONTEXT.rulesMode;
  const filtered = entries.filter((entry) => providerMatches(entry, provider));

  return groupAndResolve(
    filtered,
    rulesMode,
    (entry) => {
      const canonicalKey = canonicalGenericKey(entry);
      return {
        canonicalKey,
        replacementGroup: toReplacementGroup("species", canonicalKey),
      };
    },
    (entry, groupEntries, canonicalKey, replacementGroup) => {
      const conversion = getConvertedSpeciesTraits(entry, rulesMode);
      const has2024 = groupEntries.some((candidate) => inferContentVersion(candidate) === "2024");
      return withCompatibility(
        {
          ...entry,
          traits: conversion.traits,
        },
        {
          contentVersion: inferContentVersion(entry),
          canonicalKey,
          replacementGroup,
          replacedBy2024: has2024 && inferContentVersion(entry) !== "2024",
          legacyCompatibleIn2024: rulesMode === "2024" && inferContentVersion(entry) !== "2024",
          conversionMode: conversion.conversionMode,
          notes: conversion.notes,
        },
      );
    },
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function getConvertedBackgroundBenefits(background: BackgroundDefinition, rulesMode: RulesMode): ConvertedBackgroundBenefits {
  const version = inferContentVersion(background);
  const isConverted = rulesMode === "2024" && version !== "2024";
  const hasOriginPlaceholder = /select origin feat/i.test(background.bonusFeat ?? "");
  const hasNativeFeat = Boolean(background.bonusFeat && !hasOriginPlaceholder);
  const requiresOriginFeatSelection = isConverted && !hasNativeFeat;
  const notes: string[] = [];
  if (isConverted) {
    notes.push("Legacy background selected in 2024 mode: use 2024 background ASI allocation.");
    if (requiresOriginFeatSelection) {
      notes.push("No native feat found; select an Origin Feat for 2024 compatibility.");
    }
  }
  return {
    rulesMode,
    conversionMode: isConverted ? "2024-converted" : "native",
    abilityScoreRule: isConverted ? "background-2024" : "native",
    abilityScoreMode: isConverted ? "background-2024" : "native",
    skillText: background.skillText,
    toolText: background.toolText,
    equipmentText: background.equipmentText,
    bonusFeat: hasNativeFeat ? background.bonusFeat : requiresOriginFeatSelection ? "Select Origin Feat (2024)" : undefined,
    grantedFeatIds: [],
    grantedFeatNames: hasNativeFeat && background.bonusFeat ? [background.bonusFeat] : [],
    requiresOriginFeat: requiresOriginFeatSelection,
    requiresOriginFeatSelection,
    notes,
  };
}

export function resolveBackgrounds(entries: BackgroundDefinition[], context: RulesQueryContext = {}): BackgroundDefinition[] {
  const provider = context.provider ?? DEFAULT_CONTEXT.provider;
  const rulesMode = context.rulesMode ?? DEFAULT_CONTEXT.rulesMode;
  const filtered = entries.filter((entry) => providerMatches(entry, provider));

  return groupAndResolve(
    filtered,
    rulesMode,
    (entry) => {
      const canonicalKey = canonicalGenericKey(entry);
      return {
        canonicalKey,
        replacementGroup: toReplacementGroup("background", canonicalKey),
      };
    },
    (entry, groupEntries, canonicalKey, replacementGroup) => {
      const conversion = getConvertedBackgroundBenefits(entry, rulesMode);
      const has2024 = groupEntries.some((candidate) => inferContentVersion(candidate) === "2024");
      return withCompatibility(
        {
          ...entry,
          bonusFeat: conversion.bonusFeat,
        },
        {
          contentVersion: inferContentVersion(entry),
          canonicalKey,
          replacementGroup,
          replacedBy2024: has2024 && inferContentVersion(entry) !== "2024",
          legacyCompatibleIn2024: rulesMode === "2024" && inferContentVersion(entry) !== "2024",
          conversionMode: conversion.conversionMode,
          notes: conversion.notes,
        },
      );
    },
  ).sort((a, b) => a.name.localeCompare(b.name));
}

function resolveGeneric<T extends EntityWithCompatibility>(
  entries: T[],
  kind: string,
  context: RulesQueryContext = {},
): T[] {
  const provider = context.provider ?? DEFAULT_CONTEXT.provider;
  const rulesMode = context.rulesMode ?? DEFAULT_CONTEXT.rulesMode;
  const filtered = entries.filter((entry) => providerMatches(entry, provider));
  return groupAndResolve(
    filtered,
    rulesMode,
    (entry) => {
      const canonicalKey = canonicalGenericKey(entry);
      return {
        canonicalKey,
        replacementGroup: toReplacementGroup(kind, canonicalKey),
      };
    },
    (entry, groupEntries, canonicalKey, replacementGroup) => {
      const contentVersion = inferContentVersion(entry);
      const has2024 = groupEntries.some((candidate) => inferContentVersion(candidate) === "2024");
      const conversionMode: ConversionMode =
        rulesMode === "2024" && contentVersion !== "2024" ? "legacy-only" : "native";
      return withCompatibility(entry, {
        contentVersion,
        canonicalKey,
        replacementGroup,
        replacedBy2024: has2024 && contentVersion !== "2024",
        legacyCompatibleIn2024: rulesMode === "2024" && contentVersion !== "2024",
        conversionMode,
      });
    },
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveFeats(entries: FeatDefinition[], context: RulesQueryContext = {}): FeatDefinition[] {
  return resolveGeneric(entries, "feat", context);
}

export function resolveEquipment(entries: EquipmentDefinition[], context: RulesQueryContext = {}): EquipmentDefinition[] {
  return resolveGeneric(entries, "equipment", context);
}

export function resolveSpells(entries: SpellDefinition[], context: RulesQueryContext = {}): SpellDefinition[] {
  return resolveGeneric(entries, "spell", context);
}
