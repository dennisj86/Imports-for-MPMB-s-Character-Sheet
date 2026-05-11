import { z } from "zod";
import type { CharacterDraft } from "../../domain/character";
import { createDefaultCharacterPlayState, type CharacterHitDiceState, type HitDieSize } from "../../domain/playState";
import { normalizeInventoryState } from "../equipment";
import { normalizeLevelUpState } from "../levelUp";
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

function parseHitDieSize(value: unknown): HitDieSize | undefined {
  const numeric = typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : Number(value);
  return numeric === 6 || numeric === 8 || numeric === 10 || numeric === 12 ? numeric : undefined;
}

const hitDiceSchema = z.unknown().optional().transform((value): CharacterHitDiceState => {
  if (!value || typeof value !== "object") {
    return { pools: [] };
  }
  const pools = Array.isArray((value as { pools?: unknown }).pools)
    ? (value as { pools: unknown[] }).pools
    : [];
  const normalizedPools: CharacterHitDiceState["pools"] = pools
    .map((entry, index): CharacterHitDiceState["pools"][number] | undefined => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }
      const source = entry as Record<string, unknown>;
      const die = parseHitDieSize(source.die);
      if (!die) {
        return undefined;
      }
      return {
        id: typeof source.id === "string" && source.id ? source.id : `hit-dice:persisted-${index}:d${die}`,
        die,
        sourceClassId: typeof source.sourceClassId === "string" ? source.sourceClassId : undefined,
        sourceClassName: typeof source.sourceClassName === "string" ? source.sourceClassName : undefined,
        max: typeof source.max === "number" ? source.max : 0,
        remaining: typeof source.remaining === "number" ? source.remaining : 0,
        spent: typeof source.spent === "number" ? source.spent : 0,
        label: typeof source.label === "string" && source.label ? source.label : `Hit Dice d${die}`,
      };
    })
    .filter((entry): entry is CharacterHitDiceState["pools"][number] => Boolean(entry));
  return {
    pools: normalizedPools,
    updatedAt: typeof (value as { updatedAt?: unknown }).updatedAt === "string" ? (value as { updatedAt: string }).updatedAt : undefined,
  };
});

const ruleSourceTypeSchema = z.enum([
  "class-feature",
  "subclass-feature",
  "species-feature",
  "background-feature",
  "feat",
  "item",
  "spell",
  "condition",
  "custom",
]);

const ruleModifierSchema = z.object({
  id: z.string(),
  sourceDescriptorId: z.string(),
  sourceName: z.string(),
  sourceType: ruleSourceTypeSchema,
  target: z.enum([
    "armor-class",
    "initiative",
    "speed",
    "hit-point-max",
    "ability-score",
    "ability-check",
    "skill-check",
    "saving-throw",
    "weapon-attack",
    "weapon-damage",
    "spell-attack",
    "spell-save-dc",
    "resource-max",
    "passive-score",
    "proficiency",
    "other",
  ]),
  valueType: z.enum(["flat", "dice", "set", "advantage", "disadvantage", "note"]),
  value: z.union([z.number(), z.string(), z.boolean()]),
  damageType: z.string().optional(),
  ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]).optional(),
  skill: z
    .enum([
      "acrobatics",
      "animal-handling",
      "arcana",
      "athletics",
      "deception",
      "history",
      "insight",
      "intimidation",
      "investigation",
      "medicine",
      "nature",
      "perception",
      "performance",
      "persuasion",
      "religion",
      "sleight-of-hand",
      "stealth",
      "survival",
    ])
    .optional(),
  condition: z.enum([
    "always",
    "wearing-armor",
    "wearing-medium-or-heavy-armor",
    "not-wearing-armor",
    "shield-equipped",
    "weapon-equipped",
    "weapon-is-melee",
    "weapon-is-ranged",
    "weapon-is-finesse",
    "weapon-is-two-handed",
    "weapon-is-one-handed",
    "weapon-is-melee-one-handed-no-offhand",
    "no-offhand-weapon",
    "spellcasting",
    "concentration-active",
    "manual",
  ]),
  stackingKey: z.string().optional(),
  priority: z.number().optional(),
  diagnostics: z.array(z.string()).default([]),
});

