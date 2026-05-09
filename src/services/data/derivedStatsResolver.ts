import { toSlug } from "../../lib/slug";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterDraft } from "../../domain/character";
import type {
  AbilityKey,
  DerivedAbilityScore,
  DerivedArmorClassResult,
  DerivedCharacterStats,
  DerivedDataStatus,
  DerivedHitPointsResult,
  DerivedMovementResult,
  DerivedPendingRule,
  DerivedSaveResult,
  DerivedSkillResult,
  DerivedSpellcastingStatsResult,
  SkillKey,
} from "../../domain/derivedStats";
import type { ClassDefinition, EquipmentDefinition, SpeciesDefinition, SubclassDefinition } from "../../domain/content";
import { resolveArmorClassFromEquipment } from "../equipment";

type AbilityScoresWithModifiers = Record<AbilityKey, DerivedAbilityScore>;

type DerivedStatsResolverContext = {
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  speciesDef?: SpeciesDefinition;
  equipmentCatalog?: EquipmentDefinition[];
};

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const SKILL_CONFIG: Array<{ key: SkillKey; label: string; ability: AbilityKey }> = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animal-handling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleight-of-hand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
];

const SPELLCASTING_ABILITY_BY_CLASS: Record<string, AbilityKey> = {
  artificer: "int",
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  ranger: "wis",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int",
};

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-2014-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-2024-/, "")
    .replace(/^open5e-2014-/, "")
    .replace(/^open5e-/, "")
    .replace(/-2014$/, "")
    .replace(/-2024$/, "");
}

function normalizeSkillName(value: string): SkillKey | undefined {
  const token = normalizeToken(value).replace(/-skill$/, "");
  switch (token) {
    case "animal-handling":
    case "sleight-of-hand":
      return token;
    case "acrobatics":
    case "arcana":
    case "athletics":
    case "deception":
    case "history":
    case "insight":
    case "intimidation":
    case "investigation":
    case "medicine":
    case "nature":
    case "perception":
    case "performance":
    case "persuasion":
    case "religion":
    case "stealth":
    case "survival":
      return token;
    default:
      return undefined;
  }
}

