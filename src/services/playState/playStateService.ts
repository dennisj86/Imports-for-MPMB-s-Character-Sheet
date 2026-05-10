import type { CharacterActionResourceState, ResourceRechargeType } from "../../domain/actionResources";
import type { ActiveConditionState, CharacterPlayState, ConcentrationState, HitDicePool } from "../../domain/playState";
import { createDefaultCharacterPlayState, PLAY_STATE_SCHEMA_VERSION } from "../../domain/playState";
import type { SpellDefinition } from "../../domain/content";
import type { RollRequest, RollResult } from "../../domain/rolls";
import { rollDiceExpression } from "../../features/dice";
import type { CharacterEngineState } from "../characterEngine";
import { createRollPlayEvent, executeRollRequest } from "../rolls";
import { createActiveEffectFromSpell, instantiateActiveEffect } from "../rules";
import { findConditionDefinition, normalizeActiveConditionState } from "./conditionDefinitions";
import {
  deriveHitDicePoolsFromEngine,
  hitDiceStatesEqual,
  normalizeHitDiceState,
  recoverHitDiceOnLongRest,
  type HitDieSpendResult,
} from "./hitDice";
import { createPlayEvent } from "./playEventLog";
import { reduceCharacterPlayState } from "./playStateReducer";
import { resolveRestRecoveryPlan, type RestRecoveryPlan } from "./restResolver";

export interface PlayStateRuntimeContext {
  maxHp: number;
  constitutionModifier: number;
  hitDicePools: HitDicePool[];
  resourceMaxByKey: Record<string, number>;
  resourceRechargeByKey: Record<string, ResourceRechargeType>;
  resourceNameByKey: Record<string, string>;
  spellSlotMaxByKey: Record<string, number>;
  spellSlotRechargeByKey: Record<string, ResourceRechargeType>;
  restPlan: RestRecoveryPlan;
}

export interface PlayResourceCounter {
  id: string;
  name: string;
  max: number;
  spent: number;
  remaining: number;
  rechargeType: ResourceRechargeType;
  rechargeLabel: string;
  sourceType?: string;
  sourceId?: string;
  sourceName?: string;
  dataStatus: CharacterActionResourceState["resourceSet"]["resources"][number]["dataStatus"];
}

export interface PlaySpellSlotCounter {
  slotKey: string;
  level: number;
  max: number;
  used: number;
  remaining: number;
  rechargeType: ResourceRechargeType;
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
  sourceHitDicePools?: HitDicePool[],
  now?: string,
): CharacterPlayState {
  const activeConditions = normalizeActiveConditions(playState.activeConditions, playState.updatedAt);
  const hitDice = normalizeHitDiceState(playState.hitDice, sourceHitDicePools, now ?? playState.updatedAt);
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
    hitDice,
    activeConditions,
    activeEffects: playState.activeEffects ?? [],
  };
}

