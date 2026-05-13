import type { CharacterAction } from "../../domain/actionResources";
import type { SpellDefinition } from "../../domain/content";
import type { ActiveEffectState } from "../../domain/rules";
import type { AbilityKey, DerivedCharacterStats, SkillKey } from "../../domain/derivedStats";
import type { CharacterRollView, HiddenActionDuplicate, RollActionDescriptor, RollRequest, RollSourceType } from "../../domain/rolls";
import type { CharacterEngineState } from "../characterEngine";
import { toSlug } from "../../lib/slug";
import { buildWeaponAttackProfiles, resolveCombinedRuleProficiencies, type WeaponAttackProfile } from "../rules";
import { classifySpell } from "../spells";

const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

function sign(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function normalizeActionLabel(label: string, sourceSummary: string | undefined): string {
  const trimmed = label.trim();
  if (!trimmed || !sourceSummary) {
    return trimmed;
  }
  const sourcePrefix = `${sourceSummary.trim()}:`;
  if (trimmed.toLowerCase().startsWith(sourcePrefix.toLowerCase())) {
    return trimmed.slice(sourcePrefix.length).trim();
  }
  return trimmed;
}

function normalizeTextToken(value: string | undefined): string {
  return toSlug(String(value ?? "").replace(/\([^)]*\)/g, "").replace(/'/g, ""));
}

function summarizeText(value: string | undefined): string | undefined {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177).trim()}...` : firstSentence;
}

function mergeUniqueStrings(values: Array<string | undefined>): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

function combineActionStatus(current: string | undefined, next: string | undefined): string | undefined {
  const priority: Record<string, number> = {
    complete: 0,
    partial: 1,
    pending: 2,
    manual: 3,
  };
  if (!current) return next;
  if (!next) return current;
  return (priority[next] ?? -1) > (priority[current] ?? -1) ? next : current;
}

function allActionLists(engine: CharacterEngineState): CharacterAction[] {
  const actionSet = engine.actionResources.actionSet;
  return [
    ...actionSet.actions,
    ...actionSet.bonusActions,
    ...actionSet.reactions,
    ...actionSet.freeActions,
    ...actionSet.utilityActions,
  ];
}

function createD20Request(input: {
  id: string;
  type: RollRequest["type"];
  label: string;
  modifier: number;
  baseModifier?: number;
  permanentModifiers?: RollRequest["permanentModifiers"];
  ability?: AbilityKey;
  skill?: SkillKey;
  sourceType?: RollSourceType;
  sourceId?: string;
  proficiencyApplied?: boolean;
  metadata?: Record<string, unknown>;
}): RollRequest {
  return {
    id: input.id,
    type: input.type,
    label: input.label,
    ability: input.ability,
    skill: input.skill,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    modifier: input.modifier,
    baseModifier: input.baseModifier,
    permanentModifiers: input.permanentModifiers,
    proficiencyApplied: input.proficiencyApplied,
    diceExpression: "1d20",
    rollMode: "normal",
    metadata: input.metadata,
  };
}

export function buildAbilityCheckRequests(derivedStats: DerivedCharacterStats): RollRequest[] {
  return (Object.keys(ABILITY_LABELS) as AbilityKey[]).map((ability) => {
    const score = derivedStats.abilityScores[ability];
    return createD20Request({
      id: `roll:ability-check:${ability}`,
      type: "ability-check",
      label: `${ABILITY_LABELS[ability]} Check`,
      ability,
      modifier: score.modifier,
      proficiencyApplied: false,
      metadata: {
        finalScore: score.finalScore,
      },
    });
  });
}

export function buildSavingThrowRequests(derivedStats: DerivedCharacterStats): RollRequest[] {
  return (Object.keys(ABILITY_LABELS) as AbilityKey[]).map((ability) => {
    const save = derivedStats.savingThrows[ability];
    return createD20Request({
      id: `roll:saving-throw:${ability}`,
      type: "saving-throw",
      label: `${ABILITY_LABELS[ability]} Save`,
      ability,
      modifier: save.total,
      proficiencyApplied: save.proficient,
      metadata: {
        abilityModifier: save.abilityModifier,
        proficiencyBonus: save.proficiencyBonus,
      },
    });
  });
}

export function buildSkillCheckRequests(derivedStats: DerivedCharacterStats): RollRequest[] {
  return Object.values(derivedStats.skills)
    .map((skill) =>
      createD20Request({
        id: `roll:skill-check:${skill.key}`,
        type: "skill-check",
        label: skill.label,
        ability: skill.ability,
        skill: skill.key,
        modifier: skill.total,
        proficiencyApplied: skill.proficient,
        metadata: {
          expertise: skill.expertise,
          abilityModifier: skill.abilityModifier,
          proficiencyBonus: skill.proficiencyBonus,
        },
      }),
    )
    .sort((left, right) => left.label.localeCompare(right.label));
}

function extractDiceExpression(text: string | undefined): string | undefined {
  const match = text?.match(/\b\d*d\d+\s*(?:[+-]\s*\d+)?/i);
  return match?.[0]?.replace(/\s+/g, "");
}

function sourceTypeForAction(action: CharacterAction): RollSourceType {
  if (action.id.startsWith("action:item-weapon:")) {
    return "weapon";
  }
  if (action.sourceType === "spell") {
    return "spell";
  }
  if (action.sourceType === "item") {
    return "item";
  }
  if (action.sourceType === "class" || action.sourceType === "subclass" || action.sourceType === "species" || action.sourceType === "background" || action.sourceType === "feat") {
    return "feature";
  }
  return "custom";
}

function automationStatusForAction(
  action: CharacterAction,
  hasAttackRoll: boolean,
  hasDamageRoll: boolean,
): RollActionDescriptor["automationStatus"] {
  const dataStatus = action.dataStatus;
  if (dataStatus === "manual") {
    return "manual";
  }
  if (dataStatus === "pending") {
    return "unsupported";
  }
  if (dataStatus === "complete" && (hasAttackRoll || hasDamageRoll)) {
    return "automated";
  }
  return "partial";
}

function manualInstructionForStatus(
  status: RollActionDescriptor["automationStatus"],
): string | undefined {
  if (status === "automated") {
    return undefined;
  }
  if (status === "partial") {
    return "Resolve any unresolved rider/target effects manually.";
  }
  if (status === "manual") {
    return "Resolve this action manually at the table.";
  }
  return "No deterministic local automation path is available.";
}

function buildActionDescriptor(
  action: CharacterAction,
  derivedStats: DerivedCharacterStats,
  weaponProfilesBySourceId: Map<string, WeaponAttackProfile>,
): RollActionDescriptor {
  const sourceType = sourceTypeForAction(action);
  const label = normalizeActionLabel(action.name, action.source.sourceName);
  const damageExpression = extractDiceExpression(action.description);
  const weaponProfile = sourceType === "weapon" ? weaponProfilesBySourceId.get(action.sourceId ?? "") : undefined;
  const attackModifier = weaponProfile?.attackBonus ?? (sourceType === "weapon" ? derivedStats.proficiencyBonus : undefined);
  const hasDamageRoll = Boolean(weaponProfile?.damageDice ?? damageExpression);
  const automationStatus = automationStatusForAction(action, attackModifier !== undefined, hasDamageRoll);
  const rollRequest = attackModifier === undefined
    ? undefined
    : createD20Request({
        id: `roll:attack:${action.id}`,
        type: "attack-roll",
        label,
        sourceType,
        sourceId: action.sourceId ?? action.id,
        ability: weaponProfile?.attackAbility,
        modifier: attackModifier,
        baseModifier: weaponProfile ? weaponProfile.attackBonus - weaponProfile.appliedAttackModifiers.reduce((sum, modifier) => sum + (typeof modifier.value === "number" ? modifier.value : 0), 0) : attackModifier,
        permanentModifiers: weaponProfile?.appliedAttackModifiers,
        proficiencyApplied: true,
        metadata: {
          actionId: action.id,
          actionLabel: label,
          actionSourceType: action.sourceType,
          sourceSummary: action.source.sourceName ?? action.sourceId ?? action.name,
          weaponProfile,
        },
      });
  return {
    id: action.id,
    label,
    activationType: action.activationType,
    sourceType,
    sourceDetailType: action.sourceType,
    sourceId: action.sourceId,
    sourceSummary: action.source.sourceName,
    sourceSummaries: action.source.sourceName ? [action.source.sourceName] : [],
    aliasLabels: action.name !== label ? [action.name] : [],
    description: action.description,
    shortDescription: summarizeText(action.description),
    automationStatus,
    manualInstructions: manualInstructionForStatus(automationStatus),
    mappingBadges: weaponProfile?.masteryBadges,
    rollRequest,
    damageRequest: hasDamageRoll
      ? {
          id: `roll:damage:${action.id}`,
          type: "damage-roll",
          label: `${label} Damage`,
          sourceType,
          sourceId: action.sourceId ?? action.id,
          modifier: weaponProfile?.damageModifier ?? 0,
          baseModifier: weaponProfile ? weaponProfile.damageModifier - weaponProfile.appliedDamageModifiers.reduce((sum, modifier) => sum + (typeof modifier.value === "number" ? modifier.value : 0), 0) : 0,
          permanentModifiers: weaponProfile?.appliedDamageModifiers,
          diceExpression: weaponProfile?.damageDice ?? damageExpression ?? "1d1",
          rollMode: "normal",
          metadata: {
            actionId: action.id,
            actionLabel: label,
            actionSourceType: action.sourceType,
            sourceSummary: action.source.sourceName ?? action.sourceId ?? action.name,
            weaponProfile,
          },
        }
      : undefined,
    resourceIds: action.requiresResourceIds,
    notes: action.notes,
    dataStatus: action.dataStatus,
  };
}

function buildSpellDescriptor(
  spell: SpellDefinition,
  derivedStats: DerivedCharacterStats,
): RollActionDescriptor {
  const classification = classifySpell(spell);
  const saveAbility = classification.saveAbility;
  const damageExpression = classification.damageFormula;
  const attackModifier = classification.hasSpellAttack ? derivedStats.spellcasting.spellAttackModifier : undefined;
  return {
    id: `spell-roll:${spell.id}`,
    label: spell.name,
    activationType: "action",
    sourceType: "spell",
    sourceDetailType: "spell",
    sourceId: spell.id,
    sourceSummary: spell.school,
    sourceSummaries: spell.school ? [spell.school] : [],
    description: spell.description,
    shortDescription: summarizeText(spell.description),
    automationStatus: attackModifier !== undefined || saveAbility || damageExpression ? "partial" : "unsupported",
    manualInstructions: attackModifier !== undefined || saveAbility || damageExpression
      ? "Resolve targets and conditional spell effects manually."
      : "No deterministic roll surface was detected from local spell content.",
    rollRequest: attackModifier === undefined
      ? undefined
      : createD20Request({
          id: `roll:spell-attack:${spell.id}`,
          type: "spell-attack",
          label: `${spell.name} Spell Attack`,
          sourceType: "spell",
          sourceId: spell.id,
          modifier: attackModifier,
          proficiencyApplied: true,
          metadata: {
            spellLevel: spell.level,
            spellId: spell.id,
            sourceSummary: spell.name,
          },
        }),
    damageRequest: damageExpression
      ? {
          id: `roll:spell-damage:${spell.id}`,
          type: "damage-roll",
          label: `${spell.name} Damage`,
          sourceType: "spell",
          sourceId: spell.id,
          modifier: 0,
          diceExpression: damageExpression,
          rollMode: "normal",
          metadata: {
            spellLevel: spell.level,
            spellId: spell.id,
            sourceSummary: spell.name,
          },
        }
      : undefined,
    spellSaveDc: saveAbility ? derivedStats.spellcasting.spellSaveDC : undefined,
    spellSaveAbility: saveAbility,
    mappingBadges: [],
    resourceIds: [],
    notes: [
      attackModifier === undefined ? "No spell attack roll detected." : `Spell attack ${sign(attackModifier)}.`,
      saveAbility && derivedStats.spellcasting.spellSaveDC !== undefined
        ? `Save DC ${derivedStats.spellcasting.spellSaveDC} (${ABILITY_LABELS[saveAbility]}).`
        : undefined,
      damageExpression ? `Damage formula ${damageExpression}.` : undefined,
      classification.categories.length ? `Tags: ${classification.categories.join(", ")}.` : undefined,
    ].filter((entry): entry is string => Boolean(entry)),
    dataStatus: attackModifier !== undefined || saveAbility || damageExpression ? "partial" : "pending",
  };
}

function dedupeKeyForDescriptor(descriptor: RollActionDescriptor): string {
  if (descriptor.sourceType === "weapon") {
    return `weapon:${descriptor.id}`;
  }
  const labelToken = normalizeTextToken(normalizeActionLabel(descriptor.label, descriptor.sourceSummary));
  const activation = descriptor.activationType ?? "utility";
  const sourceDetail = descriptor.sourceDetailType ?? descriptor.sourceType ?? "custom";
  const sourceSummary = normalizeTextToken(descriptor.sourceSummary) || normalizeTextToken(descriptor.sourceId);
  return `${sourceDetail}:${sourceSummary}:${activation}:${labelToken}`;
}

function combineAutomationStatus(
  current: RollActionDescriptor["automationStatus"],
  next: RollActionDescriptor["automationStatus"],
): RollActionDescriptor["automationStatus"] {
  const priority: Record<string, number> = {
    automated: 0,
    partial: 1,
    manual: 2,
    unsupported: 3,
  };
  if (!current) return next;
  if (!next) return current;
  return (priority[next] ?? -1) > (priority[current] ?? -1) ? next : current;
}

function mergeActionDescriptor(primary: RollActionDescriptor, duplicate: RollActionDescriptor): RollActionDescriptor {
  const mergedAutomationStatus = combineAutomationStatus(primary.automationStatus, duplicate.automationStatus);
  const canonicalLabel = normalizeActionLabel(primary.label, primary.sourceSummary);
  const alternateLabel = normalizeActionLabel(duplicate.label, duplicate.sourceSummary);
  const label = canonicalLabel.length <= alternateLabel.length ? canonicalLabel : alternateLabel;
  const aliases = mergeUniqueStrings([
    ...(primary.aliasLabels ?? []),
    ...(duplicate.aliasLabels ?? []),
    primary.label !== label ? primary.label : undefined,
    duplicate.label !== label ? duplicate.label : undefined,
  ]);
  return {
    ...primary,
    label,
    sourceSummaries: mergeUniqueStrings([...(primary.sourceSummaries ?? []), ...(duplicate.sourceSummaries ?? [])]),
    aliasLabels: aliases,
    description: (primary.description && duplicate.description)
      ? (primary.description.length >= duplicate.description.length ? primary.description : duplicate.description)
      : primary.description ?? duplicate.description,
    shortDescription: primary.shortDescription ?? duplicate.shortDescription,
    automationStatus: mergedAutomationStatus,
    manualInstructions: manualInstructionForStatus(mergedAutomationStatus),
    rollRequest: primary.rollRequest ?? duplicate.rollRequest,
    damageRequest: primary.damageRequest ?? duplicate.damageRequest,
    spellSaveDc: primary.spellSaveDc ?? duplicate.spellSaveDc,
    spellSaveAbility: primary.spellSaveAbility ?? duplicate.spellSaveAbility,
    mappingBadges: mergeUniqueStrings([...(primary.mappingBadges ?? []), ...(duplicate.mappingBadges ?? [])]),
    resourceIds: mergeUniqueStrings([...primary.resourceIds, ...duplicate.resourceIds]),
    notes: mergeUniqueStrings([...primary.notes, ...duplicate.notes]),
    dataStatus: combineActionStatus(primary.dataStatus, duplicate.dataStatus),
  };
}

export function dedupeActionDescriptors(
  descriptors: RollActionDescriptor[],
): { descriptors: RollActionDescriptor[]; hiddenDuplicates: HiddenActionDuplicate[] } {
  const byKey = new Map<string, RollActionDescriptor>();
  const hiddenDuplicates: HiddenActionDuplicate[] = [];
  for (const descriptor of descriptors) {
    const key = dedupeKeyForDescriptor(descriptor);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, descriptor);
      continue;
    }
    hiddenDuplicates.push({
      id: descriptor.id,
      canonicalKey: key,
      label: descriptor.label,
      sourceSummary: descriptor.sourceSummary,
      hiddenBy: existing.id,
      reason: "Merged duplicate action card by normalized label, timing, and source.",
    });
    byKey.set(key, mergeActionDescriptor(existing, descriptor));
  }
  return {
    descriptors: Array.from(byKey.values()),
    hiddenDuplicates,
  };
}

export function buildCharacterRollView(engine: CharacterEngineState, activeEffects: ActiveEffectState[] = []): CharacterRollView {
  const combinedProficiencies =
    engine.appliedRules && engine.ruleEngine?.optionScoped
      ? resolveCombinedRuleProficiencies(engine.appliedRules, engine.ruleEngine.optionScoped)
      : undefined;
  const weaponProficiencies = combinedProficiencies && combinedProficiencies.weapons.length > 0 ? combinedProficiencies.weapons : undefined;
  const weaponProfiles = engine.draft
    ? buildWeaponAttackProfiles({
        draft: engine.draft,
        equipmentCatalog: engine.equipmentCatalog ?? [],
        derivedStats: engine.derivedStats,
        modifiers: engine.ruleEngine?.modifiers ?? [],
        weaponProficiencies,
      })
    : [];
  const profileBySourceId = new Map<string, WeaponAttackProfile>();
  for (const profile of weaponProfiles) {
    profileBySourceId.set(profile.itemInstanceId, profile);
    if (profile.itemDefinitionId) {
      profileBySourceId.set(profile.itemDefinitionId, profile);
    }
  }
  const nonSpellActions = allActionLists(engine)
    .filter((action) => action.sourceType !== "spell")
    .map((action) => buildActionDescriptor(action, engine.derivedStats, profileBySourceId));
  const deduped = dedupeActionDescriptors(nonSpellActions);
  return {
    abilityChecks: buildAbilityCheckRequests(engine.derivedStats),
    savingThrows: buildSavingThrowRequests(engine.derivedStats),
    skillChecks: buildSkillCheckRequests(engine.derivedStats),
    actionRolls: deduped.descriptors,
    spellRolls: engine.selectedSpells.map((spell) => buildSpellDescriptor(spell, engine.derivedStats)),
    activeEffects,
    diagnostics: {
      hiddenActionDuplicates: deduped.hiddenDuplicates,
    },
  };
}
