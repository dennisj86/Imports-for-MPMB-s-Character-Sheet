import { describe, expect, it } from "vitest";
import { buildInventoryViewModel } from "../features/character/viewModels";
import {
  buildBarbarianFixtureAtLevel,
  buildBardFixtureAtLevel,
  buildCoverageMatrixV2,
  buildMonkFixtureAtLevel,
  buildPaladinFixtureAtLevel,
  buildRangerFixtureAtLevel,
  buildRulesCoverageFixturesL1To5,
  buildWarlockFixtureAtLevel,
  buildWizardFixtureAtLevel,
  RULES_COVERAGE_FOCUS_CLASS_KEYS,
  type PhbFixtureState,
  type RulesCoverageFocusClassKey,
} from "./support/phbGoldenFixtures";

const FIXTURES = buildRulesCoverageFixturesL1To5();
const MATRIX = buildCoverageMatrixV2(FIXTURES);

function fixture(classKey: RulesCoverageFocusClassKey, level: 1 | 2 | 3 | 4 | 5): PhbFixtureState {
  const found = FIXTURES.find((entry) => entry.classKey === classKey && entry.level === level)?.state;
  if (!found) {
    throw new Error(`Missing fixture for ${classKey} level ${level}.`);
  }
  return found;
}

function names(values: Array<{ name: string }>): string[] {
  return values.map((entry) => entry.name);
}

function hasName(values: string[], search: string): boolean {
  const token = search.toLowerCase();
  return values.some((entry) => entry.toLowerCase().includes(token));
}

