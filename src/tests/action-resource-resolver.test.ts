import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import {
  getAvailableSources,
  getCharacterActionResources,
  getClasses,
  getSpells,
  regenerateContentForSelectedSources,
} from "../services/data/adapter";

function buildDraft(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`actions-${provider}-${rulesMode}`, `Actions ${provider}/${rulesMode}`);
  draft.provider = provider;
  draft.rulesMode = rulesMode;
  return draft;
}

function pickClass(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024", key: string) {
  return getClasses({ provider, rulesMode }).find((entry) => entry.key === key);
}

function includesText(value: string | undefined, search: string): boolean {
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

describe("action/resource resolver", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("derives paladin actions/resources at levels 1/2/3 in 2014 and 2024", () => {
    for (const rulesMode of ["2014", "2024"] as const) {
      const paladin = pickClass("mpmb", rulesMode, "paladin");
      expect(paladin).toBeDefined();
      if (!paladin) {
        continue;
      }
      const draft = buildDraft("mpmb", rulesMode);
      draft.classSelection.classId = paladin.id;

      draft.classSelection.level = 1;
      const level1 = getCharacterActionResources(draft, { provider: "mpmb", rulesMode });
      expect(level1.actionSet.actions.concat(level1.actionSet.bonusActions, level1.actionSet.utilityActions).some((entry) => includesText(entry.name, "lay on hands"))).toBe(true);

      draft.classSelection.level = 2;
      const level2 = getCharacterActionResources(draft, { provider: "mpmb", rulesMode });
      if (rulesMode === "2014") {
        expect(level2.resourceSet.resources.some((entry) => entry.id === "resource:spell-slot:1" && (entry.usesMax ?? 0) > 0)).toBe(true);
      } else {
        expect(level2.resourceSet.spellcasting.available).toBe(true);
      }

      draft.classSelection.level = 3;
      const level3 = getCharacterActionResources(draft, { provider: "mpmb", rulesMode });
      expect(level3.resourceSet.resources.some((entry) => includesText(entry.name, "channel divinity"))).toBe(true);
    }
  });

  it("maps limited-use fighter features into resources and actions", () => {
    const fighter = pickClass("mpmb", "2014", "fighter");
    expect(fighter).toBeDefined();
    if (!fighter) {
      return;
    }
    const draft = buildDraft("mpmb", "2014");
    draft.classSelection.classId = fighter.id;
    draft.classSelection.level = 2;

    const resolved = getCharacterActionResources(draft, { provider: "mpmb", rulesMode: "2014" });
    const secondWindResource = resolved.resourceSet.resources.find((entry) => includesText(entry.name, "second wind"));
    expect(secondWindResource).toBeDefined();
    expect(secondWindResource?.usesMax).toBeGreaterThanOrEqual(1);
    expect(secondWindResource?.recharge.type).toBe("short-rest");

    const secondWindAction = resolved.actionSet.bonusActions.find((entry) => includesText(entry.name, "second wind"));
    expect(secondWindAction).toBeDefined();
  });

  it("materializes spell actions and spell-slot resources", () => {
    const wizard = pickClass("mpmb", "2014", "wizard");
    expect(wizard).toBeDefined();
    if (!wizard) {
      return;
    }
    const draft = buildDraft("mpmb", "2014");
    draft.classSelection.classId = wizard.id;
    draft.classSelection.level = 3;

    const wizardSpells = getSpells({ classKey: "wizard" }, { provider: "mpmb", rulesMode: "2014" });
    const cantrip = wizardSpells.find((entry) => entry.level === 0);
    const level1Spell = wizardSpells.find((entry) => entry.level === 1);
    expect(cantrip).toBeDefined();
    expect(level1Spell).toBeDefined();
    if (!cantrip || !level1Spell) {
      return;
    }
    draft.spellSelection.selectedSpellIds = [cantrip.id, level1Spell.id];

    const resolved = getCharacterActionResources(draft, { provider: "mpmb", rulesMode: "2014" });
    const cantripAction = resolved.resourceSet.spellcasting.cantripActions.find((entry) => entry.sourceId === cantrip.id);
    const leveledAction = resolved.resourceSet.spellcasting.spellActions.find((entry) => entry.sourceId === level1Spell.id);

    expect(cantripAction).toBeDefined();
    expect(cantripAction?.requiresResourceIds.length).toBe(0);
    expect(leveledAction).toBeDefined();
    expect((leveledAction?.requiresResourceIds.length ?? 0) > 0).toBe(true);
    expect(resolved.resourceSet.spellcasting.slotResources.length).toBeGreaterThan(0);
  });

  it("stays provider-compatible for comparable builds", () => {
    for (const provider of ["open5e", "mpmb"] as const) {
      const paladin = pickClass(provider, "2014", "paladin");
      expect(paladin).toBeDefined();
      if (!paladin) {
        continue;
      }
      const draft = buildDraft(provider, "2014");
      draft.classSelection.classId = paladin.id;
      draft.classSelection.level = 1;

      const resolved = getCharacterActionResources(draft, { provider, rulesMode: "2014" });
      expect(
        resolved.actionSet.actions
          .concat(resolved.actionSet.bonusActions, resolved.actionSet.utilityActions)
          .some((entry) => includesText(entry.name, "lay on hands")),
      ).toBe(true);
      expect(resolved.dataStatus === "complete" || resolved.dataStatus === "partial" || resolved.dataStatus === "pending").toBe(true);
    }
  });
});
