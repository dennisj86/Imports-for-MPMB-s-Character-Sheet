import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { buildWizardV2State } from "../features/wizardV2";
import { contentSnapshot } from "../services/data/content";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../services/mpmbCore";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";

describe("wizard v2 engine", () => {
  it("builds a step state from the mpmb 2024 core snapshot", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);
    const snapshot = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2024" });
    const classes = resolveClasses(snapshot.classes, { provider: "mpmb", rulesMode: "2024" });
    const species = resolveSpecies(snapshot.species, { provider: "mpmb", rulesMode: "2024" });
    const backgrounds = resolveBackgrounds(snapshot.backgrounds, { provider: "mpmb", rulesMode: "2024" });
    const draft = createCharacterDraft("wizard-v2", "Wizard V2");
    draft.provider = "mpmb";
    draft.rulesMode = "2024";
    draft.classSelection.classId = (classes.find((entry) => entry.key === "paladin") ?? classes[0]).id;
    draft.speciesSelection.speciesId = species[0].id;
    draft.backgroundSelection.backgroundId = backgrounds[0].id;

    const state = buildWizardV2State(snapshot, draft, { provider: "mpmb", rulesMode: "2024" });
    expect(state.steps.length).toBeGreaterThan(0);
    expect(state.steps.some((step) => step.id === "class")).toBe(true);
    expect(state.activeStepId).toBeDefined();
    expect(state.validations.class.completed).toBe(true);
  });
});