function parseSpeedNumber(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }
  const match = text.match(/([0-9]{2,3})\s*(?:ft|feet|foot)?/i);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function parseMovementFromTraits(traits: string[]): Omit<DerivedMovementResult, "notes" | "dataStatus"> {
  const result: Omit<DerivedMovementResult, "notes" | "dataStatus"> = {};
  const joined = traits.join("\n").toLowerCase();

  const walkingMatch = joined.match(/(?:base )?(?:walking )?speed[^0-9]*([0-9]{2,3})\s*(?:ft|feet|foot)/i);
  if (walkingMatch) {
    result.walking = Number(walkingMatch[1]);
  }

  const swimmingMatch = joined.match(/swimm(?:ing)? speed[^0-9]*([0-9]{2,3})\s*(?:ft|feet|foot)/i);
  if (swimmingMatch) {
    result.swimming = Number(swimmingMatch[1]);
  }

  const flyingMatch = joined.match(/fly(?:ing)? speed[^0-9]*([0-9]{2,3})\s*(?:ft|feet|foot)/i);
  if (flyingMatch) {
    result.flying = Number(flyingMatch[1]);
  }

  const climbingMatch = joined.match(/climb(?:ing)? speed[^0-9]*([0-9]{2,3})\s*(?:ft|feet|foot)/i);
  if (climbingMatch) {
    result.climbing = Number(climbingMatch[1]);
  }

  const burrowingMatch = joined.match(/burrow(?:ing)? speed[^0-9]*([0-9]{2,3})\s*(?:ft|feet|foot)/i);
  if (burrowingMatch) {
    result.burrowing = Number(burrowingMatch[1]);
  }

  return result;
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

export function computeAbilityModifiers(draft: CharacterDraft, appliedRules: AppliedCharacterRules): AbilityScoresWithModifiers {
  const output = {} as AbilityScoresWithModifiers;
  for (const ability of ABILITIES) {
    const baseScore = draft.abilityScores[ability];
    const appliedBonus = appliedRules.abilityScoreAdjustments.fixed[ability] ?? 0;
    const finalScore = baseScore + appliedBonus;
    const notes: string[] = [];
    if (appliedBonus !== 0) {
      notes.push(`Applied rules bonus ${appliedBonus >= 0 ? "+" : ""}${appliedBonus}.`);
    }
    output[ability] = {
      ability,
      baseScore,
      appliedBonus,
      finalScore,
      modifier: abilityModifier(finalScore),
      notes,
    };
  }
  return output;
}

export function computeProficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function computeSavingThrows(
  appliedRules: AppliedCharacterRules,
  abilityScores: AbilityScoresWithModifiers,
  proficiencyBonus: number,
): Record<AbilityKey, DerivedSaveResult> {
  const proficient = new Set(appliedRules.proficiencies.savingThrows);
  const output = {} as Record<AbilityKey, DerivedSaveResult>;
  for (const ability of ABILITIES) {
    const abilityMod = abilityScores[ability].modifier;
    const hasProf = proficient.has(ability);
    output[ability] = {
      ability,
      proficient: hasProf,
      abilityModifier: abilityMod,
      proficiencyBonus: hasProf ? proficiencyBonus : 0,
      total: abilityMod + (hasProf ? proficiencyBonus : 0),
    };
  }
  return output;
}

export function computeSkillModifiers(
  appliedRules: AppliedCharacterRules,
  abilityScores: AbilityScoresWithModifiers,
  proficiencyBonus: number,
): Record<SkillKey, DerivedSkillResult> {
  const profSet = new Set<SkillKey>();
  for (const skillName of appliedRules.proficiencies.skills) {
    const normalized = normalizeSkillName(skillName);
    if (normalized) {
      profSet.add(normalized);
    }
  }

  const output = {} as Record<SkillKey, DerivedSkillResult>;
  for (const skill of SKILL_CONFIG) {
    const proficient = profSet.has(skill.key);
    const abilityMod = abilityScores[skill.ability].modifier;
    output[skill.key] = {
      key: skill.key,
      label: skill.label,
      ability: skill.ability,
      proficient,
      expertise: false,
      abilityModifier: abilityMod,
      proficiencyBonus: proficient ? proficiencyBonus : 0,
      total: abilityMod + (proficient ? proficiencyBonus : 0),
    };
  }
  return output;
}

export function computePassiveScores(skills: Record<SkillKey, DerivedSkillResult>) {
  return {
    passivePerception: 10 + skills.perception.total,
    passiveInvestigation: 10 + skills.investigation.total,
    passiveInsight: 10 + skills.insight.total,
  };
}

export function computeInitiative(abilityScores: AbilityScoresWithModifiers): number {
  return abilityScores.dex.modifier;
}

export function computeSpeed(speciesDef: SpeciesDefinition | undefined, appliedRules: AppliedCharacterRules): DerivedMovementResult {
  const notes: string[] = [];
  if (!speciesDef) {
    return {
      notes: ["No species selected; speed is pending."],
      dataStatus: "pending",
    };
  }

  const fromTraits = parseMovementFromTraits(appliedRules.speciesResult.traits);
  const fromSpeedField = parseSpeedNumber(speciesDef.speed);

  const walking = fromTraits.walking ?? fromSpeedField;
  const movement: DerivedMovementResult = {
    walking,
    swimming: fromTraits.swimming,
    flying: fromTraits.flying,
    climbing: fromTraits.climbing,
    burrowing: fromTraits.burrowing,
    notes,
    dataStatus: walking ? "complete" : "partial",
  };

  if (!walking) {
    notes.push("Could not determine walking speed from species data.");
  }

  return movement;
}

export function computeArmorClassBase(
  draft: CharacterDraft,
  equipmentCatalog: EquipmentDefinition[] | undefined,
  dexModifier: number,
): DerivedArmorClassResult {
  const breakdown = resolveArmorClassFromEquipment({
    inventoryItems: draft.inventory.items,
    equipmentCatalog,
    dexModifier,
  });
  return {
    value: breakdown.total,
    calculation: breakdown.calculation,
    armorName: breakdown.armorName,
    shieldName: breakdown.shieldName,
    dexApplied: breakdown.dexApplied,
    notes: breakdown.warnings,
    dataStatus: breakdown.dataStatus,
  };
}

export function computeHitPointsMaxBase(
  level: number,
  classDef: ClassDefinition | undefined,
  conModifier: number,
): DerivedHitPointsResult {
  if (!classDef?.hitDie) {
    return {
      max: Math.max(1, 1 + conModifier),
      formula: "manual",
      mode: "manual",
      notes: ["Class hit die unavailable; HP baseline requires manual input."],
      dataStatus: "pending",
    };
  }

  const hitDie = classDef.hitDie;
  const level1 = Math.max(1, hitDie + conModifier);
  if (level <= 1) {
    return {
      max: level1,
      formula: `${hitDie} + CON modifier`,
      mode: "level1-only",
      notes: [],
      dataStatus: "complete",
    };
  }

  const fixedGain = Math.floor(hitDie / 2) + 1;
  const perLevel = Math.max(1, fixedGain + conModifier);
  const max = level1 + (level - 1) * perLevel;
  const notes: string[] = ["Using fixed-average HP progression for levels above 1."];
  if (fixedGain + conModifier < 1) {
    notes.push("Per-level HP gain clamped to minimum 1.");
  }
  return {
    max,
    formula: `L1 (${hitDie} + CON) + (L-1) * (${fixedGain} + CON, min 1)`,
    mode: "fixed-average",
    notes,
    dataStatus: "complete",
  };
}

function resolveSpellcastingAbility(
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
): AbilityKey | undefined {
  const classToken = normalizeToken(classDef?.compatibility?.canonicalKey ?? classDef?.key ?? classDef?.name);
  if (classToken && SPELLCASTING_ABILITY_BY_CLASS[classToken]) {
    return SPELLCASTING_ABILITY_BY_CLASS[classToken];
  }

  const text = [...(classDef?.features ?? []), ...(subclassDef?.features ?? [])]
    .map((entry) => `${entry.name}\n${entry.description ?? ""}`)
    .join("\n")
    .toLowerCase();
  const match =
    text.match(/using\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+as\s+(?:your|my)\s+spellcasting ability/i) ??
    text.match(/spellcasting ability (?:is|modifier is)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)/i);
  if (match) {
    switch (match[1]) {
      case "strength":
        return "str";
      case "dexterity":
        return "dex";
      case "constitution":
        return "con";
      case "intelligence":
        return "int";
      case "wisdom":
        return "wis";
      case "charisma":
        return "cha";
    }
  }
  return undefined;
}

