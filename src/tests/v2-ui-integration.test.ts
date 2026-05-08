import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "../domain/character";
import { createCharacterDraft } from "../domain/defaults";
import { buildSpellManagementState, applySpellSelectionToDraft, resolveSpellManagementViewState } from "../features/spellManagement";
import { buildWizardV2State, resolveWizardV2ViewState } from "../features/wizardV2";
import { resolveCharacterEngineViewState } from "../features/character/hooks";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";
import { deserializeCharacters } from "../services/persistence/characterPersistence";

function allActiveSourceKeys(): string[] {
  return contentSnapshot.sources.map((source) => source.key);
}

function includesText(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function pickBaselineDraft(rulesMode: "2014" | "2024"): CharacterDraft {
  const draft = createCharacterDraft(`v2-ui-${rulesMode}`, `V2 UI ${rulesMode}`);
  draft.provider = "mpmb";
  draft.rulesMode = rulesMode;
  draft.classSelection.level = 1;

  const context = { provider: "mpmb", rulesMode } as const;
  const classes = resolveClasses(contentSnapshot.classes, context);
  const species = resolveSpecies(contentSnapshot.species, context);
  const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, context);

  const classDef = classes.find((entry) => includesText(`${entry.name} ${entry.key}`, "paladin")) ?? classes[0];
  const speciesDef = species.find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf")) ?? species[0];
  const backgroundDef = backgrounds.find((entry) => includesText(`${entry.name} ${entry.key}`, "outlander")) ?? backgrounds[0];

  draft.classSelection.classId = classDef?.id;
  draft.speciesSelection.speciesId = speciesDef?.id;
  draft.backgroundSelection.backgroundId = backgroundDef?.id;
  return draft;
}

describe("v2 ui integration", () => {
  it("resolves wizard step/completion state from wizardV2Engine + character wizard state", () => {
    const draft = pickBaselineDraft("2024");
    const view = resolveWizardV2ViewState(draft, allActiveSourceKeys());
    expect(view).toBeDefined();
    if (!view) {
      return;
    }

    const directWizard = resolveCharacterWizardState(view.snapshot, draft, view.context);
    const directWizardUi = buildWizardV2State(view.snapshot, draft, view.context);
    const stepIds = new Set(view.wizardUi.steps.map((step) => step.id));

    expect(view.wizard.completion).toEqual(directWizard.completion);
    expect(view.wizardUi.validations).toEqual(directWizard.validations);
    expect(view.wizardUi.steps).toEqual(directWizardUi.steps);
    expect(view.wizardUi.complete).toBe(directWizard.completion.complete);
    expect(stepIds.has("class")).toBe(true);
    expect(stepIds.has("species")).toBe(true);
    expect(stepIds.has("background")).toBe(true);
    expect(stepIds.has("abilities")).toBe(true);
    expect(stepIds.has("skills")).toBe(true);
    expect(stepIds.has("equipment")).toBe(true);
    expect(stepIds.has("review")).toBe(true);
    if (view.wizardUi.featChoiceCount > 0) {
      expect(stepIds.has("feats")).toBe(true);
    }
    if (view.wizardUi.spellChoiceCount > 0) {
      expect(stepIds.has("spells")).toBe(true);
    }
  });

  it("resolves spell UI state from spellManagementService and applies scoped selections", () => {
    const draft = pickBaselineDraft("2024");
    const view = resolveSpellManagementViewState(draft, allActiveSourceKeys());
    expect(view).toBeDefined();
    if (!view) {
      return;
    }

    const directSpellState = buildSpellManagementState(view.snapshot, draft, view.context);
    expect(view.spellManagement).toEqual(directSpellState);

    const choice = view.spellManagement.spellChoices.find((entry) => entry.eligibleSpells.length > 0);
    expect(choice).toBeDefined();
    if (!choice) {
      return;
    }
    const spellId = choice.eligibleSpells[0]?.id;
    expect(spellId).toBeDefined();
    if (!spellId) {
      return;
    }

    const nextDraft = applySpellSelectionToDraft(draft, view.spellManagement, choice.id, spellId, true);
    const nextState = buildSpellManagementState(view.snapshot, nextDraft, view.context);
    const nextChoice = nextState.spellChoices.find((entry) => entry.id === choice.id);

    expect(nextDraft.spellSelection.selectedSpellIds).toContain(spellId);
    expect(nextChoice?.selectedSpellIds).toContain(spellId);
  });

  it("resolves sheet data from characterEngine output", () => {
    const draft = pickBaselineDraft("2014");
    const view = resolveCharacterEngineViewState(draft, allActiveSourceKeys());
    expect(view).toBeDefined();
    if (!view) {
      return;
    }

    const directEngine = resolveCharacterEngineState(view.snapshot, draft, view.context);
    expect(view.engine.appliedRules).toEqual(directEngine.appliedRules);
    expect(view.engine.derivedStats).toEqual(directEngine.derivedStats);
    expect(view.engine.progression).toEqual(directEngine.progression);
    expect(view.engine.actionResources).toEqual(directEngine.actionResources);
  });

  it("loads legacy v1 save payload and resolves through all v2 UI services", () => {
    const payload = JSON.stringify({
      version: 1,
      characters: [
        {
          id: "legacy-v1",
          version: 1,
          name: "Legacy V1",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          classSelection: { classId: undefined, level: 1 },
          subclassSelection: { subclassId: undefined },
          speciesSelection: { speciesId: undefined },
          backgroundSelection: { backgroundId: undefined },
          featIds: [],
          spellSelection: { selectedSpellIds: [] },
          featureChoices: [],
          inventory: { items: [] },
        },
      ],
    });

    const [loaded] = deserializeCharacters(payload);
    expect(loaded).toBeDefined();
    if (!loaded) {
      return;
    }
    expect(loaded.version).toBe(2);
    expect(loaded.provider).toBe("mpmb");
    expect(loaded.rulesMode).toBe("2024");

    expect(resolveWizardV2ViewState(loaded, allActiveSourceKeys())).toBeDefined();
    expect(resolveSpellManagementViewState(loaded, allActiveSourceKeys())).toBeDefined();
    expect(resolveCharacterEngineViewState(loaded, allActiveSourceKeys())).toBeDefined();
  });

  it("keeps builder/sheet pages on V2 hooks and off direct adapter usage", () => {
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");

    expect(builderSource).toContain("useWizardV2State");
    expect(builderSource).toContain("useSpellManagement");
    expect(builderSource).not.toContain("../services/data/adapter");
    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).not.toContain("../services/data/adapter");
  });
});
