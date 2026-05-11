import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { contentSnapshot } from "../services/data/content";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../services/mpmbCore";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";

function createDraftForMode(rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`engine-${rulesMode}`, `Engine ${rulesMode}`);
  draft.provider = "mpmb";
  draft.rulesMode = rulesMode;
  draft.classSelection.level = 1;
  return draft;
}

describe("character engine v2", () => {
  it("resolves applied/derived/progression/action from the mpmb core snapshot", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);

    for (const rulesMode of ["2014", "2024"] as const) {
      const snapshot = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode });
      const classes = resolveClasses(snapshot.classes, { provider: "mpmb", rulesMode });
      const species = resolveSpecies(snapshot.species, { provider: "mpmb", rulesMode });
      const backgrounds = resolveBackgrounds(snapshot.backgrounds, { provider: "mpmb", rulesMode });
      expect(classes.length).toBeGreaterThan(0);
      expect(species.length).toBeGreaterThan(0);
      expect(backgrounds.length).toBeGreaterThan(0);
      const classDef = classes.find((entry) => entry.key === "paladin") ?? classes[0];
      const speciesDef = species.find((entry) => /half-elf|human/i.test(`${entry.name} ${entry.key}`)) ?? species[0];
      const backgroundDef = backgrounds.find((entry) => /outlander|acolyte/i.test(`${entry.name} ${entry.key}`)) ?? backgrounds[0];

      const draft = createDraftForMode(rulesMode);
      draft.classSelection.classId = classDef.id;
      draft.speciesSelection.speciesId = speciesDef.id;
      draft.backgroundSelection.backgroundId = backgroundDef.id;

      const engine = resolveCharacterEngineState(snapshot, draft, { provider: "mpmb", rulesMode });
      expect(engine.appliedRules.classResult.class?.id).toBe(classDef.id);
      expect(engine.derivedStats.proficiencyBonus).toBe(2);
      expect(engine.progression.currentLevel).toBe(1);
      expect(engine.actionResources.provider).toBe("mpmb");
      expect(engine.actionResources.level).toBe(1);
      expect(engine.actionResources.actionSet.utilityActions.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("provides wizard state from the same engine context", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);
    const snapshot = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2024" });
    const classes = resolveClasses(snapshot.classes, { provider: "mpmb", rulesMode: "2024" });
    const species = resolveSpecies(snapshot.species, { provider: "mpmb", rulesMode: "2024" });
    const backgrounds = resolveBackgrounds(snapshot.backgrounds, { provider: "mpmb", rulesMode: "2024" });
    const draft = createDraftForMode("2024");
    draft.classSelection.classId = (classes.find((entry) => entry.key === "paladin") ?? classes[0]).id;
    draft.speciesSelection.speciesId = species[0].id;
    draft.backgroundSelection.backgroundId = backgrounds[0].id;

    const wizard = resolveCharacterWizardState(snapshot, draft, { provider: "mpmb", rulesMode: "2024" });
    expect(wizard.validations.class.completed).toBe(true);
    expect(wizard.validations.species.completed).toBe(true);
    expect(wizard.validations.background.completed).toBe(true);
    expect(wizard.requiredChoices.length).toBeGreaterThanOrEqual(0);
    expect(wizard.completion.complete).toBe(false);
  });
});