const activeEffectSchema = z
  .object({
    id: z.string(),
    sourceDescriptorId: z.string(),
    label: z.string().optional(),
    sourceName: z.string(),
    sourceType: ruleSourceTypeSchema,
    startedAt: z.string(),
    effectType: z.enum(["roll-bonus", "ac-bonus", "advantage", "disadvantage", "note"]).optional(),
    durationType: z.enum(["concentration", "until-used", "until-rest", "timed", "manual", "one-roll"]),
    targets: z.array(z.enum(["self", "ally", "selected", "global", "unknown"])),
    applicableRollTypes: z.array(z.enum(["ability-check", "skill-check", "saving-throw", "attack-roll", "spell-attack", "damage-roll", "death-save", "custom"])),
    modifiers: z.array(ruleModifierSchema),
    requiresPrompt: z.boolean(),
    remainingUses: z.number().int().nonnegative().optional(),
    modifierSummary: z.object({
      dice: z.string().optional(),
      flat: z.number().optional(),
    }).optional(),
    configurableFields: z.array(z.enum(["die-size"])).optional(),
    concentrationLinked: z.boolean(),
    status: z.enum(["active", "expired", "dismissed"]),
    sourceCasterName: z.string().optional(),
    note: z.string().optional(),
    diagnostics: z.array(z.string()).default([]),
  })
  .transform((effect) => {
    const modifierSummary = effect.modifierSummary ?? effect.modifiers.reduce<{ dice?: string; flat?: number }>((summary, modifier) => {
      if (!summary.dice && modifier.valueType === "dice" && typeof modifier.value === "string") {
        summary.dice = modifier.value.replace(/\s+/g, "");
      }
      if (summary.flat === undefined && modifier.valueType === "flat" && typeof modifier.value === "number") {
        summary.flat = Number(modifier.value);
      }
      return summary;
    }, {});
    const effectType =
      effect.effectType ??
      (effect.modifiers.some((modifier) => modifier.target === "armor-class" && modifier.valueType === "flat")
        ? "ac-bonus"
        : effect.modifiers.some((modifier) => modifier.valueType === "advantage")
          ? "advantage"
          : effect.modifiers.some((modifier) => modifier.valueType === "disadvantage")
            ? "disadvantage"
            : effect.modifiers.some((modifier) => modifier.valueType === "dice" || modifier.valueType === "flat")
              ? "roll-bonus"
              : "note");
    return {
      ...effect,
      label: effect.label ?? effect.sourceName ?? effect.id,
      effectType,
      modifierSummary: modifierSummary.dice !== undefined || modifierSummary.flat !== undefined ? modifierSummary : undefined,
    };
  });

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
  hitDice: hitDiceSchema,
  activeConditions: z.array(activeConditionSchema),
  activeEffects: z.array(activeEffectSchema).optional().default([]),
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
        "active-effect-start",
        "active-effect-dismiss",
        "resource-spend-blocked",
        "hit-die-spent",
        "hit-die-spend-blocked",
        "hit-dice-recovered",
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

const equipmentSlotSchema = z.enum(["armor", "shield", "mainHand", "offHand", "twoHanded", "ranged", "focus", "other"]);

const inventoryItemSchema = z.object({
  instanceId: z.string().optional(),
  id: z.string(),
  itemDefinitionId: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().min(1),
  equipped: z.boolean().optional(),
  equipmentSlot: equipmentSlotSchema.optional(),
  category: z.string().optional(),
  type: z.string().optional(),
});

const levelUpStateSchema = z.object({
  hpGainByLevel: z.record(
    z.object({
      level: z.number().int().min(1).max(20),
      method: z.enum(["fixed/default", "manual", "rolled", "max"]),
      value: z.number().int().min(1).optional(),
    }),
  ).optional(),
  abilityScoreIncreases: z.record(
    z.object({
      choiceId: z.string(),
      level: z.number().int().min(1).max(20),
      source: z.enum(["class", "subclass", "feat", "species", "background", "rule"]).default("class"),
      mode: z.enum(["+2", "+1/+1"]),
      increases: z.record(z.number().int().min(1).max(2)),
      status: z.enum(["pending", "complete", "unsupported", "needs-builder"]),
      updatedAt: z.string().optional(),
    }),
  ).optional(),
  featChoices: z.record(
    z.object({
      choiceId: z.string(),
      contextId: z.string(),
      level: z.number().int().min(1).max(20),
      source: z.enum(["class", "subclass", "feat", "species", "background", "rule"]).default("class"),
      featId: z.string().optional(),
      status: z.enum(["pending", "complete", "unsupported", "needs-builder"]),
      updatedAt: z.string().optional(),
    }),
  ).optional(),
  weaponMasteryChoices: z.record(
    z.object({
      choiceId: z.string(),
      level: z.number().int().min(1).max(20),
      source: z.enum(["class", "subclass", "feat", "species", "background", "rule"]).default("class"),
      weaponId: z.string().optional(),
      masteryId: z.string().optional(),
      status: z.enum(["pending", "complete", "unsupported", "needs-builder"]),
      updatedAt: z.string().optional(),
    }),
  ).optional(),
  fightingStyleChoices: z.record(
    z.object({
      choiceId: z.string(),
      level: z.number().int().min(1).max(20),
      source: z.enum(["class", "subclass", "feat", "species", "background", "rule"]).default("class"),
      styleId: z.string().optional(),
      status: z.enum(["pending", "complete", "unsupported", "needs-builder"]),
      updatedAt: z.string().optional(),
    }),
  ).optional(),
}).optional();

const ruleChoiceStateSchema = z.record(
  z.object({
    choiceId: z.string(),
    selectedOptionIds: z.array(z.string()),
    status: z.enum(["pending", "complete", "unsupported", "needs-builder"]),
    updatedAt: z.string().optional(),
  }),
).optional();

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
    items: z.array(inventoryItemSchema),
  }),
  levelUp: levelUpStateSchema,
  ruleChoices: ruleChoiceStateSchema,
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
    items: z.array(inventoryItemSchema),
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
    inventory: normalizeInventoryState(value.inventory),
    levelUp: normalizeLevelUpState(undefined),
    ruleChoices: {},
    playState: fallbackPlayState,
  };
}

function ensurePersistedPlayState(entry: CharacterDraftV2Persisted | CharacterDraft): CharacterDraft {
  return {
    ...entry,
    inventory: normalizeInventoryState(entry.inventory),
    levelUp: normalizeLevelUpState(entry.levelUp),
    ruleChoices: entry.ruleChoices ?? {},
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
