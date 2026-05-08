import { z } from "zod";
import type { CharacterDraft } from "../../domain/character";
import { createDefaultCharacterPlayState } from "../../domain/playState";
import { ensureCharacterPlayState } from "../playState";

const abilityScoresSchema = z.object({
  str: z.number(),
  dex: z.number(),
  con: z.number(),
  int: z.number(),
  wis: z.number(),
  cha: z.number(),
});

const activeConditionSchema = z.union([
  z.string().transform((name) => ({
    id: `condition:custom:${name}`,
    name,
    source: "manual",
    addedAt: new Date(0).toISOString(),
  })),
  z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      label: z.string().optional(),
      source: z.string().optional(),
      category: z.string().optional(),
      clearableOnRest: z.enum(["short-rest", "long-rest"]).optional(),
      notes: z.string().optional(),
      addedAt: z.string().optional(),
    })
    .passthrough()
    .transform((condition) => {
      const name = condition.name ?? condition.label ?? condition.id ?? "Condition";
      return {
        id: condition.id ?? name,
        name,
        source: condition.source,
        category: condition.category,
        clearableOnRest: condition.clearableOnRest,
        notes: condition.notes,
        addedAt: condition.addedAt ?? new Date(0).toISOString(),
      };
    }),
]);

const playStateSchema = z.object({
  schemaVersion: z.literal(1),
  characterId: z.string(),
  currentHp: z.number().int().nonnegative(),
  tempHp: z.number().int().nonnegative(),
  deathSaves: z.object({
    successes: z.number().int().min(0).max(3),
    failures: z.number().int().min(0).max(3),
    stable: z.boolean(),
    dead: z.boolean(),
  }),
  spentResources: z.record(z.number().int().nonnegative()),
  spellSlots: z.record(z.number().int().nonnegative()),
  activeConditions: z.array(activeConditionSchema),
  concentration: z
    .object({
      sourceId: z.string().optional(),
      name: z.string(),
      startedAt: z.string(),
      notes: z.string().optional(),
    })
    .nullable(),
  playEvents: z.array(
    z.object({
      id: z.string(),
      timestamp: z.string(),
      type: z.enum([
        "hp-damage",
        "hp-healing",
        "hp-set",
        "temp-hp-set",
        "temp-hp-replace",
        "death-save",
        "resource-spend",
        "resource-restore",
        "spell-slot-spend",
        "spell-slot-restore",
        "spell-cast",
        "spell-cast-blocked",
        "roll",
        "condition-toggle",
        "concentration-start",
        "concentration-replace",
        "concentration-end",
        "resource-spend-blocked",
        "rest-short",
        "rest-long",
      ]),
      shortLabel: z.string(),
      payload: z.record(z.unknown()),
    }),
  ),
  lastRestAt: z.string().optional(),
  updatedAt: z.string(),
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
  playState: playStateSchema.optional(),
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
type CharacterDraftV2Persisted = z.infer<typeof characterDraftV2Schema>;

export const CHARACTER_STORAGE_KEY = "mpmb-character-builder:v2";
const LEGACY_STORAGE_KEYS = ["mpmb-character-builder:v1"];

function migrateV1ToV2(value: CharacterDraftV1): CharacterDraft {
  const fallbackPlayState = createDefaultCharacterPlayState(value.id, {
    maxHp: 1,
    now: value.updatedAt,
  });
  return {
    ...value,
    version: 2,
    provider: "mpmb",
    rulesMode: "2024",
    playState: fallbackPlayState,
  };
}

function ensurePersistedPlayState(entry: CharacterDraftV2Persisted | CharacterDraft): CharacterDraft {
  return {
    ...entry,
    playState: ensureCharacterPlayState(entry.playState, entry.id, {
      maxHp: 1,
      now: entry.updatedAt,
    }),
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
    return asV2.data.characters.map((entry) => ensurePersistedPlayState(entry));
  }
  const asV1 = persistedV1Schema.parse(parsed);
  return asV1.characters.map((entry) => ensurePersistedPlayState(migrateV1ToV2(entry)));
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
