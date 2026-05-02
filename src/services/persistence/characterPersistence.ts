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

const characterDraftV2Schema = z.object({
  id: z.string(),
  version: z.literal(2),
  name: z.string(),
  provider: z.enum(["open5e", "mpmb"]),
  rulesMode: z.enum(["2014", "2024"]),
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

const characterDraftV1Schema = z.object({
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

const persistedV2Schema = z.object({
  version: z.literal(2),
  characters: z.array(characterDraftV2Schema),
});

const persistedV1Schema = z.object({
  version: z.literal(1),
  characters: z.array(characterDraftV1Schema),
});

type CharacterDraftV1 = z.infer<typeof characterDraftV1Schema>;

export const CHARACTER_STORAGE_KEY = "mpmb-character-builder:v2";
const LEGACY_STORAGE_KEYS = ["mpmb-character-builder:v1"];

function migrateV1ToV2(value: CharacterDraftV1): CharacterDraft {
  return {
    ...value,
    version: 2,
    provider: "mpmb",
    rulesMode: "2024",
  };
}

export function serializeCharacters(characters: CharacterDraft[]): string {
  return JSON.stringify(
    {
      version: 2,
      characters,
    },
    null,
    2,
  );
}

export function deserializeCharacters(payload: string): CharacterDraft[] {
  const parsed = JSON.parse(payload);
  const asV2 = persistedV2Schema.safeParse(parsed);
  if (asV2.success) {
    return asV2.data.characters;
  }
  const asV1 = persistedV1Schema.parse(parsed);
  return asV1.characters.map((entry) => migrateV1ToV2(entry));
}

export function loadCharactersFromLocalStorage(storageKey = CHARACTER_STORAGE_KEY): CharacterDraft[] {
  if (typeof window === "undefined") {
    return [];
  }
  const keysToTry = [storageKey, ...LEGACY_STORAGE_KEYS];
  for (const key of keysToTry) {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const parsed = deserializeCharacters(raw);
      if (parsed.length > 0 || key === storageKey) {
        if (key !== storageKey) {
          saveCharactersToLocalStorage(parsed, storageKey);
        }
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export function saveCharactersToLocalStorage(characters: CharacterDraft[], storageKey = CHARACTER_STORAGE_KEY): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload = serializeCharacters(characters);
  window.localStorage.setItem(storageKey, payload);
}
