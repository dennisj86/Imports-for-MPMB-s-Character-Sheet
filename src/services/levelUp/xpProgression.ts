import type { CharacterDraft, CharacterLevelSource, CharacterXpTrackingState, LevelUpUndoSnapshotState } from "../../domain/character";
import type { RulesMode } from "../../domain/content";

const DEFAULT_XP_TRACKING: CharacterXpTrackingState = {
  currentXp: 0,
  milestoneMode: false,
  levelSource: "xp",
};

const XP_THRESHOLDS_BY_RULES_MODE: Record<RulesMode, number[]> = {
  "2014": [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
  "2024": [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
};

export interface XpThresholdTableResolution {
  rulesMode: RulesMode;
  thresholds: number[];
  diagnostics: string[];
}

export interface CharacterXpProgressState {
  currentXp: number;
  levelSource: CharacterLevelSource;
  milestoneMode: boolean;
  levelFromXp: number;
  currentLevelThreshold: number;
  nextLevel: number | null;
  nextLevelThreshold: number | null;
  remainingToNextLevel: number;
  progressToNextLevel: number;
  levelUpAvailable: boolean;
  diagnostics: string[];
}

function clampXp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeLevelSource(value: CharacterLevelSource | undefined): CharacterLevelSource {
  return value === "manual" ? "manual" : "xp";
}

function normalizeSnapshot(snapshot: LevelUpUndoSnapshotState | undefined): LevelUpUndoSnapshotState | undefined {
  if (!snapshot) {
    return undefined;
  }
  if (!snapshot.snapshotJson || typeof snapshot.snapshotJson !== "string") {
    return undefined;
  }
  return {
    capturedAt: snapshot.capturedAt || new Date(0).toISOString(),
    fromLevel: Math.min(20, Math.max(1, Math.floor(snapshot.fromLevel || 1))),
    toLevel: Math.min(20, Math.max(1, Math.floor(snapshot.toLevel || 1))),
    snapshotJson: snapshot.snapshotJson,
  };
}

export function resolveXpThresholdTable(rulesMode: RulesMode): XpThresholdTableResolution {
  const thresholds = XP_THRESHOLDS_BY_RULES_MODE[rulesMode];
  if (Array.isArray(thresholds) && thresholds.length >= 20) {
    return {
      rulesMode,
      thresholds: [...thresholds],
      diagnostics: ["Using local XP thresholds table for level progression preview."],
    };
  }
  return {
    rulesMode,
    thresholds: [...XP_THRESHOLDS_BY_RULES_MODE["2024"]],
    diagnostics: [
      `No structured XP thresholds found for ${rulesMode}; fallback to local 2024 table.`,
    ],
  };
}

export function normalizeCharacterXpTrackingState(state: CharacterXpTrackingState | undefined): CharacterXpTrackingState {
  return {
    currentXp: clampXp(state?.currentXp ?? DEFAULT_XP_TRACKING.currentXp),
    milestoneMode: Boolean(state?.milestoneMode ?? DEFAULT_XP_TRACKING.milestoneMode),
    levelSource: normalizeLevelSource(state?.levelSource),
    lastLevelUpSnapshot: normalizeSnapshot(state?.lastLevelUpSnapshot),
  };
}

export function levelForXp(value: number, rulesMode: RulesMode): number {
  const xp = clampXp(value);
  const thresholds = resolveXpThresholdTable(rulesMode).thresholds;
  let level = 1;
  for (let index = 0; index < thresholds.length; index += 1) {
    if (xp >= thresholds[index]) {
      level = index + 1;
    } else {
      break;
    }
  }
  return Math.min(20, Math.max(1, level));
}

export function setCharacterXp(draft: CharacterDraft, value: number): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  return {
    ...draft,
    xp: {
      ...xp,
      currentXp: clampXp(value),
    },
  };
}

export function addCharacterXp(draft: CharacterDraft, delta: number): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  return {
    ...draft,
    xp: {
      ...xp,
      currentXp: clampXp(xp.currentXp + delta),
    },
  };
}

export function setCharacterLevelSource(draft: CharacterDraft, levelSource: CharacterLevelSource): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  return {
    ...draft,
    xp: {
      ...xp,
      levelSource: normalizeLevelSource(levelSource),
    },
  };
}

export function setCharacterMilestoneMode(draft: CharacterDraft, milestoneMode: boolean): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  return {
    ...draft,
    xp: {
      ...xp,
      milestoneMode: Boolean(milestoneMode),
    },
  };
}

export function buildCharacterXpProgressState(draft: CharacterDraft): CharacterXpProgressState {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  const thresholdResolution = resolveXpThresholdTable(draft.rulesMode);
  const levelFromXp = levelForXp(xp.currentXp, draft.rulesMode);
  const currentLevel = Math.min(20, Math.max(1, draft.classSelection.level));
  const currentLevelThreshold = thresholdResolution.thresholds[currentLevel - 1] ?? 0;
  const nextLevel = currentLevel < 20 ? currentLevel + 1 : null;
  const nextLevelThreshold = nextLevel ? thresholdResolution.thresholds[nextLevel - 1] ?? null : null;
  const remainingToNextLevel = nextLevelThreshold === null ? 0 : Math.max(0, nextLevelThreshold - xp.currentXp);
  const progressSpan = nextLevelThreshold === null ? 0 : Math.max(1, nextLevelThreshold - currentLevelThreshold);
  const progressToNextLevel = nextLevelThreshold === null
    ? 1
    : Math.max(0, Math.min(1, (xp.currentXp - currentLevelThreshold) / progressSpan));
  const levelUpAvailable =
    xp.levelSource === "xp" &&
    !xp.milestoneMode &&
    levelFromXp > currentLevel;

  return {
    currentXp: xp.currentXp,
    levelSource: xp.levelSource,
    milestoneMode: Boolean(xp.milestoneMode),
    levelFromXp,
    currentLevelThreshold,
    nextLevel,
    nextLevelThreshold,
    remainingToNextLevel,
    progressToNextLevel,
    levelUpAvailable,
    diagnostics: thresholdResolution.diagnostics,
  };
}
