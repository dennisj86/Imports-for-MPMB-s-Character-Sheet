import { describe, expect, it } from "vitest";
import { PHB_GOLDEN_COVERAGE_MATRIX } from "./support/phbGoldenFixtures";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

describe("PHB coverage matrix v1", () => {
  it("covers the requested PHB classes, choice surfaces, apply paths, and modifier paths", () => {
    const classKeys = uniqueSorted(PHB_GOLDEN_COVERAGE_MATRIX.fixtures.map((entry) => entry.classKey));
    const choiceTypes = uniqueSorted(PHB_GOLDEN_COVERAGE_MATRIX.fixtures.flatMap((entry) => entry.choiceTypes));
    const applyPaths = uniqueSorted(PHB_GOLDEN_COVERAGE_MATRIX.fixtures.flatMap((entry) => entry.applyPaths));
    const modifierTypes = uniqueSorted(PHB_GOLDEN_COVERAGE_MATRIX.fixtures.flatMap((entry) => entry.modifierTypes));

    expect(classKeys).toEqual(["barbarian", "bard", "cleric", "fighter", "paladin", "ranger", "rogue", "wizard"]);
    expect(choiceTypes).toEqual(expect.arrayContaining([
      "background-ability-choice",
      "cantrip-selection",
      "class-skill-choice",
      "feat-subchoice",
      "feature-option",
      "fighting-style",
      "language-choice",
      "origin-feat-choice",
      "spell-selection",
      "weapon-mastery",
    ]));
    expect(applyPaths).toEqual(expect.arrayContaining([
      "ability-score-adjustments",
      "action-resources",
      "active-effects",
      "armor-proficiencies",
      "language-proficiencies",
      "skill-proficiencies",
      "spell-selection",
      "tool-proficiencies",
      "weapon-proficiencies",
    ]));
    expect(modifierTypes).toEqual(expect.arrayContaining([
      "ac-active-effect",
      "ac-flat",
      "roll-bonus-dice",
      "weapon-attack-flat",
      "weapon-attack-profile",
      "weapon-damage-flat",
    ]));
    expect(PHB_GOLDEN_COVERAGE_MATRIX.knownGaps).toEqual([]);
  });
});
