import { z } from "zod";
import type { CharacterDraft } from "../../domain/character";

const abilityScoresSchema = z.object({
  str: z.number(),
  dex: z.number(),
  con: z.number(),
  int: z.number(),
  wis: z.number(),
  cha: z.number(),
});

const characterDraftSchema = z.object({
  id: z.string(),
  version: z.literal(1),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  abilityScores: abilityScoresSchema,
  classSelection: z.object({
    classId: z.string().optional(),
    level: z.number().int().min(1).max(20),
  }),
  subclassSelection: z.object({
    subclassId: z.string().optional(),
  }),
  speciesSelection: z.object({
    speciesId: z.string().optional(),
  }),
  backgroundSelection: z.object({
    backgroundId: z.string().optional(),
  }),
  featIds: z.array(z.string()),
  spellSelection: z.object({
    selectedSpellIds: z.array(z.string()),
  }),
  featureChoices: z.array(
    z.object({
      featureId: z.string(),
      optionId: z.string(),
    }),
  ),
  inventory: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        quantity: z.number().int().min(1),
        equipped: z.boolean().optional(),
      }),
    ),
  }),
});

const persistedSchema = z.object({
  version: z.literal(1),
  characters: z.array(characterDraftSchema),
});

export const CHARACTER_STORAGE_KEY = "mpmb-character-builder:v1";

export function serializeCharacters(characters: CharacterDraft[]): string {
  return JSON.stringify(
    {
      version: 1,
      characters,
    },
    null,
    2,
  );
}

export function deserializeCharacters(payload: string): CharacterDraft[] {
  const parsed = JSON.parse(payload);
  const validated = persistedSchema.parse(parsed);
  return validated.characters;
}

export function loadCharactersFromLocalStorage(storageKey = CHARACTER_STORAGE_KEY): CharacterDraft[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }
  try {
    return deserializeCharacters(raw);
  } catch {
    return [];
  }
}

export function saveCharactersToLocalStorage(characters: CharacterDraft[], storageKey = CHARACTER_STORAGE_KEY): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload = serializeCharacters(characters);
  window.localStorage.setItem(storageKey, payload);
}