describe("rules coverage L1-5 v2", () => {
  it("materializes golden fixtures for Paladin L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("paladin", level);
      expect(state.engine.classDef?.key).toBe("paladin");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("materializes golden fixtures for Ranger L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("ranger", level);
      expect(state.engine.classDef?.key).toBe("ranger");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("materializes golden fixtures for Barbarian L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("barbarian", level);
      expect(state.engine.classDef?.key).toBe("barbarian");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("materializes golden fixtures for Bard L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("bard", level);
      expect(state.engine.classDef?.key).toBe("bard");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("materializes golden fixtures for Monk L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("monk", level);
      expect(state.engine.classDef?.key).toBe("monk");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("materializes golden fixtures for Warlock L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("warlock", level);
      expect(state.engine.classDef?.key).toBe("warlock");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("materializes golden fixtures for Wizard L1-5", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const state = fixture("wizard", level);
      expect(state.engine.classDef?.key).toBe("wizard");
      expect(state.draft.classSelection.level).toBe(level);
      expect(state.hitDicePools[0]?.max).toBe(level);
    }
  });

  it("hardens class-specific L1-5 feature/resource/action regressions", () => {
    const paladinL3 = fixture("paladin", 3);
    const paladinL5 = fixture("paladin", 5);
    const paladinFeatureNames = names(paladinL3.engine.progression.unlockedClassFeatures);
    const paladinResourceNames = names(paladinL3.engine.actionResources.resourceSet.resources);
    const paladinActionNames = names([
      ...paladinL3.engine.actionResources.actionSet.actions,
      ...paladinL3.engine.actionResources.actionSet.bonusActions,
    ]);
    expect(hasName(paladinFeatureNames, "lay on hands")).toBe(true);
    expect(hasName(paladinFeatureNames, "divine sense")).toBe(true);
    expect(hasName(paladinFeatureNames, "channel divinity")).toBe(true);
    expect(hasName(paladinResourceNames, "paladin's smite")).toBe(true);
    expect(hasName(paladinActionNames, "divine sense")).toBe(true);
    expect(paladinL5.engine.actionResources.resourceSet.spellcasting.slotResources.some((entry) => entry.name === "Spell Slot L2" && (entry.usesMax ?? 0) >= 2)).toBe(true);

    const rangerL2 = fixture("ranger", 2);
    const rangerL5 = fixture("ranger", 5);
    expect(rangerL2.engine.ruleEngine.choiceSurface.choices.some((entry) => entry.label.includes("Fighting Style - Ranger") && entry.status === "complete")).toBe(true);
    expect(rangerL2.engine.ruleEngine.choiceSurface.choices.some((entry) => entry.label.includes("Weapon Mastery - Ranger") && entry.status === "complete")).toBe(true);
    expect(rangerL2.engine.selectedSpells.length).toBeGreaterThan(0);
    expect(rangerL5.engine.actionResources.resourceSet.spellcasting.slotResources.some((entry) => entry.name === "Spell Slot L2")).toBe(true);

    const barbarianL1 = fixture("barbarian", 1);
    const barbarianL5 = fixture("barbarian", 5);
    const barbarianInventory = buildInventoryViewModel(barbarianL1.draft, barbarianL1.engine);
    expect(barbarianInventory.armorClass.alternativeFormulaSource).toBe("Barbarian: Unarmored Defense");
    expect(barbarianL1.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Rage")).toBe(true);
    expect(hasName(names(barbarianL5.engine.progression.unlockedClassFeatures), "fast movement")).toBe(true);

    const bardL5 = fixture("bard", 5);
    expect(hasName(names(bardL5.engine.progression.unlockedClassFeatures), "font of inspiration")).toBe(true);
    expect(bardL5.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Bardic Inspiration" && entry.recharge.type === "short-rest")).toBe(true);

    const monkL5 = fixture("monk", 5);
    expect(hasName(names(monkL5.engine.progression.unlockedClassFeatures), "stunning strike")).toBe(true);
    expect(monkL5.engine.actionResources.actionSet.reactions.some((entry) => entry.name.includes("Deflect"))).toBe(true);
    expect(monkL5.engine.actionResources.resourceSet.resources.some((entry) => entry.name.includes("Monk's Focus"))).toBe(true);

    const warlockL5 = fixture("warlock", 5);
    expect(hasName(names(warlockL5.engine.progression.unlockedClassFeatures), "pact magic")).toBe(true);
    expect(warlockL5.engine.actionResources.resourceSet.spellcasting.slotResources.some((entry) => entry.name === "Spell Slot L3" && entry.usesMax === 2)).toBe(true);

    const wizardL5 = fixture("wizard", 5);
    expect(hasName(names(wizardL5.engine.progression.unlockedClassFeatures), "arcane recovery")).toBe(true);
    expect(hasName(names(wizardL5.engine.progression.unlockedClassFeatures), "ritual adept")).toBe(true);
    expect(wizardL5.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Arcane Recovery")).toBe(true);
    expect(wizardL5.engine.actionResources.resourceSet.spellcasting.slotResources.some((entry) => entry.name === "Spell Slot L3")).toBe(true);
  });

  it("checks level-4 ASI/Feat completion and level-5 progression for all focus classes", () => {
    for (const classKey of RULES_COVERAGE_FOCUS_CLASS_KEYS) {
      const level4 = fixture(classKey, 4);
      const level5 = fixture(classKey, 5);
      const asi = level4.engine.progression.asiOrFeatChoices.find((entry) => entry.level === 4);
      expect(asi, `${classKey} should expose an ASI/Feat at level 4`).toBeDefined();
      expect(asi?.satisfied, `${classKey} ASI/Feat should be complete in fixture`).toBe(true);
      expect(level5.hitDicePools[0]?.max).toBe(5);
      expect(level5.engine.progression.unlockedClassFeatures.length).toBeGreaterThan(0);
    }
  });

  it("keeps spellcasting slots and known/prepared contexts deterministic for spellcasting classes", () => {
    for (const classKey of ["paladin", "ranger", "bard", "warlock", "wizard"] as const) {
      const state = fixture(classKey, 5);
      const spellContexts = state.wizard.spellContexts;
      expect(spellContexts.length).toBeGreaterThan(0);
      expect(state.engine.actionResources.resourceSet.spellcasting.slotResources.length).toBeGreaterThan(0);
      const selectionContexts = spellContexts.filter((entry) => typeof entry.maxSelections === "number" && entry.maxSelections > 0);
      for (const context of selectionContexts) {
        expect(context.selectedSpellIds.length).toBe(context.maxSelections);
      }
    }
  });

  it("keeps martial class attack profiles/resources deterministic for level 5", () => {
    for (const classKey of ["paladin", "ranger", "barbarian", "monk"] as const) {
      const state = fixture(classKey, 5);
      expect(state.weaponProfiles.length).toBeGreaterThan(0);
      expect(state.weaponProfiles.some((profile) => profile.attackBonus > 0 && profile.proficiencyApplied)).toBe(true);
    }
    expect(fixture("barbarian", 5).engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Rage")).toBe(true);
    expect(fixture("paladin", 5).engine.actionResources.resourceSet.resources.some((entry) => entry.name.includes("Smite"))).toBe(true);
  });

  it("publishes a coverage matrix with automated/partial/manual/unsupported status buckets", () => {
    expect(MATRIX.entries).toHaveLength(35);
    const allClassLevelPairs = new Set(MATRIX.entries.map((entry) => `${entry.classKey}:${entry.level}`));
    expect(allClassLevelPairs.size).toBe(35);
    const automatedEntries = MATRIX.entries.filter((entry) => entry.automated.length > 0);
    const partialEntries = MATRIX.entries.filter((entry) => entry.partial.length > 0);
    const manualEntries = MATRIX.entries.filter((entry) => entry.manual.length > 0);
    const unsupportedEntries = MATRIX.entries.filter((entry) => entry.unsupported.length > 0);
    expect(automatedEntries.length).toBeGreaterThan(0);
    expect(partialEntries.length).toBeGreaterThan(0);
    expect(manualEntries.length).toBeGreaterThan(0);
    expect(unsupportedEntries.length).toBeGreaterThan(0);
  });

  it("keeps unsupported gaps visible and described", () => {
    expect(MATRIX.knownGaps.length).toBeGreaterThan(0);
    expect(MATRIX.knownGaps.every((entry) => entry.reason.trim().length > 0)).toBe(true);
    expect(MATRIX.knownGaps.some((entry) => /unsupported|not present|not auto/i.test(entry.reason))).toBe(true);
    expect(MATRIX.entries.some((entry) => entry.classKey === "warlock" && entry.unsupported.length > 0)).toBe(true);
  });
});

describe("rules coverage fixture builders", () => {
  it("builds direct helper fixtures for all focus classes at level 5", () => {
    expect(buildPaladinFixtureAtLevel(5).draft.classSelection.level).toBe(5);
    expect(buildRangerFixtureAtLevel(5).draft.classSelection.level).toBe(5);
    expect(buildBarbarianFixtureAtLevel(5).draft.classSelection.level).toBe(5);
    expect(buildBardFixtureAtLevel(5).draft.classSelection.level).toBe(5);
    expect(buildMonkFixtureAtLevel(5).draft.classSelection.level).toBe(5);
    expect(buildWarlockFixtureAtLevel(5).draft.classSelection.level).toBe(5);
    expect(buildWizardFixtureAtLevel(5).draft.classSelection.level).toBe(5);
  });
});
