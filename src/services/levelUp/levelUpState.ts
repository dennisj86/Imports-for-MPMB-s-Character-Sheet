import type {
  AbilityScoreIncreaseChoiceState,
  AbilityScores,
  CharacterDraft,
  FeatureChoice,
  FeatChoiceState,
  HpGainMethod,
  LevelUpState,
} from "../../domain/character";

export const ABILITY_KEYS: Array<keyof AbilityScores> = ["str", "dex", "con", "int", "wis", "cha"];
export const HP_GAIN_METHODS: HpGainMethod[] = ["fixed/default", "manual", "rolled", "max"];

export function hpGainKey(level: number): string {
  return `level-${Math.max(1, Math.min(20, Math.floor(level)))}`;
}

export function featChoiceContextId(choiceId: string): string {
  return `feat-choice:asi:${choiceId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function upsertFeatureChoice(existing: FeatureChoice[], featureId: string, optionId: string | undefined): FeatureChoice[] {
  const without = existing.filter((entry) => entry.featureId !== featureId);
  if (!optionId) {
    return without;
  }
  return [...without, { featureId, optionId }];
}

function contextualFeatIds(featureChoices: FeatureChoice[]): Set<string> {
  const output = new Set<string>();
  for (const choice of featureChoices) {
    if (choice.featureId !== "feat-choice:origin" && !choice.featureId.startsWith("feat-choice:asi:")) {
      continue;
    }
    if (choice.optionId) {
      output.add(choice.optionId);
    }
  }
  return output;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(20, Math.floor(level)));
}

function normalizeAbilityIncreases(increases: Partial<Record<keyof AbilityScores, number>>): Partial<Record<keyof AbilityScores, number>> {
  const normalized: Partial<Record<keyof AbilityScores, number>> = {};
  for (const ability of ABILITY_KEYS) {
    const value = Math.floor(increases[ability] ?? 0);
    if (value > 0) {
      normalized[ability] = value;
    }
  }
  return normalized;
}

export function isValidAbilityScoreIncrease(
  increases: Partial<Record<keyof AbilityScores, number>>,
  baseScores?: AbilityScores,
): boolean {
  const normalized = normalizeAbilityIncreases(increases);
  const entries = Object.entries(normalized) as Array<[keyof AbilityScores, number]>;
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const isSupportedDistribution =
    total === 2 &&
    (
      (entries.length === 1 && entries[0]?.[1] === 2) ||
      (entries.length === 2 && entries.every(([, value]) => value === 1))
    );
  if (!isSupportedDistribution) {
    return false;
  }
  if (!baseScores) {
    return true;
  }
  return entries.every(([ability, value]) => baseScores[ability] + value <= 20);
}

export function normalizeLevelUpState(levelUp: LevelUpState | undefined): LevelUpState {
  const hpGainByLevel: NonNullable<LevelUpState["hpGainByLevel"]> = {};
  for (const [key, state] of Object.entries(levelUp?.hpGainByLevel ?? {})) {
    const level = clampLevel(state.level);
    hpGainByLevel[key] = {
      level,
      method: HP_GAIN_METHODS.includes(state.method) ? state.method : "fixed/default",
      value: state.value === undefined ? undefined : Math.max(1, Math.floor(state.value)),
    };
  }

  const abilityScoreIncreases: NonNullable<LevelUpState["abilityScoreIncreases"]> = {};
  for (const [key, state] of Object.entries(levelUp?.abilityScoreIncreases ?? {})) {
    const increases = normalizeAbilityIncreases(state.increases ?? {});
    abilityScoreIncreases[key] = {
      choiceId: state.choiceId || key,
      level: clampLevel(state.level),
      source: state.source ?? "class",
      mode: state.mode === "+1/+1" ? "+1/+1" : "+2",
      increases,
      status: isValidAbilityScoreIncrease(increases) ? "complete" : "pending",
      updatedAt: state.updatedAt,
    };
  }

  const featChoices: NonNullable<LevelUpState["featChoices"]> = {};
  for (const [key, state] of Object.entries(levelUp?.featChoices ?? {})) {
    featChoices[key] = {
      choiceId: state.choiceId || key,
      contextId: state.contextId || featChoiceContextId(state.choiceId || key),
      level: clampLevel(state.level),
      source: state.source ?? "class",
      featId: state.featId,
      status: state.featId ? "complete" : "pending",
      updatedAt: state.updatedAt,
    };
  }

  return {
    hpGainByLevel,
    abilityScoreIncreases,
    featChoices,
    weaponMasteryChoices: levelUp?.weaponMasteryChoices ?? {},
    fightingStyleChoices: levelUp?.fightingStyleChoices ?? {},
  };
}

export function setHpGainMethod(
  draft: CharacterDraft,
  level: number,
  method: HpGainMethod,
  value?: number,
): CharacterDraft {
  const safeLevel = clampLevel(level);
  const key = hpGainKey(safeLevel);
  const normalized = normalizeLevelUpState(draft.levelUp);
  return {
    ...draft,
    levelUp: {
      ...normalized,
      hpGainByLevel: {
        ...(normalized.hpGainByLevel ?? {}),
        [key]: {
          level: safeLevel,
          method,
          value: value === undefined ? undefined : Math.max(1, Math.floor(value)),
        },
      },
    },
  };
}

export function setAsiOrFeatOption(
  draft: CharacterDraft,
  choiceId: string,
  optionId: "ability-score-improvement" | "feat" | undefined,
): CharacterDraft {
  return {
    ...draft,
    featureChoices: upsertFeatureChoice(draft.featureChoices, choiceId, optionId),
  };
}

export function setAbilityScoreIncreaseChoice(
  draft: CharacterDraft,
  choiceId: string,
  level: number,
  increases: Partial<Record<keyof AbilityScores, number>>,
): CharacterDraft {
  const normalizedIncreases = normalizeAbilityIncreases(increases);
  if (!isValidAbilityScoreIncrease(normalizedIncreases, draft.abilityScores)) {
    return draft;
  }
  const safeLevel = clampLevel(level);
  const normalized = normalizeLevelUpState(draft.levelUp);
  const entries = Object.entries(normalizedIncreases) as Array<[keyof AbilityScores, number]>;
  const state: AbilityScoreIncreaseChoiceState = {
    choiceId,
    level: safeLevel,
    source: "class",
    mode: entries.length === 1 ? "+2" : "+1/+1",
    increases: normalizedIncreases,
    status: "complete",
    updatedAt: nowIso(),
  };
  return {
    ...draft,
    featureChoices: upsertFeatureChoice(draft.featureChoices, choiceId, "ability-score-improvement"),
    levelUp: {
      ...normalized,
      abilityScoreIncreases: {
        ...(normalized.abilityScoreIncreases ?? {}),
        [choiceId]: state,
      },
    },
  };
}

export function setLevelUpFeatChoice(
  draft: CharacterDraft,
  choiceId: string,
  level: number,
  featId: string | undefined,
): CharacterDraft {
  const safeLevel = clampLevel(level);
  const contextId = featChoiceContextId(choiceId);
  const normalized = normalizeLevelUpState(draft.levelUp);
  const previousContextual = contextualFeatIds(draft.featureChoices);
  const nextFeatureChoices = upsertFeatureChoice(
    upsertFeatureChoice(draft.featureChoices, choiceId, "feat"),
    contextId,
    featId,
  );
  const nextContextual = contextualFeatIds(nextFeatureChoices);
  const nonContextualFeats = draft.featIds.filter((entry) => !previousContextual.has(entry));
  const state: FeatChoiceState = {
    choiceId,
    contextId,
    level: safeLevel,
    source: "class",
    featId,
    status: featId ? "complete" : "pending",
    updatedAt: nowIso(),
  };
  return {
    ...draft,
    featureChoices: nextFeatureChoices,
    featIds: Array.from(new Set([...nonContextualFeats, ...nextContextual])),
    levelUp: {
      ...normalized,
      featChoices: {
        ...(normalized.featChoices ?? {}),
        [choiceId]: state,
      },
    },
  };
}

export function resolveLevelUpAbilityScoreBonuses(draft: CharacterDraft): Partial<Record<keyof AbilityScores, number>> {
  const normalized = normalizeLevelUpState(draft.levelUp);
  const selectedAsiChoiceIds = new Set(
    draft.featureChoices
      .filter((entry) => entry.optionId === "ability-score-improvement")
      .map((entry) => entry.featureId),
  );
  const bonuses: Partial<Record<keyof AbilityScores, number>> = {};
  for (const [choiceId, state] of Object.entries(normalized.abilityScoreIncreases ?? {})) {
    if (!selectedAsiChoiceIds.has(choiceId) || state.status !== "complete" || !isValidAbilityScoreIncrease(state.increases)) {
      continue;
    }
    for (const [ability, value] of Object.entries(state.increases) as Array<[keyof AbilityScores, number]>) {
      bonuses[ability] = (bonuses[ability] ?? 0) + value;
    }
  }
  return bonuses;
}
