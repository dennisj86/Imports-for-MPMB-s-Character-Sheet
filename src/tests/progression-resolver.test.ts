import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import {
  getAvailableSources,
  getBackgrounds,
  getCharacterProgression,
  getClasses,
  getSpecies,
  getSubclassesForClass,
  regenerateContentForSelectedSources,
} from "../services/data/adapter";

function includesText(value: string | undefined, search: string): boolean {
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

function buildDraft(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`progression-${provider}-${rulesMode}`, `Progression ${provider}/${rulesMode}`);
  draft.provider = provider;
  draft.rulesMode = rulesMode;
  draft.classSelection.level = 1;
  return draft;
}

function pickClass(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024", key: string) {
  return getClasses({ provider, rulesMode }).find((entry) => entry.key === key);
}

function attachBaselineSelections(draft: ReturnType<typeof buildDraft>) {
  const species = getSpecies({ provider: draft.provider, rulesMode: draft.rulesMode }).find((entry) =>
    includesText(`${entry.name} ${entry.key}`, "half-elf"),
  );
  const background =
    getBackgrounds({ provider: draft.provider, rulesMode: draft.rulesMode }).find((entry) =>
      includesText(`${entry.name} ${entry.key}`, "outlander"),
    ) ?? getBackgrounds({ provider: draft.provider, rulesMode: draft.rulesMode })[0];

  draft.speciesSelection.speciesId = species?.id;
  draft.backgroundSelection.backgroundId = background?.id;
}

describe("progression resolver", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("handles paladin level progression 1 -> 2 -> 3 for 2014 and 2024", () => {
    for (const rulesMode of ["2014", "2024"] as const) {
      const paladin = pickClass("mpmb", rulesMode, "paladin");
      expect(paladin, `missing mpmb paladin for ${rulesMode}`).toBeDefined();
      if (!paladin) {
        continue;
      }

      const draft = buildDraft("mpmb", rulesMode);
      draft.classSelection.classId = paladin.id;
      attachBaselineSelections(draft);

      draft.classSelection.level = 1;
      const level1 = getCharacterProgression(draft, { provider: "mpmb", rulesMode });
      if (rulesMode === "2014") {
        expect(level1.spellProgression.available).toBe(false);
      } else {
        expect(level1.spellProgression.available).toBe(true);
      }

      draft.classSelection.level = 2;
      const level2 = getCharacterProgression(draft, { provider: "mpmb", rulesMode });
      if (rulesMode === "2014") {
        expect(level2.spellProgression.available).toBe(true);
      } else {
        expect(level2.spellProgression.available).toBe(true);
      }

      draft.classSelection.level = 3;
      draft.subclassSelection.subclassId = undefined;
      const level3 = getCharacterProgression(draft, { provider: "mpmb", rulesMode });
      expect(level3.subclassRequirement?.required).toBe(true);
      expect(level3.subclassRequirement?.satisfied).toBe(false);
      expect(level3.pendingChoices.some((entry) => entry.kind === "subclass-selection")).toBe(true);

      const subclass = getSubclassesForClass(paladin.id, { provider: "mpmb", rulesMode, classLevel: 3 })[0];
      expect(subclass).toBeDefined();
      if (!subclass) {
        continue;
      }
      draft.subclassSelection.subclassId = subclass.id;
      const withSubclass = getCharacterProgression(draft, { provider: "mpmb", rulesMode });
      expect(withSubclass.subclassRequirement?.satisfied).toBe(true);
      expect(withSubclass.unlockedSubclassFeatures.length).toBeGreaterThan(0);
    }
  });

  it("computes full-caster spell progression growth and pending spell choices", () => {
    const wizard = pickClass("mpmb", "2014", "wizard");
    expect(wizard).toBeDefined();
    if (!wizard) {
      return;
    }
    const draft = buildDraft("mpmb", "2014");
    draft.classSelection.classId = wizard.id;
    attachBaselineSelections(draft);

    draft.classSelection.level = 1;
    const level1 = getCharacterProgression(draft, { provider: "mpmb", rulesMode: "2014" });
    expect(level1.spellProgression.available).toBe(true);
    expect(level1.spellProgression.cantripsKnown ?? 0).toBeGreaterThan(0);

    draft.classSelection.level = 4;
    const level4 = getCharacterProgression(draft, { provider: "mpmb", rulesMode: "2014" });
    expect(level4.spellProgression.cantripsKnown ?? 0).toBeGreaterThanOrEqual(level1.spellProgression.cantripsKnown ?? 0);
    expect(level4.pendingChoices.some((entry) => entry.kind === "spell-selection")).toBe(true);
  });

  it("materializes ASI/Feat opportunities and persists selected choices", () => {
    const fighter = pickClass("mpmb", "2014", "fighter");
    expect(fighter).toBeDefined();
    if (!fighter) {
      return;
    }
    const draft = buildDraft("mpmb", "2014");
    draft.classSelection.classId = fighter.id;
    draft.classSelection.level = 4;

    const before = getCharacterProgression(draft, { provider: "mpmb", rulesMode: "2014" });
    const asiChoice = before.asiOrFeatChoices.find((entry) => entry.level === 4);
    expect(asiChoice).toBeDefined();
    expect(asiChoice?.satisfied).toBe(false);
    if (!asiChoice) {
      return;
    }

    draft.featureChoices = [{ featureId: asiChoice.id, optionId: "feat" }];
    const after = getCharacterProgression(draft, { provider: "mpmb", rulesMode: "2014" });
    const resolvedChoice = after.asiOrFeatChoices.find((entry) => entry.id === asiChoice.id);
    expect(resolvedChoice?.satisfied).toBe(true);
    expect(after.pendingChoices.some((entry) => entry.id === asiChoice.id)).toBe(false);
  });

  it("keeps subclass unlock progression consistent between open5e and mpmb", () => {
    for (const provider of ["open5e", "mpmb"] as const) {
      const paladin = pickClass(provider, "2024", "paladin");
      expect(paladin, `${provider} should resolve paladin in 2024`).toBeDefined();
      if (!paladin) {
        continue;
      }
      const draft = buildDraft(provider, "2024");
      draft.classSelection.classId = paladin.id;
      draft.classSelection.level = 3;

      const progression = getCharacterProgression(draft, { provider, rulesMode: "2024" });
      expect(progression.subclassRequirement?.unlockLevel).toBe(3);
    }
  });

  it("handles half-elf + outlander + paladin baseline progression across provider/rulesMode matrix", () => {
    const matrix: Array<{ provider: "open5e" | "mpmb"; rulesMode: "2014" | "2024" }> = [
      { provider: "open5e", rulesMode: "2014" },
      { provider: "open5e", rulesMode: "2024" },
      { provider: "mpmb", rulesMode: "2014" },
      { provider: "mpmb", rulesMode: "2024" },
    ];

    for (const { provider, rulesMode } of matrix) {
      const paladin = pickClass(provider, rulesMode, "paladin");
      expect(paladin, `${provider}/${rulesMode}: missing paladin`).toBeDefined();
      if (!paladin) {
        continue;
      }
      const draft = buildDraft(provider, rulesMode);
      draft.classSelection.classId = paladin.id;
      attachBaselineSelections(draft);

      const progression = getCharacterProgression(draft, { provider, rulesMode });
      expect(progression.currentLevel).toBe(1);
      expect(progression.className).toBeDefined();
      if (rulesMode === "2014") {
        expect(progression.spellProgression.available).toBe(false);
      } else {
        expect(progression.spellProgression.available).toBe(true);
      }
    }
  });
});
