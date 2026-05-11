import type { HitDieSpendResult, PlayHitDicePoolCounter, RestRecoveryPlan, RestResetPlan } from "../../../../services/playState";
import { HitDiceRestPanel } from "./HitDiceRestPanel";

interface RestControlsProps {
  onShortRest: () => void;
  onLongRest: () => void;
  onSpendHitDie: (poolId: string) => void;
  plan: RestRecoveryPlan;
  hitDicePools: PlayHitDicePoolCounter[];
  currentHp: number;
  maxHp: number;
  constitutionModifier: number;
  lastHitDieResult?: HitDieSpendResult;
}

function summary(plan: RestResetPlan, hitDicePools: PlayHitDicePoolCounter[] = []): string {
  const hitDiceRemaining = hitDicePools.reduce((sum, pool) => sum + pool.remaining, 0);
  const hitDiceMax = hitDicePools.reduce((sum, pool) => sum + pool.max, 0);
  const parts = [
    `${plan.resourceKeys.length} resources`,
    `${plan.spellSlotKeys.length} slot pools`,
  ];
  if (hitDiceMax > 0) {
    parts.push(`${hitDiceRemaining}/${hitDiceMax} hit dice`);
  }
  if (plan.skipped.length > 0) {
    parts.push(`${plan.skipped.length} manual/special`);
  }
  return parts.join(" · ");
}

function longRestHitDiceSummary(hitDicePools: PlayHitDicePoolCounter[]): string | undefined {
  const hitDiceMax = hitDicePools.reduce((sum, pool) => sum + pool.max, 0);
  if (hitDiceMax <= 0) {
    return undefined;
  }
  return `recovers up to ${Math.max(1, Math.floor(hitDiceMax / 2))} hit dice`;
}

export function RestControls({
  onShortRest,
  onLongRest,
  onSpendHitDie,
  plan,
  hitDicePools,
  currentHp,
  maxHp,
  constitutionModifier,
  lastHitDieResult,
}: RestControlsProps) {
  const notes = Array.from(new Set([...plan.shortRest.notes, ...plan.longRest.notes]));
  const longRestHitDice = longRestHitDiceSummary(hitDicePools);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Short Rest</p>
          <p className="text-xs text-slate-600">{summary(plan.shortRest, hitDicePools)}</p>
          <button className="mt-2 rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={onShortRest} type="button">
            Apply Short Rest
          </button>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Long Rest</p>
          <p className="text-xs text-slate-600">
            {summary(plan.longRest, hitDicePools)} · HP/death saves/concentration{longRestHitDice ? ` · ${longRestHitDice}` : ""}
          </p>
          <button className="mt-2 rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={onLongRest} type="button">
            Apply Long Rest
          </button>
        </div>
      </div>
      <HitDiceRestPanel
        constitutionModifier={constitutionModifier}
        currentHp={currentHp}
        lastResult={lastHitDieResult}
        maxHp={maxHp}
        onSpendHitDie={onSpendHitDie}
        pools={hitDicePools}
      />
      {notes.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
