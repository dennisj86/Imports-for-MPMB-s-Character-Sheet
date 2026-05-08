import { toSlug } from "../../lib/slug";
import type { CharacterActionResourceState } from "../../domain/actionResources";
import type { CharacterPlayState, ConcentrationState } from "../../domain/playState";
import { createDefaultCharacterPlayState, PLAY_STATE_SCHEMA_VERSION } from "../../domain/playState";
import type { SpellDefinition } from "../../domain/content";
import type { CharacterEngineState } from "../characterEngine";
import { createPlayEvent } from "./playEventLog";
import { reduceCharacterPlayState } from "./playStateReducer";
import { resolveRestRecoveryPlan, type RestRecoveryPlan } from "./restResolver";

export interface PlayStateRuntimeContext {
  maxHp: number;
  resourceMaxByKey: Record<string, number>;
  spellSlotMaxByKey: Record<string, number>;
  restPlan: RestRecoveryPlan;
}

export interface PlayResourceCounter {
  id: string;
  name: string;
  max: number;
  spent: number;
  remaining: number;
  rechargeLabel: string;
  dataStatus: CharacterActionResourceState["resourceSet"]["resources"][number]["dataStatus"];
}

export interface PlaySpellSlotCounter {
  slotKey: string;
  level: number;
  max: number;
  used: number;
  remaining: number;
  rechargeLabel: string;
}

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function clampWithin(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function slotKeyFromResourceId(resourceId: string): string | undefined {
  const match = resourceId.match(/^resource:spell-slot:(\d+)$/);
  return match?.[1];
}

function nowTimestamp(now?: string): string {
  return now ?? new Date().toISOString();
}

function normalizeCounterMap(input: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    next[key] = clampNonNegativeInteger(value);
  }
  return next;
}

function normalizePlayStateCounters(
  playState: CharacterPlayState,
): CharacterPlayState {
  return {
    ...playState,
    currentHp: clampNonNegativeInteger(playState.currentHp),
    tempHp: clampNonNegativeInteger(playState.tempHp),
    deathSaves: {
      successes: clampWithin(playState.deathSaves.successes, 0, 3),
      failures: clampWithin(playState.deathSaves.failures, 0, 3),
      stable: Boolean(playState.deathSaves.stable),
      dead: Boolean(playState.deathSaves.dead),
    },
    spentResources: normalizeCounterMap(playState.spentResources),
    spellSlots: normalizeCounterMap(playState.spellSlots),
  };
}

export function ensureCharacterPlayState(
  playState: CharacterPlayState | undefined,
  characterId: string,
  options: {
    maxHp?: number;
    now?: string;
  } = {},
): CharacterPlayState {
  if (!playState || playState.schemaVersion !== PLAY_STATE_SCHEMA_VERSION || playState.characterId !== characterId) {
    return createDefaultCharacterPlayState(characterId, options);
  }
  const normalized = normalizePlayStateCounters(playState);
  const unchanged =
    normalized.currentHp === playState.currentHp &&
    normalized.tempHp === playState.tempHp &&
    normalized.deathSaves.successes === playState.deathSaves.successes &&
    normalized.deathSaves.failures === playState.deathSaves.failures &&
    normalized.deathSaves.stable === playState.deathSaves.stable &&
    normalized.deathSaves.dead === playState.deathSaves.dead &&
    Object.keys(normalized.spentResources).every((key) => normalized.spentResources[key] === playState.spentResources[key]) &&
    Object.keys(normalized.spellSlots).every((key) => normalized.spellSlots[key] === playState.spellSlots[key]) &&
    Object.keys(playState.spentResources).every((key) => normalized.spentResources[key] === playState.spentResources[key]) &&
    Object.keys(playState.spellSlots).every((key) => normalized.spellSlots[key] === playState.spellSlots[key]);
  return unchanged ? playState : normalized;
}

export function createPlayStateFromEngine(
  characterId: string,
  engine: CharacterEngineState,
  now?: string,
): CharacterPlayState {
  const runtime = buildPlayStateRuntimeContext(engine);
  const base = createDefaultCharacterPlayState(characterId, {
    maxHp: runtime.maxHp,
    now,
  });
  const spentResources: Record<string, number> = {};
  for (const resourceKey of Object.keys(runtime.resourceMaxByKey)) {
    spentResources[resourceKey] = 0;
  }
  const spellSlots: Record<string, number> = {};
  for (const slotKey of Object.keys(runtime.spellSlotMaxByKey)) {
    spellSlots[slotKey] = 0;
  }
  return {
    ...base,
    spentResources,
    spellSlots,
  };
}

