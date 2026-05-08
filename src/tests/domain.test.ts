import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";

describe("character draft model", () => {
  it("creates an MVP-ready default draft", () => {
    const draft = createCharacterDraft("character-1", "Test Character");
    expect(draft.id).toBe("character-1");
    expect(draft.version).toBe(2);
    expect(draft.name).toBe("Test Character");
    expect(draft.provider).toBe("mpmb");
    expect(draft.rulesMode).toBe("2024");
    expect(draft.classSelection.level).toBe(1);
    expect(draft.featIds).toEqual([]);
    expect(draft.spellSelection.selectedSpellIds).toEqual([]);
    expect(draft.inventory.items).toEqual([]);
    expect(draft.abilityScores.str).toBe(10);
    expect(draft.playState.schemaVersion).toBe(1);
    expect(draft.playState.characterId).toBe("character-1");
    expect(draft.playState.currentHp).toBeGreaterThan(0);
  });
});
