import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";

describe("character persistence", () => {
  it("serializes and deserializes versioned character payload", () => {
    const character = createCharacterDraft("character-1", "Persisted");
    character.classSelection.level = 3;
    character.featIds = ["feat:test"];
    character.xp = {
      currentXp: 900,
      levelSource: "xp",
      milestoneMode: false,
    };
    const payload = serializeCharacters([character]);
    const loaded = deserializeCharacters(payload);
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe(character.id);
    expect(loaded[0].classSelection.level).toBe(3);
    expect(loaded[0].featIds).toEqual(["feat:test"]);
    expect(loaded[0].version).toBe(2);
    expect(loaded[0].provider).toBe("mpmb");
    expect(loaded[0].rulesMode).toBe("2024");
    expect(loaded[0].xp?.currentXp).toBe(900);
    expect(loaded[0].playState.schemaVersion).toBe(1);
    expect(loaded[0].playState.characterId).toBe("character-1");
  });

  it("migrates legacy v1 payloads to v2 model", () => {
    const payload = JSON.stringify({
      version: 1,
      characters: [
        {
          id: "legacy-1",
          version: 1,
          name: "Legacy",
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
    const loaded = deserializeCharacters(payload);
    expect(loaded.length).toBe(1);
    expect(loaded[0].version).toBe(2);
    expect(loaded[0].provider).toBe("mpmb");
    expect(loaded[0].rulesMode).toBe("2024");
    expect(loaded[0].playState.schemaVersion).toBe(1);
    expect(loaded[0].playState.characterId).toBe("legacy-1");
  });
});