export function shouldBootstrapPlayStateFromEngine(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
): boolean {
  const noResourceUsage = Object.values(playState.spentResources).every((value) => clampNonNegativeInteger(value) === 0);
  const noSlotUsage = Object.values(playState.spellSlots).every((value) => clampNonNegativeInteger(value) === 0);
  const untouched =
    playState.playEvents.length === 0 &&
    playState.tempHp === 0 &&
    playState.activeConditions.length === 0 &&
    playState.concentration === null &&
    playState.deathSaves.successes === 0 &&
    playState.deathSaves.failures === 0 &&
    !playState.deathSaves.stable &&
    !playState.deathSaves.dead &&
    noResourceUsage &&
    noSlotUsage;
  return untouched && playState.currentHp <= 1 && runtime.maxHp > 1;
}

export function buildPlayStateRuntimeContext(
  engine: CharacterEngineState,
): PlayStateRuntimeContext {
  const maxHp = Math.max(1, clampNonNegativeInteger(engine.derivedStats.hitPoints.max));
  const resourceMaxByKey: Record<string, number> = {};
  const spellSlotMaxByKey: Record<string, number> = {};
  for (const resource of engine.actionResources.resourceSet.resources) {
    if (resource.usesMax === undefined || resource.usesMax <= 0) {
      continue;
    }
    const slotKey = slotKeyFromResourceId(resource.id);
    if (slotKey) {
      spellSlotMaxByKey[slotKey] = clampNonNegativeInteger(resource.usesMax);
      continue;
    }
    resourceMaxByKey[resource.id] = clampNonNegativeInteger(resource.usesMax);
  }
  return {
    maxHp,
    resourceMaxByKey,
    spellSlotMaxByKey,
    restPlan: resolveRestRecoveryPlan(engine.actionResources),
  };
}

function getSlotMax(
  runtime: PlayStateRuntimeContext,
  slotKey: string,
): number {
  return clampNonNegativeInteger(runtime.spellSlotMaxByKey[slotKey] ?? 0);
}

function getResourceMax(
  runtime: PlayStateRuntimeContext,
  resourceKey: string,
): number {
  return clampNonNegativeInteger(runtime.resourceMaxByKey[resourceKey] ?? 0);
}

export function resolveResourceCounters(
  playState: CharacterPlayState,
  actionResources: CharacterActionResourceState,
): PlayResourceCounter[] {
  return actionResources.resourceSet.resources
    .filter((resource) => resource.usesMax !== undefined && resource.usesMax > 0)
    .filter((resource) => !resource.id.startsWith("resource:spell-slot:"))
    .map((resource) => {
      const max = clampNonNegativeInteger(resource.usesMax ?? 0);
      const spent = clampWithin(playState.spentResources[resource.id] ?? 0, 0, max);
      return {
        id: resource.id,
        name: resource.name,
        max,
        spent,
        remaining: clampWithin(max - spent, 0, max),
        rechargeLabel: resource.recharge.label,
        dataStatus: resource.dataStatus,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveSpellSlotCounters(
  playState: CharacterPlayState,
  actionResources: CharacterActionResourceState,
): PlaySpellSlotCounter[] {
  return actionResources.resourceSet.spellcasting.slotResources
    .map((resource) => {
      const slotKey = slotKeyFromResourceId(resource.id) ?? "0";
      const max = clampNonNegativeInteger(resource.usesMax ?? 0);
      const used = clampWithin(playState.spellSlots[slotKey] ?? 0, 0, max);
      return {
        slotKey,
        level: Number(slotKey),
        max,
        used,
        remaining: clampWithin(max - used, 0, max),
        rechargeLabel: resource.recharge.label,
      };
    })
    .sort((left, right) => left.level - right.level);
}

export function applyDamage(
  playState: CharacterPlayState,
  amount: number,
  now?: string,
): CharacterPlayState {
  const normalizedAmount = clampNonNegativeInteger(amount);
  const absorbedByTempHp = Math.min(playState.tempHp, normalizedAmount);
  return reduceCharacterPlayState(playState, {
    type: "apply-damage",
    amount: normalizedAmount,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "hp-damage",
      shortLabel: `Damage ${normalizedAmount}`,
      payload: {
        amount: normalizedAmount,
        absorbedByTempHp,
      },
    }),
  });
}

export function applyHealing(
  playState: CharacterPlayState,
  amount: number,
  runtime: PlayStateRuntimeContext,
  now?: string,
): CharacterPlayState {
  const normalizedAmount = clampNonNegativeInteger(amount);
  return reduceCharacterPlayState(playState, {
    type: "apply-healing",
    amount: normalizedAmount,
    maxHp: runtime.maxHp,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "hp-healing",
      shortLabel: `Heal ${normalizedAmount}`,
      payload: {
        amount: normalizedAmount,
      },
    }),
  });
}