export function computeSpellcastingStats(
  appliedRules: AppliedCharacterRules,
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
  abilityScores: AbilityScoresWithModifiers,
  proficiencyBonus: number,
  level: number,
): DerivedSpellcastingStatsResult {
  const classFeatureSignalAtLevel = Boolean(
    classDef?.features.some((entry) => {
      if (entry.minLevel > level) {
        return false;
      }
      const text = `${entry.name} ${entry.description ?? ""}`.toLowerCase();
      return (
        text.includes("spellcasting") ||
        text.includes("pact magic") ||
        text.includes("prepared spells") ||
        text.includes("spells known") ||
        text.includes("cantrip")
      );
    }),
  );
  const subclassFeatureSignalAtLevel = Boolean(
    subclassDef?.features.some((entry) => {
      if (entry.minLevel > level) {
        return false;
      }
      const text = `${entry.name} ${entry.description ?? ""}`.toLowerCase();
      return text.includes("spellcasting") || text.includes("pact magic") || text.includes("cantrip");
    }),
  );
  const availableNow = appliedRules.spellcasting.available && (classFeatureSignalAtLevel || subclassFeatureSignalAtLevel);

  if (!availableNow) {
    return {
      available: false,
      preparationBasis: {
        mode: "none",
        notes: ["No spellcasting feature unlocked at current level."],
      },
      slotBasis: {
        mode: "none",
        notes: [],
      },
      notes: [],
      dataStatus: "complete",
    };
  }

  const ability = resolveSpellcastingAbility(classDef, subclassDef);
  const notes = [...appliedRules.spellcasting.notes];
  const featureText = [...(classDef?.features ?? []), ...(subclassDef?.features ?? [])]
    .map((entry) => `${entry.name}\n${entry.description ?? ""}`)
    .join("\n")
    .toLowerCase();

  const hasPreparedSignals = featureText.includes("prepared spells") || featureText.includes("can prepare");
  const hasKnownSignals = featureText.includes("spells known") || featureText.includes("know the following spells");
  const preparationMode: DerivedSpellcastingStatsResult["preparationBasis"]["mode"] =
    hasPreparedSignals && hasKnownSignals
      ? "mixed"
      : hasPreparedSignals
        ? "prepared"
        : hasKnownSignals
          ? "known"
          : "table-pending";

  if (preparationMode === "table-pending") {
    notes.push("Spell preparation/known mode needs class-table extraction.");
  }

  if (!ability) {
    notes.push("Spellcasting ability could not be resolved deterministically.");
    return {
      available: true,
      preparationBasis: {
        mode: preparationMode,
        notes: [],
      },
      slotBasis: {
        mode: "table-pending",
        notes: ["Spell slot table extraction pending."],
      },
      notes,
      dataStatus: "partial",
    };
  }

  const abilityModifierValue = abilityScores[ability].modifier;
  return {
    available: true,
    ability,
    abilityModifier: abilityModifierValue,
    proficiencyBonus,
    spellAttackModifier: abilityModifierValue + proficiencyBonus,
    spellSaveDC: 8 + abilityModifierValue + proficiencyBonus,
    preparationBasis: {
      mode: preparationMode,
      notes: [],
    },
    slotBasis: {
      mode: "table-pending",
      notes: ["Spell slot table extraction pending."],
    },
    notes,
    dataStatus: preparationMode === "table-pending" ? "partial" : "complete",
  };
}

