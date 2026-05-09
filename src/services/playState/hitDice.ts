import type { CharacterEngineState } from "../characterEngine";
import type { CharacterHitDiceState, CharacterPlayEvent, HitDicePool, HitDieSize } from "../../domain/playState";

const HIT_DIE_SIZES: HitDieSize[] = [6, 8, 10, 12];

export interface PlayHitDicePoolCounter extends HitDicePool {
  unavailableReason?: string;
}

export interface HitDieSpendResult {
  poolId: string;
  poolLabel: string;
  dieExpression: string;
  rawRoll: number;
  constitutionModifier: number;
  healingTotal: number;
  appliedHealing: number;
  hpBefore: number;
  hpAfter: number;
}

export interface HitDiceRecoveryEntry {
  poolId: string;
  poolLabel: string;
  die: HitDieSize;
  recovered: number;
  remaining: number;
  spent: number;
}

export interface HitDiceRecoveryResult {
  totalMax: number;
  recoveryBudget: number;
  recoveredTotal: number;
  pools: HitDiceRecoveryEntry[];
  notes: string[];
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

function normalizeHitDieSize(value: unknown): HitDieSize | undefined {
  const numeric = typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : Number(value);
  return HIT_DIE_SIZES.find((entry) => entry === numeric);
}

function sourcePoolKey(pool: Pick<HitDicePool, "id" | "sourceClassId" | "die">): string {
  return pool.id || `hit-dice:${pool.sourceClassId ?? "class"}:d${pool.die}`;
}

function normalizePool(input: Partial<HitDicePool>, fallbackIndex: number): HitDicePool | undefined {
  const die = normalizeHitDieSize(input.die);
  if (!die) {
    return undefined;
  }
  const max = clampNonNegativeInteger(input.max ?? 0);
  const rawSpent = input.spent ?? Math.max(0, max - clampNonNegativeInteger(input.remaining ?? max));
  const spent = clampWithin(rawSpent, 0, max);
  const remaining = clampWithin(max - spent, 0, max);
  const id = input.id?.trim() || `hit-dice:pool-${fallbackIndex}:d${die}`;
  return {
    id,
    die,
    sourceClassId: input.sourceClassId,
    sourceClassName: input.sourceClassName,
    max,
    remaining,
    spent,
    label: input.label?.trim() || `${input.sourceClassName ?? "Hit Dice"} d${die}`,
  };
}

export function deriveHitDicePoolsFromEngine(engine: CharacterEngineState): HitDicePool[] {
  const die = normalizeHitDieSize(engine.classDef?.hitDie);
  const level = clampNonNegativeInteger(engine.progression.currentLevel || engine.actionResources.level);
  if (!die || level <= 0) {
    return [];
  }
  const classId = engine.classDef?.id ?? engine.progression.classId ?? "class";
  const className = engine.classDef?.name ?? engine.progression.className ?? "Class";
  return [
    {
      id: `hit-dice:${classId}:d${die}`,
      die,
      sourceClassId: classId,
      sourceClassName: className,
      max: level,
      remaining: level,
      spent: 0,
      label: `${className} d${die}`,
    },
  ];
}

function poolsFromUnknown(input: unknown): HitDicePool[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const pools = Array.isArray((input as { pools?: unknown }).pools)
    ? (input as { pools: unknown[] }).pools
    : [];
  return pools
    .map((pool, index) => (pool && typeof pool === "object" ? normalizePool(pool as Partial<HitDicePool>, index) : undefined))
    .filter((pool): pool is HitDicePool => Boolean(pool));
}

export function normalizeHitDiceState(
  input: CharacterHitDiceState | undefined,
  sourcePools: HitDicePool[] | undefined,
  now?: string,
): CharacterHitDiceState {
  const timestamp = now ?? input?.updatedAt;
  const existingPools = poolsFromUnknown(input);
  const existingById = new Map(existingPools.map((pool) => [sourcePoolKey(pool), pool]));
  const basePools = sourcePools ?? existingPools;
  const normalizedPools = basePools
    .map((source, index) => {
      const sourceNormalized = normalizePool(source, index);
      if (!sourceNormalized) {
        return undefined;
      }
      const existing = existingById.get(sourcePoolKey(sourceNormalized));
      const spent = clampWithin(existing?.spent ?? sourceNormalized.spent, 0, sourceNormalized.max);
      return {
        ...sourceNormalized,
        spent,
        remaining: clampWithin(sourceNormalized.max - spent, 0, sourceNormalized.max),
      };
    })
    .filter((pool): pool is HitDicePool => Boolean(pool));
  return {
    pools: normalizedPools,
    updatedAt: timestamp,
  };
}

export function hitDiceStatesEqual(left: CharacterHitDiceState, right: CharacterHitDiceState): boolean {
  if (left.updatedAt !== right.updatedAt || left.pools.length !== right.pools.length) {
    return false;
  }
  return left.pools.every((pool, index) => {
    const other = right.pools[index];
    return Boolean(
      other &&
        pool.id === other.id &&
        pool.die === other.die &&
        pool.sourceClassId === other.sourceClassId &&
        pool.sourceClassName === other.sourceClassName &&
        pool.max === other.max &&
        pool.remaining === other.remaining &&
        pool.spent === other.spent &&
        pool.label === other.label,
    );
  });
}

export function resolveHitDiceCounters(
  playState: { hitDice: CharacterHitDiceState },
): PlayHitDicePoolCounter[] {
  return playState.hitDice.pools.map((pool) => ({
    ...pool,
    remaining: clampWithin(pool.remaining, 0, pool.max),
    spent: clampWithin(pool.spent, 0, pool.max),
  }));
}

export function recoverHitDiceOnLongRest(
  pools: HitDicePool[],
): {
  pools: HitDicePool[];
  result: HitDiceRecoveryResult;
} {
  const totalMax = pools.reduce((sum, pool) => sum + clampNonNegativeInteger(pool.max), 0);
  let remainingBudget = totalMax > 0 ? Math.max(1, Math.floor(totalMax / 2)) : 0;
  const nextPools = pools.map((pool) => ({ ...pool }));
  const affected: HitDiceRecoveryEntry[] = [];
  const ordered = nextPools
    .map((pool, index) => ({ pool, index }))
    .filter(({ pool }) => pool.spent > 0)
    .sort((left, right) => right.pool.spent - left.pool.spent || right.pool.max - left.pool.max || left.pool.id.localeCompare(right.pool.id));

  for (const { pool } of ordered) {
    if (remainingBudget <= 0) {
      break;
    }
    const recovered = Math.min(pool.spent, remainingBudget);
    pool.spent = clampWithin(pool.spent - recovered, 0, pool.max);
    pool.remaining = clampWithin(pool.max - pool.spent, 0, pool.max);
    remainingBudget -= recovered;
    affected.push({
      poolId: pool.id,
      poolLabel: pool.label,
      die: pool.die,
      recovered,
      remaining: pool.remaining,
      spent: pool.spent,
    });
  }

  const recoveredTotal = affected.reduce((sum, entry) => sum + entry.recovered, 0);
  return {
    pools: nextPools,
    result: {
      totalMax,
      recoveryBudget: totalMax > 0 ? Math.max(1, Math.floor(totalMax / 2)) : 0,
      recoveredTotal,
      pools: affected,
      notes: totalMax > 0 ? ["Recovered spent hit dice using highest-spent pool order."] : ["Hit dice unavailable; no recovery applied."],
    },
  };
}

function isHitDieSpendResult(value: unknown): value is HitDieSpendResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<HitDieSpendResult>;
  return (
    typeof candidate.poolId === "string" &&
    typeof candidate.dieExpression === "string" &&
    typeof candidate.rawRoll === "number" &&
    typeof candidate.healingTotal === "number" &&
    typeof candidate.appliedHealing === "number"
  );
}

export function getLatestHitDieSpendResult(events: CharacterPlayEvent[]): HitDieSpendResult | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== "hit-die-spent") {
      continue;
    }
    const result = event.payload.result;
    if (isHitDieSpendResult(result)) {
      return result;
    }
  }
  return undefined;
}