export function setCurrentHp(
  playState: CharacterPlayState,
  currentHp: number,
  runtime: PlayStateRuntimeContext,
  now?: string,
): CharacterPlayState {
  const targetHp = clampWithin(currentHp, 0, runtime.maxHp);
  return reduceCharacterPlayState(playState, {
    type: "set-current-hp",
    currentHp: targetHp,
    maxHp: runtime.maxHp,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "hp-set",
      shortLabel: `Set HP ${targetHp}`,
      payload: {
        currentHp: targetHp,
      },
    }),
  });
}

export function setTempHp(
  playState: CharacterPlayState,
  tempHp: number,
  now?: string,
): CharacterPlayState {
  const normalizedTempHp = clampNonNegativeInteger(tempHp);
  return reduceCharacterPlayState(playState, {
    type: "set-temp-hp",
    tempHp: normalizedTempHp,
    forceReplace: false,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "temp-hp-set",
      shortLabel: `Temp HP ${normalizedTempHp}`,
      payload: {
        tempHp: normalizedTempHp,
        mode: "set",
      },
    }),
  });
}

export function replaceTempHp(
  playState: CharacterPlayState,
  tempHp: number,
  now?: string,
): CharacterPlayState {
  const normalizedTempHp = clampNonNegativeInteger(tempHp);
  return reduceCharacterPlayState(playState, {
    type: "set-temp-hp",
    tempHp: normalizedTempHp,
    forceReplace: true,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "temp-hp-replace",
      shortLabel: `Replace Temp HP ${normalizedTempHp}`,
      payload: {
        tempHp: normalizedTempHp,
        mode: "replace",
      },
    }),
  });
}

export function recordDeathSave(
  playState: CharacterPlayState,
  result: "success" | "failure" | "critical-success" | "critical-failure",
  now?: string,
): CharacterPlayState {
  return reduceCharacterPlayState(playState, {
    type: "record-death-save",
    result,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "death-save",
      shortLabel: `Death Save ${result}`,
      payload: {
        result,
      },
    }),
  });
}

export function spendResource(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  resourceKey: string,
  amount = 1,
  label?: string,
  now?: string,
): CharacterPlayState {
  const normalizedAmount = clampNonNegativeInteger(amount);
  const max = getResourceMax(runtime, resourceKey);
  return reduceCharacterPlayState(playState, {
    type: "spend-resource",
    resourceKey,
    amount: normalizedAmount,
    resourceMax: max,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "resource-spend",
      shortLabel: `${label ?? resourceKey} -${normalizedAmount}`,
      payload: {
        resourceKey,
        amount: normalizedAmount,
      },
    }),
  });
}

export function restoreResource(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  resourceKey: string,
  amount = 1,
  label?: string,
  now?: string,
): CharacterPlayState {
  const normalizedAmount = clampNonNegativeInteger(amount);
  const max = getResourceMax(runtime, resourceKey);
  return reduceCharacterPlayState(playState, {
    type: "restore-resource",
    resourceKey,
    amount: normalizedAmount,
    resourceMax: max,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "resource-restore",
      shortLabel: `${label ?? resourceKey} +${normalizedAmount}`,
      payload: {
        resourceKey,
        amount: normalizedAmount,
      },
    }),
  });
}

export function spendSpellSlot(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  slotKey: string,
  amount = 1,
  now?: string,
): CharacterPlayState {
  const max = getSlotMax(runtime, slotKey);
  const normalizedAmount = clampNonNegativeInteger(amount);
  return reduceCharacterPlayState(playState, {
    type: "spend-spell-slot",
    slotKey,
    amount: normalizedAmount,
    slotMax: max,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "spell-slot-spend",
      shortLabel: `Slot L${slotKey} -${normalizedAmount}`,
      payload: {
        slotKey,
        amount: normalizedAmount,
      },
    }),
  });
}

export function restoreSpellSlot(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  slotKey: string,
  amount = 1,
  now?: string,
): CharacterPlayState {
  const max = getSlotMax(runtime, slotKey);
  const normalizedAmount = clampNonNegativeInteger(amount);
  return reduceCharacterPlayState(playState, {
    type: "restore-spell-slot",
    slotKey,
    amount: normalizedAmount,
    slotMax: max,
    timestamp: nowTimestamp(now),
    event: createPlayEvent({
      timestamp: nowTimestamp(now),
      type: "spell-slot-restore",
      shortLabel: `Slot L${slotKey} +${normalizedAmount}`,
      payload: {
        slotKey,
        amount: normalizedAmount,
      },
    }),
  });
}