export function resolveDerivedStats(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
  context: DerivedStatsResolverContext = {},
): DerivedCharacterStats {
  const abilityScores = computeAbilityModifiers(draft, appliedRules);
  const proficiencyBonus = computeProficiencyBonus(draft.classSelection.level);
  const savingThrows = computeSavingThrows(appliedRules, abilityScores, proficiencyBonus);
  const skills = computeSkillModifiers(appliedRules, abilityScores, proficiencyBonus);
  const passive = computePassiveScores(skills);
  const initiative = computeInitiative(abilityScores);
  const speed = computeSpeed(context.speciesDef, appliedRules);
  const armorClass = computeArmorClassBase(draft, context.equipmentCatalog, abilityScores.dex.modifier);
  const hitPoints = computeHitPointsMaxBase(draft.classSelection.level, context.classDef, abilityScores.con.modifier);
  const spellcasting = computeSpellcastingStats(
    appliedRules,
    context.classDef,
    context.subclassDef,
    abilityScores,
    proficiencyBonus,
    draft.classSelection.level,
  );

  const pending: DerivedPendingRule[] = [];
  for (const choice of appliedRules.pendingChoices) {
    pending.push({
      id: `applied-${choice.id}`,
      kind: choice.kind === "ability-score-choice" ? "ability-choice" : choice.kind === "skill-choice" ? "skill-choice" : "origin-feat",
      description: choice.description,
      severity: choice.status === "required" ? "warning" : "info",
    });
  }
  if (spellcasting.available) {
    pending.push({
      id: "derived-spell-slots",
      kind: "spell-slots",
      description: "Spell slot progression remains table-pending in this phase.",
      severity: "info",
    });
  }

  const notes = [
    ...appliedRules.notes,
    ...speed.notes,
    ...armorClass.notes,
    ...hitPoints.notes,
    ...spellcasting.notes,
  ];

  const dataStatus = combineStatuses([
    appliedRules.dataStatus === "complete" ? "complete" : appliedRules.dataStatus,
    speed.dataStatus,
    armorClass.dataStatus,
    hitPoints.dataStatus,
    spellcasting.dataStatus,
    pending.length > 0 ? "pending" : "complete",
  ]);

  return {
    abilityScores,
    proficiencyBonus,
    savingThrows,
    skills,
    passivePerception: passive.passivePerception,
    passiveInvestigation: passive.passiveInvestigation,
    passiveInsight: passive.passiveInsight,
    initiative,
    speed,
    armorClass,
    hitPoints,
    spellcasting,
    notes,
    pending,
    dataStatus,
  };
}