function normalizeActiveConditions(
  conditions: ActiveConditionState[],
  now?: string,
): ActiveConditionState[] {
  const normalized: ActiveConditionState[] = [];
  const seen = new Set<string>();
  for (const condition of conditions) {
    const entry = normalizeActiveConditionState(condition, now);
    if (!entry || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    normalized.push(entry);
  }
  return normalized;
}

function activeConditionsEqual(left: ActiveConditionState[], right: ActiveConditionState[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => {
    const other = right[index];
    return Boolean(
      other &&
        entry.id === other.id &&
        entry.name === other.name &&
        entry.source === other.source &&
        entry.category === other.category &&
        entry.clearableOnRest === other.clearableOnRest &&
        entry.notes === other.notes &&
        entry.addedAt === other.addedAt,
    );
  });
}

export function ensureCharacterPlayState(
  playState: CharacterPlayState | undefined,
  characterId: string,
  options: {
    maxHp?: number;
    hitDicePools?: HitDicePool[];
    now?: string;
  } = {},
): CharacterPlayState {
  if (!playState || playState.schemaVersion !== PLAY_STATE_SCHEMA_VERSION || playState.characterId !== characterId) {
    return {
      ...createDefaultCharacterPlayState(characterId, options),
      hitDice: normalizeHitDiceState(undefined, options.hitDicePools, options.now),
    };
  }
  const normalized = normalizePlayStateCounters(playState, options.hitDicePools, options.now);
  const originalHitDice = playState.hitDice ?? { pools: [] };
  const unchanged =
    normalized.currentHp === playState.currentHp &&
    normalized.tempHp === playState.tempHp &&
    normalized.deathSaves.successes === playState.deathSaves.successes &&
    normalized.deathSaves.failures === playState.deathSaves.failures &&
    normalized.deathSaves.stable === playState.deathSaves.stable &&
    normalized.deathSaves.dead === playState.deathSaves.dead &&
    activeConditionsEqual(normalized.activeConditions, playState.activeConditions) &&
    Array.isArray(playState.activeEffects) &&
    (playState.activeEffects ?? []).length === normalized.activeEffects.length &&
    hitDiceStatesEqual(normalized.hitDice, originalHitDice) &&
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
    hitDice: normalizeHitDiceState(undefined, runtime.hitDicePools, now),
  };
}

export function shouldBootstrapPlayStateFromEngine(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
): boolean {
  const noResourceUsage = Object.values(playState.spentResources).every((value) => clampNonNegativeInteger(value) === 0);
  const noSlotUsage = Object.values(playState.spellSlots).every((value) => clampNonNegativeInteger(value) === 0);
  const noHitDiceUsage = (playState.hitDice?.pools ?? []).every((pool) => clampNonNegativeInteger(pool.spent) === 0);
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
    noSlotUsage &&
    noHitDiceUsage;
  return untouched && playState.currentHp <= 1 && runtime.maxHp > 1;
}

export function buildPlayStateRuntimeContext(
  engine: CharacterEngineState,
): PlayStateRuntimeContext {
  const maxHp = Math.max(1, clampNonNegativeInteger(engine.derivedStats.hitPoints.max));
  const constitutionModifier = Number.isFinite(engine.derivedStats.abilityScores.con.modifier)
    ? Math.trunc(engine.derivedStats.abilityScores.con.modifier)
    : 0;
  const hitDicePools = deriveHitDicePoolsFromEngine(engine);
  const resourceMaxByKey: Record<string, number> = {};
  const resourceRechargeByKey: Record<string, ResourceRechargeType> = {};
  const resourceNameByKey: Record<string, string> = {};
  const spellSlotMaxByKey: Record<string, number> = {};
  const spellSlotRechargeByKey: Record<string, ResourceRechargeType> = {};
  for (const resource of engine.actionResources.resourceSet.resources) {
    if (resource.usesMax === undefined || resource.usesMax <= 0) {
      continue;
    }
    const slotKey = slotKeyFromResourceId(resource.id);
    if (slotKey) {
      spellSlotMaxByKey[slotKey] = clampNonNegativeInteger(resource.usesMax);
      spellSlotRechargeByKey[slotKey] = resource.recharge.type;
      continue;
    }
    resourceMaxByKey[resource.id] = clampNonNegativeInteger(resource.usesMax);
    resourceRechargeByKey[resource.id] = resource.recharge.type;
    resourceNameByKey[resource.id] = resource.name;
  }
  return {
    maxHp,
    constitutionModifier,
    hitDicePools,
    resourceMaxByKey,
    resourceRechargeByKey,
    resourceNameByKey,
    spellSlotMaxByKey,
    spellSlotRechargeByKey,
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
        rechargeType: resource.recharge.type,
        rechargeLabel: resource.recharge.label,
        sourceType: resource.sourceType,
        sourceId: resource.sourceId,
        sourceName: resource.sourceName,
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
        rechargeType: resource.recharge.type,
        rechargeLabel: resource.recharge.label,
      };
    })
    .sort((left, right) => left.level - right.level);
}

