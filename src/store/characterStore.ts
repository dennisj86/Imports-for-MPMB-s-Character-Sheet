import { create } from "zustand";
import { createCharacterDraft } from "../domain/defaults";
import type { CharacterDraft } from "../domain/character";
import {
  deserializeCharacters,
  loadCharactersFromLocalStorage,
  saveCharactersToLocalStorage,
  serializeCharacters,
} from "../services/persistence/characterPersistence";

type CharacterStore = {
  characters: CharacterDraft[];
  createCharacter: (name?: string) => string;
  deleteCharacter: (id: string) => void;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
  replaceCharacters: (characters: CharacterDraft[]) => void;
  exportCharacters: () => string;
  importCharacters: (payload: string) => void;
};

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `character-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function persistCharacters(characters: CharacterDraft[]) {
  saveCharactersToLocalStorage(characters);
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: loadCharactersFromLocalStorage(),
  createCharacter: (name) => {
    const id = generateId();
    const draft = createCharacterDraft(id, name?.trim() || "New Character");
    set((state) => {
      const next = [...state.characters, draft];
      persistCharacters(next);
      return { characters: next };
    });
    return id;
  },
  deleteCharacter: (id) =>
    set((state) => {
      const next = state.characters.filter((entry) => entry.id !== id);
      persistCharacters(next);
      return { characters: next };
    }),
  updateCharacter: (id, updater) =>
    set((state) => {
      const next = state.characters.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        const updated = updater(entry);
        return {
          ...updated,
          updatedAt: new Date().toISOString(),
        };
      });
      persistCharacters(next);
      return { characters: next };
    }),
  replaceCharacters: (characters) => {
    persistCharacters(characters);
    set({ characters });
  },
  exportCharacters: (): string => serializeCharacters(get().characters),
  importCharacters: (payload) => {
    const parsed = deserializeCharacters(payload);
    persistCharacters(parsed);
    set({ characters: parsed });
  },
}));

export function getCharacterById(id: string): CharacterDraft | undefined {
  return useCharacterStore.getState().characters.find((entry) => entry.id === id);
}