export interface CastSpellOptions {
  slotLevel?: number;
  ritualCast?: boolean;
  trackConcentration?: boolean;
  concentrationNotes?: string;
}

export function castSpell(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  spell: Pick<SpellDefinition, "id" | "name" | "level" | "ritual" | "concentration">,
  options: CastSpellOptions = {},
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  const ritualCast = Boolean(options.ritualCast);
  const slotKey =
    spell.level > 0 && !ritualCast
      ? String(options.slotLevel ?? spell.level)
      : undefined;
  const slotMax = slotKey ? getSlotMax(runtime, slotKey) : undefined;
  const shouldTrackConcentration = options.trackConcentration ?? spell.concentration;
  const concentration: ConcentrationState | undefined =
    shouldTrackConcentration && spell.concentration
      ? {
          sourceId: spell.id,
          name: spell.name,
          startedAt: timestamp,
          notes: options.concentrationNotes,
        }
      : undefined;
  return reduceCharacterPlayState(playState, {
    type: "cast-spell",
    spellId: spell.id,
    spellName: spell.name,
    ritualCast,
    slotKey,
    slotMax,
    startConcentration: concentration,
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "spell-cast",
      shortLabel: ritualCast ? `Cast ${spell.name} (Ritual)` : `Cast ${spell.name}`,
      payload: {
        spellId: spell.id,
        spellName: spell.name,
        ritualCast,
        slotKey,
        concentrationStarted: Boolean(concentration),
      },
    }),
  });
}

export function toggleCondition(
  playState: CharacterPlayState,
  condition: {
    id?: string;
    name: string;
    source?: string;
    notes?: string;
  },
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  const normalizedName = condition.name.trim();
  if (!normalizedName) {
    return playState;
  }
  const conditionId = condition.id ?? `condition:${toSlug(normalizedName)}`;
  const existing = playState.activeConditions.find((entry) => entry.id === conditionId);
  return reduceCharacterPlayState(playState, {
    type: "toggle-condition",
    condition: {
      id: conditionId,
      name: normalizedName,
      source: condition.source,
      notes: condition.notes,
      addedAt: timestamp,
    },
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "condition-toggle",
      shortLabel: existing ? `Condition - ${normalizedName}` : `Condition + ${normalizedName}`,
      payload: {
        conditionId,
        name: normalizedName,
        enabled: !existing,
      },
    }),
  });
}

export function startConcentration(
  playState: CharacterPlayState,
  concentration: {
    sourceId?: string;
    name: string;
    notes?: string;
  },
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  if (!concentration.name.trim()) {
    return playState;
  }
  return reduceCharacterPlayState(playState, {
    type: "start-concentration",
    concentration: {
      sourceId: concentration.sourceId,
      name: concentration.name.trim(),
      startedAt: timestamp,
      notes: concentration.notes,
    },
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "concentration-start",
      shortLabel: `Concentration: ${concentration.name.trim()}`,
      payload: {
        sourceId: concentration.sourceId,
        name: concentration.name.trim(),
      },
    }),
  });
}

export function endConcentration(
  playState: CharacterPlayState,
  reason: string | undefined,
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  return reduceCharacterPlayState(playState, {
    type: "end-concentration",
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "concentration-end",
      shortLabel: reason ? `End concentration (${reason})` : "End concentration",
      payload: {
        reason,
      },
    }),
  });
}

export function applyShortRest(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  return reduceCharacterPlayState(playState, {
    type: "short-rest",
    resetResourceKeys: runtime.restPlan.shortRest.resourceKeys,
    resetSpellSlotKeys: runtime.restPlan.shortRest.spellSlotKeys,
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "rest-short",
      shortLabel: "Short Rest",
      payload: {
        resetResourceCount: runtime.restPlan.shortRest.resourceKeys.length,
        resetSpellSlotCount: runtime.restPlan.shortRest.spellSlotKeys.length,
      },
    }),
  });
}

export function applyLongRest(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  return reduceCharacterPlayState(playState, {
    type: "long-rest",
    resetResourceKeys: runtime.restPlan.longRest.resourceKeys,
    resetSpellSlotKeys: runtime.restPlan.longRest.spellSlotKeys,
    maxHp: runtime.maxHp,
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "rest-long",
      shortLabel: "Long Rest",
      payload: {
        resetResourceCount: runtime.restPlan.longRest.resourceKeys.length,
        resetSpellSlotCount: runtime.restPlan.longRest.spellSlotKeys.length,
      },
    }),
  });
}
