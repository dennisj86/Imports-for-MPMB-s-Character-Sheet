import { toSlug } from "../../lib/slug";
import type {
  ActionPrerequisite,
  CharacterAction,
  CharacterActionActivationType,
  CharacterActionResourceState,
  CharacterActionSet,
  CharacterResource,
  CharacterResourceSet,
  LimitedUseFeature,
  RechargeRule,
  ResourceRechargeType,
  SpellcastingResourceState,
} from "../../domain/actionResources";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterDraft } from "../../domain/character";
import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  FeatureDefinition,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type { DerivedCharacterStats, DerivedDataStatus } from "../../domain/derivedStats";
import type { LevelProgressionResult } from "../../domain/progression";
import { resolveEquipmentDefinitionForInventoryItem } from "../equipment";
import { ACTION_FEATURE_RULES, type FeatureResourceFallbackRule, type FeatureRule } from "./mappings/actionFeatureRules";

type ResolvedFeature = {
  feature: FeatureDefinition;
  sourceType: "class" | "subclass";
  sourceId?: string;
  sourceName?: string;
};

type ActionResourceResolverContext = {
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  speciesDef?: SpeciesDefinition;
  backgroundDef?: BackgroundDefinition;
  selectedFeats?: FeatDefinition[];
  selectedSpells?: SpellDefinition[];
  equipmentCatalog?: EquipmentDefinition[];
  resourceSet?: CharacterResourceSet;
};

type FeatureUsageResolution = {
  usesMax?: number;
  formula?: string;
  notes: string[];
  dataStatus: DerivedDataStatus;
};

type LimitedUseCollection = {
  resources: CharacterResource[];
  limitedUseFeatures: LimitedUseFeature[];
  byFeatureId: Map<string, CharacterResource>;
};

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-2014-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-2024-/, "")
    .replace(/^open5e-2014-/, "")
    .replace(/^open5e-/, "");
}

function combineStatuses(statuses: DerivedDataStatus[]): DerivedDataStatus {
  if (statuses.includes("manual")) {
    return "manual";
  }
  if (statuses.includes("partial")) {
    return "partial";
  }
  if (statuses.includes("pending")) {
    return "pending";
  }
  return "complete";
}

function valueByLevel<T>(values: T[], level: number): T | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const index = Math.max(1, Math.min(level, values.length)) - 1;
  return values[index] ?? values[values.length - 1];
}