function summarizeHitDiceSpendingSinceLastRest(playState: CharacterPlayState): {
  spentCount: number;
  healingTotal: number;
  appliedHealing: number;
} {
  const lastRestTime = playState.lastRestAt ? Date.parse(playState.lastRestAt) : Number.NEGATIVE_INFINITY;
  return playState.playEvents.reduce(
    (summary, event) => {
      if (event.type !== "hit-die-spent") {
        return summary;
      }
      const eventTime = Date.parse(event.timestamp);
      if (Number.isFinite(lastRestTime) && Number.isFinite(eventTime) && eventTime < lastRestTime) {
        return summary;
      }
      const result = event.payload.result as Partial<HitDieSpendResult> | undefined;
      return {
        spentCount: summary.spentCount + 1,
        healingTotal: summary.healingTotal + (typeof result?.healingTotal === "number" ? result.healingTotal : 0),
        appliedHealing: summary.appliedHealing + (typeof result?.appliedHealing === "number" ? result.appliedHealing : 0),
      };
    },
    { spentCount: 0, healingTotal: 0, appliedHealing: 0 },
  );
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

export interface SpendHitDieOptions {
  rng?: () => number;
  now?: string;
}

function recordHitDieSpendBlocked(
  playState: CharacterPlayState,
  poolId: string,
  label: string | undefined,
  reason: "unknown" | "depleted" | "hp-full",
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  return reduceCharacterPlayState(playState, {
    type: "record-event",
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "hit-die-spend-blocked",
      shortLabel: `${label ?? poolId} blocked`,
      payload: {
        poolId,
        label,
        reason,
      },
    }),
  });
}

