import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";

describe("character draft model", () => {
  it("creates an MVP-ready default draft", () => {
    const draft = createCharacterDraft("character-1", "Test Character");
    expect(draft.id).toBe("character-1");
    expect(draft.version).toBe(1);
    expect(draft.name).toBe("Test Character");
    expect(draft.classSelection.level).toBe(1);
    expect(draft.featIds).toEqual([]);
    expect(draft.spellSelection.selectedSpellIds).toEqual([]);
    expect(draft.inventory.items).toEqual([]);
    expect(draft.abilityScores.str).toBe(10);
  });
});