function resolveAbilityModifier(derivedStats: DerivedCharacterStats, ability: "str" | "dex" | "con" | "int" | "wis" | "cha"): number {
  return derivedStats.abilityScores[ability].modifier;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const direct = Number(value);
    if (Number.isFinite(direct)) {
      return direct;
    }
    const match = value.match(/-?[0-9]+/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function parseAbilityToken(value: string): "str" | "dex" | "con" | "int" | "wis" | "cha" | undefined {
  const token = value.toLowerCase();
  if (token.startsWith("str")) return "str";
  if (token.startsWith("dex")) return "dex";
  if (token.startsWith("con")) return "con";
  if (token.startsWith("int")) return "int";
  if (token.startsWith("wis")) return "wis";
  if (token.startsWith("cha")) return "cha";
  return undefined;
}

function evaluateStringUsage(
  raw: string,
  derivedStats: DerivedCharacterStats,
  classLevel: number,
): { usesMax?: number; formula?: string; dataStatus: DerivedDataStatus; notes: string[] } {
  const notes: string[] = [];
  const text = raw.trim();
  if (!text) {
    return { dataStatus: "pending", notes };
  }
  if (/unlimited|∞/i.test(text)) {
    return { formula: "unlimited", dataStatus: "complete", notes };
  }

  const poolByLevel = text.match(/^([0-9]+)\s*hp pool/i);
  if (poolByLevel) {
    const value = Number(poolByLevel[1]);
    return { usesMax: value, formula: "pool", dataStatus: "complete", notes };
  }

  const classLevelTimes = text.match(/([0-9]+)\s*(?:x|×|\*)\s*your\s+[a-z]+\s+level/i);
  if (classLevelTimes) {
    const multiplier = Number(classLevelTimes[1]);
    return {
      usesMax: multiplier * classLevel,
      formula: `${multiplier} * class level`,
      dataStatus: "complete",
      notes,
    };
  }

  const onePlusAbility = text.match(/1\s*\+\s*(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+modifier/i);
  if (onePlusAbility) {
    const ability = parseAbilityToken(onePlusAbility[1]);
    if (ability) {
      return {
        usesMax: Math.max(1, 1 + resolveAbilityModifier(derivedStats, ability)),
        formula: `1 + ${ability.toUpperCase()} modifier`,
        dataStatus: "complete",
        notes,
      };
    }
  }

  const abilityOnly = text.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+modifier/i);
  if (abilityOnly) {
    const ability = parseAbilityToken(abilityOnly[1]);
    if (ability) {
      return {
        usesMax: Math.max(1, resolveAbilityModifier(derivedStats, ability)),
        formula: `${ability.toUpperCase()} modifier`,
        dataStatus: "complete",
        notes,
      };
    }
  }

  if (/proficiency bonus/i.test(text)) {
    return {
      usesMax: Math.max(1, derivedStats.proficiencyBonus),
      formula: "proficiency bonus",
      dataStatus: "complete",
      notes,
    };
  }

  const number = numberFromUnknown(text);
  if (number !== undefined) {
    return {
      usesMax: number,
      formula: "fixed",
      dataStatus: "complete",
      notes,
    };
  }

  notes.push(`Could not resolve usage string '${text}'.`);
  return {
    dataStatus: "partial",
    notes,
  };
}

function evaluateFeatureUsages(
  usages: unknown,
  level: number,
  derivedStats: DerivedCharacterStats,
  classLevel: number,
): FeatureUsageResolution {
  const notes: string[] = [];

  if (usages === undefined || usages === null) {
    return { notes, dataStatus: "pending" };
  }

  if (typeof usages === "number") {
    return {
      usesMax: usages,
      formula: "fixed",
      notes,
      dataStatus: "complete",
    };
  }

  if (typeof usages === "string") {
    const resolved = evaluateStringUsage(usages, derivedStats, classLevel);
    return {
      usesMax: resolved.usesMax,
      formula: resolved.formula,
      notes: resolved.notes,
      dataStatus: resolved.dataStatus,
    };
  }

  if (Array.isArray(usages)) {
    if (usages.length === 0) {
      return { notes, dataStatus: "pending" };
    }
    const first = usages[0] as unknown;
    if (typeof first === "object" && first && "level" in (first as Record<string, unknown>) && "column_value" in (first as Record<string, unknown>)) {
      const byLevel = (usages as Array<{ level?: number; column_value?: unknown }>).find((entry) => entry.level === level);
      const fallback = byLevel ?? (usages as Array<{ column_value?: unknown }>)[usages.length - 1];
      if (fallback?.column_value !== undefined) {
        return evaluateFeatureUsages(fallback.column_value, level, derivedStats, classLevel);
      }
      return { notes: ["Unable to parse tabular usage value."], dataStatus: "partial" };
    }
    const value = valueByLevel(usages, level);
    return evaluateFeatureUsages(value, level, derivedStats, classLevel);
  }

  if (typeof usages === "object") {
    const columnValue = (usages as { column_value?: unknown }).column_value;
    if (columnValue !== undefined) {
      return evaluateFeatureUsages(columnValue, level, derivedStats, classLevel);
    }
  }

  return {
    notes: ["Unsupported usage value shape."],
    dataStatus: "partial",
  };
}

function applyResourceFallback(
  fallback: FeatureResourceFallbackRule | undefined,
  derivedStats: DerivedCharacterStats,
  classLevel: number,
): FeatureUsageResolution {
  if (!fallback) {
    return { notes: [], dataStatus: "pending" };
  }
  const notes = [...(fallback.notes ?? [])];
  let usesMax: number | undefined;
  let formula: string | undefined;
  if (fallback.usesFormula === "class-level*5") {
    usesMax = classLevel * 5;
    formula = "5 * class level";
  } else if (fallback.usesFormula === "1+cha-mod") {
    usesMax = Math.max(1, 1 + resolveAbilityModifier(derivedStats, "cha"));
    formula = "1 + CHA modifier";
  } else if (fallback.usesFormula === "cha-mod") {
    usesMax = Math.max(1, resolveAbilityModifier(derivedStats, "cha"));
    formula = "CHA modifier";
  } else if (fallback.usesFormula === "prof-bonus") {
    usesMax = Math.max(1, derivedStats.proficiencyBonus);
    formula = "proficiency bonus";
  }
  if (fallback.minUses !== undefined && (usesMax === undefined || usesMax < fallback.minUses)) {
    usesMax = fallback.minUses;
  }
  return {
    usesMax,
    formula,
    notes,
    dataStatus: usesMax === undefined ? "pending" : "complete",
  };
}

function resolveRechargeRules(
  rawRecovery: unknown,
  level: number,
  fallbackType?: ResourceRechargeType,
): RechargeRule {
  let candidate = rawRecovery;
  if (Array.isArray(rawRecovery)) {
    candidate = valueByLevel(rawRecovery, level);
  }
  const text = String(candidate ?? "").trim().toLowerCase();
  if (text.includes("short rest") && text.includes("long rest")) {
    return {
      type: "short-rest",
      label: "Short Rest (also recovers on Long Rest)",
      notes: [],
    };
  }
  if (text.includes("short rest")) {
    return { type: "short-rest", label: "Short Rest", notes: [] };
  }
  if (text.includes("long rest")) {
    return { type: "long-rest", label: "Long Rest", notes: [] };
  }
  if (text.includes("at will")) {
    return { type: "at-will", label: "At Will", notes: [] };
  }
  if (text.includes("dawn") || text.includes("special")) {
    return { type: "special", label: String(candidate), notes: [] };
  }
  if (fallbackType) {
    if (fallbackType === "short-rest") return { type: "short-rest", label: "Short Rest", notes: ["Fallback recharge rule used."] };
    if (fallbackType === "long-rest") return { type: "long-rest", label: "Long Rest", notes: ["Fallback recharge rule used."] };
    if (fallbackType === "at-will") return { type: "at-will", label: "At Will", notes: ["Fallback recharge rule used."] };
    if (fallbackType === "special") return { type: "special", label: "Special", notes: ["Fallback recharge rule used."] };
    if (fallbackType === "none") return { type: "none", label: "None", notes: ["Fallback recharge rule used."] };
    return { type: "manual", label: "Manual", notes: ["Fallback recharge rule used."] };
  }
  return {
    type: "manual",
    label: "Manual / Pending",
    notes: [],
  };
}

function detectActivationFromText(name: string, description: string | undefined): CharacterActionActivationType | undefined {
  const text = `${name}\n${description ?? ""}`.toLowerCase();
  if (/as a bonus action|as bonus action|\bbonus action\b/.test(text)) {
    return "bonus-action";
  }
  if (/as a reaction|use your reaction|\breaction\b/.test(text)) {
    return "reaction";
  }
  if (/as an action|as a action|\buse an action\b|\baction:\b/.test(text)) {
    return "action";
  }
  if (/free action/.test(text)) {
    return "free";
  }
  if (/when you hit|when you take damage|when you are hit|once per turn|immediately after/i.test(text)) {
    return "special";
  }
  return undefined;
}

function detectSpellActivation(castingTime: string | undefined): CharacterActionActivationType | undefined {
  if (!castingTime) {
    return undefined;
  }
  const token = castingTime.toLowerCase().trim();
  if (token.includes("bonus action") || token === "ba" || token === "1 bns" || token === "1 ba") {
    return "bonus-action";
  }
  if (token.includes("reaction") || token === "rea" || token === "1 rea" || token === "r") {
    return "reaction";
  }
  if (
    token.includes("action") ||
    token === "act" ||
    token === "1 a" ||
    token === "a" ||
    token === "1 action"
  ) {
    return "action";
  }
  return undefined;
}

function featureRule(feature: FeatureDefinition): FeatureRule | undefined {
  const token = normalizeToken(feature.key || feature.name);
  return ACTION_FEATURE_RULES[token];
}

function parseDescriptionUsageFallback(description: string | undefined): { usesMax?: number; recharge?: RechargeRule; dataStatus: DerivedDataStatus; notes: string[] } {
  const text = String(description ?? "").toLowerCase();
  if (!text) {
    return { dataStatus: "pending", notes: [] };
  }
  if (/once per short rest|once,? you use this feature,? you must finish a short or long rest/.test(text)) {
    return {
      usesMax: 1,
      recharge: { type: "short-rest", label: "Short Rest (description fallback)", notes: [] },
      dataStatus: "complete",
      notes: ["Uses/recharge inferred from feature description fallback."],
    };
  }
  if (/once per long rest|once,? you use this feature,? you must finish a long rest/.test(text)) {
    return {
      usesMax: 1,
      recharge: { type: "long-rest", label: "Long Rest (description fallback)", notes: [] },
      dataStatus: "complete",
      notes: ["Uses/recharge inferred from feature description fallback."],
    };
  }
  return { dataStatus: "pending", notes: [] };
}

function isFeatureLikelyPassive(feature: FeatureDefinition): boolean {
  const token = normalizeToken(feature.name);
  return (
    token.includes("proficiency-bonus") ||
    token.includes("ability-score-improvement") ||
    token.includes("extra-attack") ||
    token.includes("unarmored-defense") ||
    token.includes("fighting-style")
  );
}

function collectResolvedFeatures(
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
  level: number,
): ResolvedFeature[] {
  const classFeatures: ResolvedFeature[] = (classDef?.features ?? [])
    .filter((feature) => feature.minLevel <= level)
    .map((feature) => ({
      feature,
      sourceType: "class",
      sourceId: classDef?.id,
      sourceName: classDef?.name,
    }));
  const subclassFeatures: ResolvedFeature[] = (subclassDef?.features ?? [])
    .filter((feature) => feature.minLevel <= level)
    .map((feature) => ({
      feature,
      sourceType: "subclass",
      sourceId: subclassDef?.id,
      sourceName: subclassDef?.name,
    }));
  return [...classFeatures, ...subclassFeatures];
}

function collectLimitedUseFeatures(
  draft: CharacterDraft,
  derivedStats: DerivedCharacterStats,
  features: ResolvedFeature[],
): LimitedUseCollection {
  const resources: CharacterResource[] = [];
  const limitedUseFeatures: LimitedUseFeature[] = [];
  const byFeatureId = new Map<string, CharacterResource>();

  for (const entry of features) {
    const fallback = featureRule(entry.feature)?.resourceFallback;
    const usageFromField = evaluateFeatureUsages(entry.feature.usages, draft.classSelection.level, derivedStats, draft.classSelection.level);
    const usageFromFallback = applyResourceFallback(fallback, derivedStats, draft.classSelection.level);
    const usageFromDescription = parseDescriptionUsageFallback(entry.feature.description);

    const usageResolution =
      usageFromField.usesMax !== undefined
        ? usageFromField
        : usageFromFallback.usesMax !== undefined
          ? usageFromFallback
          : usageFromDescription.usesMax !== undefined
            ? {
                usesMax: usageFromDescription.usesMax,
                notes: usageFromDescription.notes,
                dataStatus: usageFromDescription.dataStatus,
              }
            : {
                notes: [...usageFromField.notes, ...usageFromFallback.notes, ...usageFromDescription.notes],
                dataStatus: combineStatuses([usageFromField.dataStatus, usageFromFallback.dataStatus, usageFromDescription.dataStatus]),
              };

    const hasEvidence =
      entry.feature.usages !== undefined ||
      fallback !== undefined ||
      usageFromDescription.usesMax !== undefined;
    if (!hasEvidence) {
      continue;
    }

    const rechargeFromField = resolveRechargeRules(entry.feature.recovery, draft.classSelection.level, fallback?.recharge);
    const recharge = usageFromDescription.recharge ?? rechargeFromField;

    const resourceId = `resource:feature:${entry.feature.id}`;
    const notes = [...usageResolution.notes];
    if (usageFromField.usesMax === undefined && usageFromFallback.usesMax !== undefined) {
      notes.push("Fallback usage formula applied.");
    }
    if (usageFromField.usesMax === undefined && usageFromDescription.usesMax !== undefined) {
      notes.push("Description-based usage fallback applied.");
    }

    const dataStatus = combineStatuses([
      usageResolution.dataStatus,
      recharge.type === "manual" ? "pending" : "complete",
      usageResolution.usesMax === undefined ? "partial" : "complete",
    ]);

    const resource: CharacterResource = {
      id: resourceId,
      name: entry.feature.name,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      sourceName: entry.sourceName,
      levelRequirement: entry.feature.minLevel,
      usesMax: usageResolution.usesMax !== undefined && usageResolution.usesMax > 0 ? usageResolution.usesMax : undefined,
      usesRemaining: usageResolution.usesMax !== undefined && usageResolution.usesMax > 0 ? usageResolution.usesMax : undefined,
      recharge,
      formula: usageResolution.formula,
      notes,
      dataStatus,
    };

    resources.push(resource);
    byFeatureId.set(entry.feature.id, resource);
    limitedUseFeatures.push({
      featureId: entry.feature.id,
      featureName: entry.feature.name,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      levelRequirement: entry.feature.minLevel,
      resourceId: resource.id,
      notes: [...notes],
      dataStatus: resource.dataStatus,
    });
  }

  return {
    resources,
    limitedUseFeatures,
    byFeatureId,
  };
}

function collectFeatureActions(
  features: ResolvedFeature[],
  limitedUseByFeatureId: Map<string, CharacterResource>,
): CharacterAction[] {
  const actions: CharacterAction[] = [];

  for (const entry of features) {
    const activationFromText = detectActivationFromText(entry.feature.name, entry.feature.description);
    const activationFromRule = featureRule(entry.feature)?.action?.activationType;
    const activationType = activationFromText ?? activationFromRule;
    const resource = limitedUseByFeatureId.get(entry.feature.id);
    const notes: string[] = [];
    if (featureRule(entry.feature)?.action?.notes) {
      notes.push(...(featureRule(entry.feature)?.action?.notes ?? []));
    }
    if (!activationFromText && activationFromRule) {
      notes.push("Activation type resolved via deterministic fallback rule.");
    }

    if (!activationType && !resource) {
      continue;
    }
    if (!activationType && isFeatureLikelyPassive(entry.feature)) {
      continue;
    }

    const finalActivation: CharacterActionActivationType = activationType ?? "utility";
    const dataStatus: DerivedDataStatus =
      activationType !== undefined
        ? resource?.dataStatus ?? "complete"
        : resource
          ? combineStatuses([resource.dataStatus, "partial"])
          : "partial";

    if (!activationType) {
      notes.push("No explicit action phrase detected; treated as utility action.");
    }

    actions.push({
      id: `action:feature:${entry.feature.id}`,
      name: entry.feature.name,
      activationType: finalActivation,
      source: {
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        sourceName: entry.sourceName,
      },
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      levelRequirement: entry.feature.minLevel,
      description: entry.feature.description,
      requiresResourceIds: resource ? [resource.id] : [],
      prerequisites: [],
      notes,
      dataStatus,
    });
  }

  return actions;
}

function collectSpellActions(
  selectedSpells: SpellDefinition[],
  spellcastingState: SpellcastingResourceState,
): CharacterAction[] {
  const actions: CharacterAction[] = [];
  const slotResourceIds = spellcastingState.slotResources.map((entry) => entry.id);

  for (const spell of selectedSpells) {
    const activation = detectSpellActivation(spell.castingTime);
    const notes: string[] = [];
    const prerequisites: ActionPrerequisite[] = [];
    if (spell.level > 0) {
      prerequisites.push({
        kind: "resource",
        description: `Requires spell slot of level ${spell.level} or higher.`,
        satisfied: slotResourceIds.length > 0,
      });
    }

    if (!activation) {
      notes.push("Casting time could not be mapped to an activation type.");
    }
    if (spellcastingState.spellSaveDC !== undefined) {
      notes.push(`Spell Save DC ${spellcastingState.spellSaveDC}.`);
    }
    if (spellcastingState.spellAttackModifier !== undefined) {
      const sign = spellcastingState.spellAttackModifier >= 0 ? "+" : "";
      notes.push(`Spell Attack ${sign}${spellcastingState.spellAttackModifier}.`);
    }
    if (spell.level === 0) {
      notes.push("Cantrip (at will).");
    }

    actions.push({
      id: `action:spell:${spell.id}`,
      name: spell.name,
      activationType: activation ?? "utility",
      source: {
        sourceType: "spell",
        sourceId: spell.id,
        sourceName: spell.name,
      },
      sourceType: "spell",
      sourceId: spell.id,
      description: spell.description,
      requiresResourceIds: spell.level > 0 ? slotResourceIds : [],
      prerequisites,
      notes,
      dataStatus: activation ? "complete" : "partial",
    });
  }

  return actions;
}

function collectItemActions(
  draft: CharacterDraft,
  equipmentCatalog: EquipmentDefinition[] = [],
): CharacterAction[] {
  const actions: CharacterAction[] = [];

  for (const item of draft.inventory.items) {
    if (!item.equipped) {
      continue;
    }
    const definition = resolveEquipmentDefinitionForInventoryItem(item, equipmentCatalog);
    if (!definition) {
      continue;
    }

    if (definition.category === "weapon") {
      actions.push({
        id: `action:item-weapon:${definition.id}`,
        name: `${definition.name} Attack`,
        activationType: "action",
        source: {
          sourceType: "item",
          sourceId: definition.id,
          sourceName: definition.name,
        },
        sourceType: "item",
        sourceId: definition.id,
        description: definition.description,
        requiresResourceIds: [],
        prerequisites: [],
        notes: ["Weapon attack baseline. Full damage/property automation remains pending."],
        dataStatus: "partial",
      });
      continue;
    }

    const activation = detectActivationFromText(definition.name, definition.description);
    if (!activation) {
      continue;
    }
    actions.push({
      id: `action:item:${definition.id}`,
      name: definition.name,
      activationType: activation,
      source: {
        sourceType: "item",
        sourceId: definition.id,
        sourceName: definition.name,
      },
      sourceType: "item",
      sourceId: definition.id,
      description: definition.description,
      requiresResourceIds: [],
      prerequisites: [],
      notes: [],
      dataStatus: "partial",
    });
  }

  return actions;
}

function splitActions(actions: CharacterAction[]): CharacterActionSet {
  const grouped: CharacterActionSet = {
    actions: [],
    bonusActions: [],
    reactions: [],
    freeActions: [],
    utilityActions: [],
  };
  for (const action of actions) {
    if (action.activationType === "action") {
      grouped.actions.push(action);
    } else if (action.activationType === "bonus-action") {
      grouped.bonusActions.push(action);
    } else if (action.activationType === "reaction") {
      grouped.reactions.push(action);
    } else if (action.activationType === "free") {
      grouped.freeActions.push(action);
    } else {
      grouped.utilityActions.push(action);
    }
  }
  for (const list of [grouped.actions, grouped.bonusActions, grouped.reactions, grouped.freeActions, grouped.utilityActions]) {
    list.sort((left, right) => left.name.localeCompare(right.name));
  }
  return grouped;
}

export function resolveCharacterResources(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
  derivedStats: DerivedCharacterStats,
  progression: LevelProgressionResult,
  context: ActionResourceResolverContext = {},
): CharacterResourceSet {
  const features = collectResolvedFeatures(context.classDef, context.subclassDef, draft.classSelection.level);
  const limitedUse = collectLimitedUseFeatures(draft, derivedStats, features);

  const slotResources: CharacterResource[] = Object.entries(progression.spellProgression.spellSlots)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([slotLevel, count]) => ({
      id: `resource:spell-slot:${slotLevel}`,
      name: `Spell Slot L${slotLevel}`,
      sourceType: "spell",
      sourceName: "Spellcasting",
      usesMax: count,
      usesRemaining: count,
      recharge: {
        type: progression.spellProgression.mode === "pact" ? "short-rest" : "long-rest",
        label: progression.spellProgression.mode === "pact" ? "Short Rest (Pact Slots)" : "Long Rest",
        notes: [],
      },
      notes: [],
      dataStatus: "complete",
    }));

  const spellcastingResources: SpellcastingResourceState = {
    available: progression.spellProgression.available,
    spellcastingAbility: derivedStats.spellcasting.ability,
    spellSaveDC: derivedStats.spellcasting.spellSaveDC,
    spellAttackModifier: derivedStats.spellcasting.spellAttackModifier,
    slotResources,
    cantripActions: [],
    spellActions: [],
    notes: [...progression.spellProgression.notes],
    dataStatus: progression.spellProgression.dataStatus,
  };

  const resources = [...limitedUse.resources, ...slotResources].sort((left, right) => left.name.localeCompare(right.name));
  const dataStatus = combineStatuses([
    spellcastingResources.dataStatus,
    resources.some((entry) => entry.dataStatus === "partial") ? "partial" : "complete",
    resources.some((entry) => entry.dataStatus === "pending") ? "pending" : "complete",
    appliedRules.dataStatus === "partial" ? "partial" : appliedRules.dataStatus === "pending" ? "pending" : "complete",
  ]);

  if (dataStatus !== "complete") {
    spellcastingResources.notes.push("Some resources remain partial/pending due incomplete declarative source data.");
  }

  return {
    resources,
    limitedUseFeatures: limitedUse.limitedUseFeatures,
    spellcasting: spellcastingResources,
  };
}

export function resolveCharacterActions(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
  derivedStats: DerivedCharacterStats,
  progression: LevelProgressionResult,
  context: ActionResourceResolverContext = {},
): CharacterActionSet {
  const resourceSet =
    context.resourceSet ??
    resolveCharacterResources(draft, appliedRules, derivedStats, progression, context);

  const features = collectResolvedFeatures(context.classDef, context.subclassDef, draft.classSelection.level);
  const limitedByFeatureId = new Map<string, CharacterResource>();
  for (const resource of resourceSet.resources) {
    if (resource.id.startsWith("resource:feature:")) {
      const featureId = resource.id.slice("resource:feature:".length);
      limitedByFeatureId.set(featureId, resource);
    }
  }

  const featureActions = collectFeatureActions(features, limitedByFeatureId);
  const spellActions = collectSpellActions(context.selectedSpells ?? [], resourceSet.spellcasting);
  const itemActions = collectItemActions(draft, context.equipmentCatalog);

  resourceSet.spellcasting.cantripActions = spellActions.filter((entry) => entry.sourceType === "spell" && (entry.name || "").length > 0)
    .filter((entry) => {
      const spell = (context.selectedSpells ?? []).find((candidate) => `action:spell:${candidate.id}` === entry.id);
      return spell?.level === 0;
    });
  resourceSet.spellcasting.spellActions = spellActions.filter((entry) => entry.sourceType === "spell");

  return splitActions([...featureActions, ...spellActions, ...itemActions]);
}

export function resolveCharacterActionResources(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
  derivedStats: DerivedCharacterStats,
  progression: LevelProgressionResult,
  context: ActionResourceResolverContext = {},
): CharacterActionResourceState {
  const resourceSet = resolveCharacterResources(draft, appliedRules, derivedStats, progression, context);
  const actionSet = resolveCharacterActions(draft, appliedRules, derivedStats, progression, {
    ...context,
    resourceSet,
  });

  const actionLists = [...actionSet.actions, ...actionSet.bonusActions, ...actionSet.reactions, ...actionSet.freeActions, ...actionSet.utilityActions];
  const pending: CharacterActionResourceState["pending"] = [];

  for (const action of actionLists) {
    if (action.dataStatus === "partial" || action.dataStatus === "pending") {
      pending.push({
        id: `pending:action:${action.id}`,
        type: "action",
        description: `${action.name}: action metadata is ${action.dataStatus}.`,
        severity: action.dataStatus === "pending" ? "warning" : "info",
      });
    }
  }
  for (const resource of resourceSet.resources) {
    if (resource.dataStatus === "partial" || resource.dataStatus === "pending") {
      pending.push({
        id: `pending:resource:${resource.id}`,
        type: "resource",
        description: `${resource.name}: resource metadata is ${resource.dataStatus}.`,
        severity: resource.dataStatus === "pending" ? "warning" : "info",
      });
    }
  }

  const dataStatus = combineStatuses([
    actionLists.some((entry) => entry.dataStatus === "partial") ? "partial" : "complete",
    actionLists.some((entry) => entry.dataStatus === "pending") ? "pending" : "complete",
    resourceSet.resources.some((entry) => entry.dataStatus === "partial") ? "partial" : "complete",
    resourceSet.resources.some((entry) => entry.dataStatus === "pending") ? "pending" : "complete",
    progression.dataStatus,
    derivedStats.dataStatus,
  ]);

  const notes = [
    ...progression.notes,
    ...resourceSet.spellcasting.notes,
  ];

  return {
    provider: draft.provider,
    rulesMode: draft.rulesMode,
    level: draft.classSelection.level,
    actionSet,
    resourceSet,
    pending,
    notes,
    dataStatus,
  };
}
