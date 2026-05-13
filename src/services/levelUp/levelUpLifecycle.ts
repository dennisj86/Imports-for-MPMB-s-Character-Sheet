import type { CharacterActionResourceState, CharacterResource } from "../../domain/actionResources";
import type { CharacterDraft, CharacterLevelSource, LevelUpUndoSnapshotState } from "../../domain/character";
import type { CharacterEngineState } from "../characterEngine";
import { normalizeCharacterXpTrackingState } from "./xpProgression";

export type LevelUpChoicePreviewStatus = "pending" | "complete" | "unsupported" | "blocked";

export interface LevelUpChoicePreviewEntry {
  id: string;
  label: string;
  status: LevelUpChoicePreviewStatus;
  detail: string;
}

export interface LevelUpPreviewDiff {
  fromLevel: number;
  toLevel: number;
  className?: string;
  hpBefore: number;
  hpAfter: number;
  hpDelta: number;
  proficiencyBonusBefore: number;
  proficiencyBonusAfter: number;
  proficiencyBonusDelta: number;
  hitDiceGain?: string;
  newFeatures: string[];
  resourceChanges: Array<{
    id: string;
    name: string;
    before?: number;
    after?: number;
    recharge?: string;
  }>;
  spellSlotChanges: Array<{
    level: number;
    before: number;
    after: number;
  }>;
  spellPreparationChanges: string[];
  choiceStatuses: LevelUpChoicePreviewEntry[];
  warnings: string[];
  unsupportedNotes: string[];
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.floor(value)));
}

function toChoiceStatus(status: string): LevelUpChoicePreviewStatus {
  if (status === "complete") return "complete";
  if (status === "unsupported") return "unsupported";
  if (status === "blocked" || status === "needs-builder") return "blocked";
  return "pending";
}

function mapResourceById(resources: CharacterResource[]): Map<string, CharacterResource> {
  return new Map(resources.map((entry) => [entry.id, entry]));
}

function resolveHitDieGain(after: CharacterEngineState): string | undefined {
  const hitDie = after.classDef?.hitDie;
  if (!hitDie) {
    return undefined;
  }
  return `+1d${hitDie}`;
}

function spellSlotsForLevel(state: CharacterEngineState, level: number): number {
  const value = state.progression.spellProgression.spellSlots[level as keyof typeof state.progression.spellProgression.spellSlots];
  return typeof value === "number" ? value : 0;
}

function spellPreparationDiff(before: CharacterEngineState, after: CharacterEngineState): string[] {
  const changes: string[] = [];
  const beforeKnown = before.progression.spellProgression.spellsKnownLimit;
  const afterKnown = after.progression.spellProgression.spellsKnownLimit;
  const beforePrepared = before.progression.spellProgression.preparedSpellsLimit;
  const afterPrepared = after.progression.spellProgression.preparedSpellsLimit;
  const beforeCantrips = before.progression.spellProgression.cantripsKnown;
  const afterCantrips = after.progression.spellProgression.cantripsKnown;
  if (beforeKnown !== afterKnown && afterKnown !== undefined) {
    changes.push(`Spells known ${beforeKnown ?? 0} -> ${afterKnown}`);
  }
  if (beforePrepared !== afterPrepared && afterPrepared !== undefined) {
    changes.push(`Prepared limit ${beforePrepared ?? 0} -> ${afterPrepared}`);
  }
  if (beforeCantrips !== afterCantrips && afterCantrips !== undefined) {
    changes.push(`Cantrips known ${beforeCantrips ?? 0} -> ${afterCantrips}`);
  }
  return changes;
}

function progressionChoiceEntries(after: CharacterEngineState): LevelUpChoicePreviewEntry[] {
  const choices: LevelUpChoicePreviewEntry[] = [];
  for (const choice of after.ruleEngine.choiceSurface.choices.filter((entry) => entry.playerVisible)) {
    choices.push({
      id: choice.id,
      label: choice.label,
      status: toChoiceStatus(choice.status),
      detail: `${choice.selectedCount}/${choice.requiredCount} selected (${choice.options.length} option(s)).`,
    });
  }
  for (const pending of after.progression.pendingChoices.filter((entry) => entry.required && !entry.satisfied)) {
    choices.push({
      id: `progression:${pending.id}`,
      label: pending.description,
      status: "pending",
      detail: pending.notes.join(" ").trim() || `${pending.source} level ${pending.level}`,
    });
  }
  if (after.progression.subclassRequirement?.required && !after.progression.subclassRequirement.satisfied) {
    choices.push({
      id: "progression:subclass-selection",
      label: `Subclass required at level ${after.progression.subclassRequirement.unlockLevel}`,
      status: "pending",
      detail: "Choose a subclass in the builder.",
    });
  }
  return choices;
}

function localDraftSnapshot(draft: CharacterDraft): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  return {
    ...draft,
    xp: {
      ...xp,
      lastLevelUpSnapshot: undefined,
    },
  };
}

