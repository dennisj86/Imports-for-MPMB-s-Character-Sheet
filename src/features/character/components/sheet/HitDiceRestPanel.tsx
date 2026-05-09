import type { HitDieSpendResult, PlayHitDicePoolCounter } from "../../../../services/playState";

interface HitDiceRestPanelProps {
  pools: PlayHitDicePoolCounter[];
  currentHp: number;
  maxHp: number;
  constitutionModifier: number;
  lastResult?: HitDieSpendResult;
  onSpendHitDie: (poolId: string) => void;
}

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function HitDiceRestPanel({
  pools,
  currentHp,
  maxHp,
  constitutionModifier,
  lastResult,
  onSpendHitDie,
}: HitDiceRestPanelProps) {
  const isFullHp = currentHp >= maxHp;
  if (pools.length === 0) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
        Hit Dice unavailable / not enough class data.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-slate-200 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase text-slate-500">Hit Dice Healing</p>
          <p className="text-xs text-slate-600">
            HP {currentHp}/{maxHp} · CON {modifierLabel(constitutionModifier)}
          </p>
        </div>
        {isFullHp ? <p className="text-xs text-amber-700">HP is already full.</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {pools.map((pool) => {
          const disabled = pool.remaining <= 0 || isFullHp;
          return (
            <div key={pool.id} className="rounded border border-slate-200 p-2">
              <p className="text-sm font-medium">{pool.label}</p>
              <p className="text-xs text-slate-600">
                d{pool.die} · {pool.remaining}/{pool.max} remaining
              </p>
              <button
                className="mt-2 rounded bg-emerald-700 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={disabled}
                onClick={() => onSpendHitDie(pool.id)}
                type="button"
              >
                Spend Hit Die
              </button>
            </div>
          );
        })}
      </div>
      {lastResult ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          Last: {lastResult.poolLabel} rolled {lastResult.rawRoll} {modifierLabel(lastResult.constitutionModifier)} = {lastResult.healingTotal}; applied{" "}
          {lastResult.appliedHealing} HP.
        </div>
      ) : null}
    </div>
  );
}

