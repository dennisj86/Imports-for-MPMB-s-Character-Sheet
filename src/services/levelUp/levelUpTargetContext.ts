import type { CharacterDraft } from "../../domain/character";

export type LevelUpTargetContextSource = "level-up-preview" | "committed-character";

export interface LevelUpTargetContext {
  currentLevel: number;
  targetLevel: number;
  source: LevelUpTargetContextSource;
  pendingChoiceId?: string;
  focusTarget?: string;
}

type SearchParamsLike = {
  get(name: string): string | null;
};

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.floor(value)));
}

export function normalizeLevelUpTargetContext(
  draft: CharacterDraft,
  requested: Partial<LevelUpTargetContext> | undefined,
): LevelUpTargetContext | undefined {
  if (!requested || requested.source !== "level-up-preview") {
    return undefined;
  }
  const currentLevel = clampLevel(draft.classSelection.level);
  const targetLevel = clampLevel(requested.targetLevel ?? currentLevel);
  if (targetLevel <= currentLevel) {
    return undefined;
  }
  return {
    currentLevel,
    targetLevel,
    source: "level-up-preview",
    pendingChoiceId: requested.pendingChoiceId,
    focusTarget: requested.focusTarget,
  };
}

export function resolveEffectiveCharacterLevel(
  draft: CharacterDraft,
  targetContext: LevelUpTargetContext | undefined,
): number {
  return normalizeLevelUpTargetContext(draft, targetContext)?.targetLevel ?? clampLevel(draft.classSelection.level);
}

export function applyEffectiveLevelToDraft(
  draft: CharacterDraft,
  targetContext: LevelUpTargetContext | undefined,
): CharacterDraft {
  const effectiveLevel = resolveEffectiveCharacterLevel(draft, targetContext);
  if (effectiveLevel === draft.classSelection.level) {
    return draft;
  }
  return {
    ...draft,
    classSelection: {
      ...draft.classSelection,
      level: effectiveLevel,
    },
  };
}

export function parseLevelUpTargetContextFromSearchParams(
  draft: CharacterDraft,
  searchParams: SearchParamsLike,
): LevelUpTargetContext | undefined {
  const mode = searchParams.get("mode");
  if (mode !== "level-up-preview") {
    return undefined;
  }
  const parsedTarget = Number(searchParams.get("levelUpTarget"));
  return normalizeLevelUpTargetContext(draft, {
    currentLevel: draft.classSelection.level,
    targetLevel: parsedTarget,
    source: "level-up-preview",
    pendingChoiceId: searchParams.get("pendingChoiceId") ?? undefined,
    focusTarget: searchParams.get("focus") ?? undefined,
  });
}
