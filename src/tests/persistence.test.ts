import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";

describe("character persistence", () => {
  it("serializes and deserializes versioned character payload", () => {
    const character = createCharacterDraft("character-1", "Persisted");
    character.classSelection.level = 3;
    character.featIds = ["feat:test"];
    const payload = serializeCharacters([character]);
    const loaded = deserializeCharacters(payload);
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe(character.id);
    expect(loaded[0].classSelection.level).toBe(3);
    expect(loaded[0].featIds).toEqual(["feat:test"]);
  });
});
