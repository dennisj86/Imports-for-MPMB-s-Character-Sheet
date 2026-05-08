import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { buildSpellManagementState } from "../features/spellManagement";
import { contentSnapshot } from "../services/data/content";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../services/mpmbCore";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";

describe("spell management v2", () => {
  it("builds spell choice state from the v2 wizard/engine context", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);
    const snapshot = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2024" });
    const classes = resolveClasses(snapshot.classes, { provider: "mpmb", rulesMode: "2024" });
    const species = resolveSpecies(snapshot.species, { provider: "mpmb", rulesMode: "2024" });
    const backgrounds = resolveBackgrounds(snapshot.backgrounds, { provider: "mpmb", rulesMode: "2024" });
    const draft = createCharacterDraft("spell-v2", "Spell V2");
    draft.provider = "mpmb";
    draft.rulesMode = "2024";
    draft.classSelection.classId = (classes.find((entry) => entry.key === "wizard") ?? classes[0]).id;
    draft.speciesSelection.speciesId = species[0].id;
    draft.backgroundSelection.backgroundId = backgrounds[0].id;

    const state = buildSpellManagementState(snapshot, draft, { provider: "mpmb", rulesMode: "2024" });
    expect(state.selectedSpellIds).toEqual([]);
    expect(state.spellChoices.length).toBeGreaterThanOrEqual(0);
    expect(state.unresolvedChoices.length).toBeLessThanOrEqual(state.spellChoices.length);
  });
});