export function spendHitDie(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  poolId: string,
  options: SpendHitDieOptions = {},
): CharacterPlayState {
  const timestamp = nowTimestamp(options.now);
  const hitDice = normalizeHitDiceState(playState.hitDice, runtime.hitDicePools, timestamp);
  const poolIndex = hitDice.pools.findIndex((pool) => pool.id === poolId);
  const pool = poolIndex >= 0 ? hitDice.pools[poolIndex] : undefined;
  if (!pool) {
    return recordHitDieSpendBlocked(playState, poolId, undefined, "unknown", timestamp);
  }
  if (pool.remaining <= 0) {
    return recordHitDieSpendBlocked({ ...playState, hitDice }, pool.id, pool.label, "depleted", timestamp);
  }
  const hpBefore = clampWithin(playState.currentHp, 0, runtime.maxHp);
  if (hpBefore >= runtime.maxHp) {
    return recordHitDieSpendBlocked({ ...playState, hitDice }, pool.id, pool.label, "hp-full", timestamp);
  }

  const dieExpression = `1d${pool.die}`;
  const roll = rollDiceExpression(dieExpression, options.rng);
  const rawRoll = roll.terms.find((term) => term.kind === "dice")?.rolls[0] ?? roll.total;
  const healingTotal = Math.max(0, rawRoll + runtime.constitutionModifier);
  const hpAfter = clampWithin(hpBefore + healingTotal, 0, runtime.maxHp);
  const appliedHealing = hpAfter - hpBefore;
  const nextPools = hitDice.pools.map((entry, index) =>
    index === poolIndex
      ? {
          ...entry,
          remaining: clampWithin(entry.remaining - 1, 0, entry.max),
          spent: clampWithin(entry.spent + 1, 0, entry.max),
        }
      : entry,
  );
  const result: HitDieSpendResult = {
    poolId: pool.id,
    poolLabel: pool.label,
    dieExpression,
    rawRoll,
    constitutionModifier: runtime.constitutionModifier,
    healingTotal,
    appliedHealing,
    hpBefore,
    hpAfter,
  };

  return reduceCharacterPlayState(
    {
      ...playState,
      hitDice,
    },
    {
      type: "spend-hit-die",
      hitDicePools: nextPools,
      currentHp: hpAfter,
      maxHp: runtime.maxHp,
      timestamp,
      event: createPlayEvent({
        timestamp,
        type: "hit-die-spent",
        shortLabel: `${pool.label}: +${appliedHealing} HP`,
        payload: {
          result,
        },
      }),
    },
  );
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

function firstAvailableSlotLevel(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  minimumLevel: number,
): number | undefined {
  return Object.entries(runtime.spellSlotMaxByKey)
    .map(([slotKey, max]) => ({
      level: Number(slotKey),
      slotKey,
      max: clampNonNegativeInteger(max),
      used: clampWithin(playState.spellSlots[slotKey] ?? 0, 0, clampNonNegativeInteger(max)),
    }))
    .filter((slot) => Number.isFinite(slot.level) && slot.level >= minimumLevel && slot.max - slot.used > 0)
    .sort((left, right) => left.level - right.level)[0]?.level;
}

function clearableConditionIdsForRest(
  playState: CharacterPlayState,
  restType: "short-rest" | "long-rest",
): string[] {
  return playState.activeConditions
    .filter((condition) => condition.clearableOnRest === restType)
    .map((condition) => condition.id);
}

export function castSpell(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  spell: Pick<SpellDefinition, "id" | "name" | "level" | "ritual" | "concentration" | "description">,
  options: CastSpellOptions = {},
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  const ritualCast = Boolean(options.ritualCast && spell.ritual && spell.level > 0);
  const castMode = spell.level <= 0 ? "cantrip" : ritualCast ? "ritual" : "slot";
  const selectedSlotLevel =
    castMode === "slot"
      ? options.slotLevel ?? firstAvailableSlotLevel(playState, runtime, spell.level) ?? spell.level
      : undefined;
  const slotKey = selectedSlotLevel !== undefined ? String(selectedSlotLevel) : undefined;
  const slotMax = slotKey ? getSlotMax(runtime, slotKey) : undefined;

  if (castMode === "slot") {
    const invalidSlotLevel = selectedSlotLevel === undefined || selectedSlotLevel < spell.level;
    const used = slotKey && slotMax !== undefined ? clampWithin(playState.spellSlots[slotKey] ?? 0, 0, slotMax) : 0;
    const blockedReason = invalidSlotLevel
      ? "slot-level-too-low"
      : !slotKey || !slotMax
        ? "slot-unavailable"
        : used >= slotMax
          ? "slot-depleted"
          : undefined;
    if (blockedReason) {
      return reduceCharacterPlayState(playState, {
        type: "cast-spell",
        spellId: spell.id,
        spellName: spell.name,
        ritualCast: false,
        timestamp,
        event: createPlayEvent({
          timestamp,
          type: "spell-cast-blocked",
          shortLabel: `Cast blocked: ${spell.name}`,
          payload: {
            spellId: spell.id,
            spellName: spell.name,
            castMode,
            slotLevel: selectedSlotLevel,
            reason: blockedReason,
          },
        }),
      });
    }
  }

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
  const concentrationChange = concentration
    ? playState.concentration
      ? "replace"
      : "start"
    : "none";
  const concentrationEvent = concentration
    ? createPlayEvent({
        timestamp,
        type: concentrationChange === "replace" ? "concentration-replace" : "concentration-start",
        shortLabel:
          concentrationChange === "replace"
            ? `Replace concentration: ${playState.concentration?.name} -> ${spell.name}`
            : `Concentration: ${spell.name}`,
        payload: {
          previousName: playState.concentration?.name,
          sourceId: spell.id,
          name: spell.name,
        },
      })
    : undefined;
  const afterCast = reduceCharacterPlayState(playState, {
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
      shortLabel:
        castMode === "cantrip"
          ? `Cast ${spell.name} (Cantrip)`
          : castMode === "ritual"
            ? `Cast ${spell.name} (Ritual)`
            : `Cast ${spell.name} (Slot L${selectedSlotLevel})`,
      payload: {
        spellId: spell.id,
        spellName: spell.name,
        castMode,
        ritualCast,
        slotLevel: selectedSlotLevel,
        slotKey,
        concentrationChange,
        previousConcentrationName: playState.concentration?.name,
      },
    }),
    extraEvents: concentrationEvent ? [concentrationEvent] : [],
  });
  const activeEffect = createActiveEffectFromSpell(spell as SpellDefinition);
  if (!activeEffect) {
    return afterCast;
  }
  const effectState = instantiateActiveEffect(activeEffect, timestamp);
  return reduceCharacterPlayState(afterCast, {
    type: "add-active-effect",
    effect: effectState,
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "active-effect-start",
      shortLabel: `Effect: ${effectState.sourceName}`,
      payload: {
        effectId: effectState.id,
        sourceName: effectState.sourceName,
        applicableRollTypes: effectState.applicableRollTypes,
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
  const existingByInput = playState.activeConditions.find((entry) => entry.id === condition.id || entry.id === condition.name);
  const normalizedName = existingByInput?.name ?? condition.name.trim();
  if (!normalizedName) {
    return playState;
  }
  const definition = findConditionDefinition(condition.id) ?? findConditionDefinition(normalizedName);
  const normalizedCondition = normalizeActiveConditionState(
    {
      id: condition.id ?? definition?.id,
      name: definition?.label ?? normalizedName,
      source: condition.source ?? definition?.source,
      notes: condition.notes,
      category: definition?.category,
      clearableOnRest: definition?.clearableOnRest,
      addedAt: timestamp,
    },
    timestamp,
  );
  if (!normalizedCondition) {
    return playState;
  }
  const conditionId = normalizedCondition.id;
  const existing = playState.activeConditions.find((entry) => entry.id === conditionId);
  return reduceCharacterPlayState(playState, {
    type: "toggle-condition",
    condition: normalizedCondition,
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "condition-toggle",
      shortLabel: existing ? `Condition - ${normalizedCondition.name}` : `Condition + ${normalizedCondition.name}`,
      payload: {
        conditionId,
        name: normalizedCondition.name,
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

export function recordRollResult(
  playState: CharacterPlayState,
  result: RollResult,
): CharacterPlayState {
  return reduceCharacterPlayState(playState, {
    type: "record-event",
    timestamp: result.timestamp,
    event: createRollPlayEvent(result),
  });
}

export function recordResourceSpendBlocked(
  playState: CharacterPlayState,
  resourceKey: string,
  label: string | undefined,
  reason: "depleted" | "unknown",
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  return reduceCharacterPlayState(playState, {
    type: "record-event",
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "resource-spend-blocked",
      shortLabel: `${label ?? resourceKey} spend blocked`,
      payload: {
        resourceKey,
        label,
        reason,
      },
    }),
  });
}

export interface RollAndRecordOptions {
  rng?: () => number;
  now?: string;
  spendResourceKey?: string;
  resourceLabel?: string;
}

export function rollAndRecord(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  request: RollRequest,
  options: RollAndRecordOptions = {},
): {
  playState: CharacterPlayState;
  result: RollResult;
} {
  const timestamp = nowTimestamp(options.now);
  const result = executeRollRequest(request, {
    rng: options.rng,
    now: timestamp,
  });
  let next = recordRollResult(playState, result);
  if (options.spendResourceKey) {
    const max = getResourceMax(runtime, options.spendResourceKey);
    const spent = clampWithin(next.spentResources[options.spendResourceKey] ?? 0, 0, max);
    if (max <= 0) {
      next = recordResourceSpendBlocked(next, options.spendResourceKey, options.resourceLabel, "unknown", timestamp);
    } else if (spent >= max) {
      next = recordResourceSpendBlocked(next, options.spendResourceKey, options.resourceLabel, "depleted", timestamp);
    } else {
      next = spendResource(next, runtime, options.spendResourceKey, 1, options.resourceLabel, timestamp);
    }
  }
  return {
    playState: next,
    result,
  };
}

export function applyShortRest(
  playState: CharacterPlayState,
  runtime: PlayStateRuntimeContext,
  now?: string,
): CharacterPlayState {
  const timestamp = nowTimestamp(now);
  const hitDice = normalizeHitDiceState(playState.hitDice, runtime.hitDicePools, timestamp);
  const hitDiceRemaining = hitDice.pools.reduce((sum, pool) => sum + pool.remaining, 0);
  const hitDiceMax = hitDice.pools.reduce((sum, pool) => sum + pool.max, 0);
  const hitDiceSpending = summarizeHitDiceSpendingSinceLastRest(playState);
  return reduceCharacterPlayState({ ...playState, hitDice }, {
    type: "short-rest",
    resetResourceKeys: runtime.restPlan.shortRest.resourceKeys,
    resetSpellSlotKeys: runtime.restPlan.shortRest.spellSlotKeys,
    clearConditionIds: clearableConditionIdsForRest(playState, "short-rest"),
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "rest-short",
      shortLabel: "Short Rest",
      payload: {
        resetResourceKeys: runtime.restPlan.shortRest.resourceKeys,
        resetSpellSlotKeys: runtime.restPlan.shortRest.spellSlotKeys,
        resetResourceCount: runtime.restPlan.shortRest.resourceKeys.length,
        resetSpellSlotCount: runtime.restPlan.shortRest.spellSlotKeys.length,
        skipped: runtime.restPlan.shortRest.skipped,
        notes: runtime.restPlan.shortRest.notes,
        hpRecovery: "hit-dice-explicit",
        hitDiceAvailable: hitDiceRemaining,
        hitDiceMax,
        hitDiceSpentDuringRest: hitDiceSpending.spentCount,
        hitDiceHealingTotal: hitDiceSpending.healingTotal,
        hitDiceAppliedHealing: hitDiceSpending.appliedHealing,
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
  const hitDice = normalizeHitDiceState(playState.hitDice, runtime.hitDicePools, timestamp);
  const recovered = recoverHitDiceOnLongRest(hitDice.pools);
  const recoveryEvent =
    recovered.result.recoveredTotal > 0
      ? createPlayEvent({
          timestamp,
          type: "hit-dice-recovered",
          shortLabel: `Hit Dice recovered ${recovered.result.recoveredTotal}`,
          payload: {
            recovery: recovered.result,
          },
        })
      : undefined;
  return reduceCharacterPlayState({ ...playState, hitDice }, {
    type: "long-rest",
    resetResourceKeys: runtime.restPlan.longRest.resourceKeys,
    resetSpellSlotKeys: runtime.restPlan.longRest.spellSlotKeys,
    clearConditionIds: clearableConditionIdsForRest(playState, "long-rest"),
    maxHp: runtime.maxHp,
    hitDicePools: recovered.pools,
    timestamp,
    event: createPlayEvent({
      timestamp,
      type: "rest-long",
      shortLabel: "Long Rest",
      payload: {
        resetResourceKeys: runtime.restPlan.longRest.resourceKeys,
        resetSpellSlotKeys: runtime.restPlan.longRest.spellSlotKeys,
        resetResourceCount: runtime.restPlan.longRest.resourceKeys.length,
        resetSpellSlotCount: runtime.restPlan.longRest.spellSlotKeys.length,
        skipped: runtime.restPlan.longRest.skipped,
        notes: runtime.restPlan.longRest.notes,
        hpRecovery: "set-to-max",
        deathSavesReset: true,
        concentrationEnded: Boolean(playState.concentration),
        hitDiceRecovered: recovered.result.recoveredTotal,
        hitDiceRecoveryBudget: recovered.result.recoveryBudget,
        hitDiceRecoveryPools: recovered.result.pools,
      },
    }),
    extraEvents: recoveryEvent ? [recoveryEvent] : [],
  });
}