export function buildLevelUpPreviewDiff(before: CharacterEngineState, after: CharacterEngineState): LevelUpPreviewDiff {
  const beforeLevel = before.progression.currentLevel;
  const afterLevel = after.progression.currentLevel;
  const beforeResourceMap = mapResourceById(before.actionResources.resourceSet.resources);
  const afterResourceMap = mapResourceById(after.actionResources.resourceSet.resources);
  const resourceChanges = Array.from(afterResourceMap.values())
    .map((afterResource) => {
      const beforeResource = beforeResourceMap.get(afterResource.id);
      const beforeMax = beforeResource?.usesMax;
      const afterMax = afterResource.usesMax;
      if (beforeMax === afterMax) {
        return undefined;
      }
      return {
        id: afterResource.id,
        name: afterResource.name,
        before: beforeMax,
        after: afterMax,
        recharge: afterResource.recharge.label,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => left.name.localeCompare(right.name));
  const spellSlotChanges = Array.from({ length: 9 }, (_, index) => index + 1)
    .map((slotLevel) => ({
      level: slotLevel,
      before: spellSlotsForLevel(before, slotLevel),
      after: spellSlotsForLevel(after, slotLevel),
    }))
    .filter((entry) => entry.before !== entry.after);
  const beforeFeatureIds = new Set(before.progression.unlockedFeatures.map((entry) => entry.id));
  const newFeatures = after.progression.unlockedFeatures
    .filter((entry) => !beforeFeatureIds.has(entry.id))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const choiceStatuses = progressionChoiceEntries(after);
  const unsupportedNotes = [
    ...after.progression.pendingChoices
      .filter((entry) => entry.notes.some((note) => /unsupported|manual|not implemented/i.test(note)))
      .map((entry) => `${entry.description}: ${entry.notes.join(" ")}`),
    ...choiceStatuses
      .filter((entry) => entry.status === "unsupported")
      .map((entry) => `${entry.label}: ${entry.detail}`),
  ];
  const warnings: string[] = [];
  if (!after.classDef) {
    warnings.push("No class selected; level-up diff is incomplete.");
  }
  if (afterLevel <= beforeLevel) {
    warnings.push("Target level is not higher than current level.");
  }
  if (!after.progression.unlockedFeatures.length) {
    warnings.push("No structured feature unlocks were detected for this level.");
  }
  return {
    fromLevel: beforeLevel,
    toLevel: afterLevel,
    className: after.classDef?.name,
    hpBefore: before.derivedStats.hitPoints.max,
    hpAfter: after.derivedStats.hitPoints.max,
    hpDelta: after.derivedStats.hitPoints.max - before.derivedStats.hitPoints.max,
    proficiencyBonusBefore: before.derivedStats.proficiencyBonus,
    proficiencyBonusAfter: after.derivedStats.proficiencyBonus,
    proficiencyBonusDelta: after.derivedStats.proficiencyBonus - before.derivedStats.proficiencyBonus,
    hitDiceGain: resolveHitDieGain(after),
    newFeatures,
    resourceChanges,
    spellSlotChanges,
    spellPreparationChanges: spellPreparationDiff(before, after),
    choiceStatuses,
    warnings,
    unsupportedNotes,
  };
}

export function buildLevelUpUndoSnapshot(
  draft: CharacterDraft,
  options: {
    fromLevel: number;
    toLevel: number;
    now?: string;
  },
): LevelUpUndoSnapshotState {
  return {
    capturedAt: options.now ?? new Date().toISOString(),
    fromLevel: clampLevel(options.fromLevel),
    toLevel: clampLevel(options.toLevel),
    snapshotJson: JSON.stringify(localDraftSnapshot(draft)),
  };
}

export function applyLevelUpWithSnapshot(
  draft: CharacterDraft,
  options: {
    now?: string;
    targetLevel?: number;
    levelSource?: CharacterLevelSource;
  } = {},
): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  const fromLevel = clampLevel(draft.classSelection.level);
  const toLevel = clampLevel(options.targetLevel ?? fromLevel + 1);
  if (toLevel <= fromLevel) {
    return draft;
  }
  return {
    ...draft,
    classSelection: {
      ...draft.classSelection,
      level: toLevel,
    },
    xp: {
      ...xp,
      levelSource: options.levelSource ?? xp.levelSource,
      lastLevelUpSnapshot: buildLevelUpUndoSnapshot(draft, {
        fromLevel,
        toLevel,
        now: options.now,
      }),
    },
  };
}

export function canUndoLastLevelUp(draft: CharacterDraft): boolean {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  return Boolean(xp.lastLevelUpSnapshot?.snapshotJson);
}

export function undoLastLevelUp(draft: CharacterDraft): CharacterDraft {
  const xp = normalizeCharacterXpTrackingState(draft.xp);
  const snapshot = xp.lastLevelUpSnapshot;
  if (!snapshot?.snapshotJson) {
    return draft;
  }
  try {
    const parsed = JSON.parse(snapshot.snapshotJson) as CharacterDraft;
    if (!parsed || parsed.id !== draft.id || parsed.version !== 2) {
      return {
        ...draft,
        xp: {
          ...xp,
          lastLevelUpSnapshot: undefined,
        },
      };
    }
    const parsedXp = normalizeCharacterXpTrackingState(parsed.xp);
    return {
      ...parsed,
      xp: {
        ...parsedXp,
        lastLevelUpSnapshot: undefined,
      },
    };
  } catch {
    return {
      ...draft,
      xp: {
        ...xp,
        lastLevelUpSnapshot: undefined,
      },
    };
  }
}

export function collectLevelUpResourceSummary(resourceState: CharacterActionResourceState): string[] {
  return resourceState.resourceSet.resources
    .filter((resource) => typeof resource.usesMax === "number")
    .map((resource) => `${resource.name}: ${resource.usesMax} (${resource.recharge.label})`)
    .sort((left, right) => left.localeCompare(right));
}
