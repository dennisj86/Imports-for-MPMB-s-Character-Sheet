import type { CharacterDraft, DerivedSummary } from "./character";
import type { ClassDefinition, FeatureDefinition, SubclassDefinition } from "./content";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getFeaturesForLevel(
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
  level: number,
): FeatureDefinition[] {
  const classFeatures = (classDef?.features ?? []).filter((feature) => feature.minLevel <= level);
  const subclassFeatures = (subclassDef?.features ?? []).filter((feature) => feature.minLevel <= level);
  return [...classFeatures, ...subclassFeatures].sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name));
}

export function deriveSummary(
  draft: CharacterDraft,
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
): DerivedSummary {
  const modifiers = {
    str: abilityModifier(draft.abilityScores.str),
    dex: abilityModifier(draft.abilityScores.dex),
    con: abilityModifier(draft.abilityScores.con),
    int: abilityModifier(draft.abilityScores.int),
    wis: abilityModifier(draft.abilityScores.wis),
    cha: abilityModifier(draft.abilityScores.cha),
  };

  const spellcastingSignals = [classDef?.spellcastingFactor, classDef?.spellcastingKnown, subclassDef?.spellcastingFactor, subclassDef?.spellcastingKnown];
  const hasSpellcasting = spellcastingSignals.some((value) => value !== undefined && value !== null && value !== "");

  return {
    levelTotal: draft.classSelection.level,
    abilityModifiers: modifiers,
    passivePerception: 10 + modifiers.wis,
    passiveInvestigation: 10 + modifiers.int,
    passiveInsight: 10 + modifiers.wis,
    spellcasting: {
      available: hasSpellcasting,
      notes: hasSpellcasting ? "Declarative spellcasting data available; slot/prepared engine not automated yet." : "No declarative spellcasting data detected for current class/subclass.",
    },
    automationStatus: {
      ac: "manual",
      hp: "manual",
      saves: "manual",
      skills: "manual",
    },
  };
}
