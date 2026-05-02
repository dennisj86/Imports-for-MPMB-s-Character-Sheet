import { beforeEach, describe, expect, it } from "vitest";
import { abilityModifier, getFeaturesForLevel } from "../domain/derived";
import { getAvailableSources, getClassById, getClasses, getFeaturesForClassLevel, getSubclassesForClass, regenerateContentForSelectedSources } from "../services/data/adapter";

describe("derived logic", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("calculates ability modifiers", () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(18)).toBe(4);
  });

  it("filters subclasses by class and collects level-gated features", () => {
    const classWithSubclass = getClasses().find((entry) => getSubclassesForClass(entry.id).length > 0);
    expect(classWithSubclass).toBeDefined();
    if (!classWithSubclass) {
      return;
    }

    const subclass = getSubclassesForClass(classWithSubclass.id)[0];
    const classDef = getClassById(classWithSubclass.id);
    expect(classDef).toBeDefined();
    const featuresFromDomain = getFeaturesForLevel(classDef, subclass, 3);
    const featuresFromAdapter = getFeaturesForClassLevel(classWithSubclass.id, subclass.id, 3);

    expect(featuresFromDomain.length).toBeGreaterThan(0);
    expect(featuresFromAdapter.length).toBeGreaterThan(0);
    expect(featuresFromAdapter.every((feature) => feature.minLevel <= 3)).toBe(true);
  });
});
