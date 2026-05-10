import type { CharacterAction } from "../../domain/actionResources";
import type { SpellDefinition } from "../../domain/content";
import type { ActiveEffectState } from "../../domain/rules";
import type { AbilityKey, DerivedCharacterStats, SkillKey } from "../../domain/derivedStats";
import type { CharacterRollView, RollActionDescriptor, RollRequest, RollSourceType } from "../../domain/rolls";
import type { CharacterEngineState } from "../characterEngine";
import { buildWeaponAttackProfiles, type WeaponAttackProfile } from "../rules";
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

function buildActionDescriptor(
  action: CharacterAction,
  derivedStats: DerivedCharacterStats,
  weaponProfilesBySourceId: Map<string, WeaponAttackProfile>,
): RollActionDescriptor {
  const sourceType = sourceTypeForAction(action);
  const damageExpression = extractDiceExpression(action.description);
  const weaponProfile = sourceType === "weapon" ? weaponProfilesBySourceId.get(action.sourceId ?? "") : undefined;
  const attackModifier = weaponProfile?.attackBonus ?? (sourceType === "weapon" ? derivedStats.proficiencyBonus : undefined);
  const rollRequest = attackModifier === undefined
    ? undefined
    : createD20Request({
        id: `roll:attack:${action.id}`,
        type: "attack-roll",
        label: action.name,
        sourceType,
        sourceId: action.sourceId ?? action.id,
        ability: weaponProfile?.attackAbility,
        modifier: attackModifier,
        baseModifier: weaponProfile ? weaponProfile.attackBonus - weaponProfile.appliedAttackModifiers.reduce((sum, modifier) => sum + (typeof modifier.value === "number" ? modifier.value : 0), 0) : attackModifier,
        permanentModifiers: weaponProfile?.appliedAttackModifiers,
        proficiencyApplied: true,
        metadata: {
          actionId: action.id,
          sourceSummary: action.source.sourceName ?? action.sourceId ?? action.name,
          weaponProfile,
        },
      });
  return {
    id: action.id,
    label: action.name,
    activationType: action.activationType,
    sourceType,
    sourceId: action.sourceId,
    sourceSummary: action.source.sourceName,
    rollRequest,
    damageRequest: (weaponProfile?.damageDice ?? damageExpression)
      ? {
          id: `roll:damage:${action.id}`,
          type: "damage-roll",
          label: `${action.name} Damage`,
          sourceType,
          sourceId: action.sourceId ?? action.id,
          modifier: weaponProfile?.damageModifier ?? 0,
          baseModifier: weaponProfile ? weaponProfile.damageModifier - weaponProfile.appliedDamageModifiers.reduce((sum, modifier) => sum + (typeof modifier.value === "number" ? modifier.value : 0), 0) : 0,
          permanentModifiers: weaponProfile?.appliedDamageModifiers,
          diceExpression: weaponProfile?.damageDice ?? damageExpression ?? "1d1",
          rollMode: "normal",
          metadata: {
            actionId: action.id,
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
    sourceId: spell.id,
    sourceSummary: spell.school,
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
            sourceSummary: spell.name,
          },
        }
      : undefined,
    spellSaveDc: saveAbility ? derivedStats.spellcasting.spellSaveDC : undefined,
    spellSaveAbility: saveAbility,
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

export function buildCharacterRollView(engine: CharacterEngineState, activeEffects: ActiveEffectState[] = []): CharacterRollView {
  const weaponProfiles = engine.draft
    ? buildWeaponAttackProfiles({
        draft: engine.draft,
        equipmentCatalog: engine.equipmentCatalog ?? [],
        derivedStats: engine.derivedStats,
        modifiers: engine.ruleEngine?.modifiers ?? [],
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
  return {
    abilityChecks: buildAbilityCheckRequests(engine.derivedStats),
    savingThrows: buildSavingThrowRequests(engine.derivedStats),
    skillChecks: buildSkillCheckRequests(engine.derivedStats),
    actionRolls: nonSpellActions,
    spellRolls: engine.selectedSpells.map((spell) => buildSpellDescriptor(spell, engine.derivedStats)),
    activeEffects,
  };
}
