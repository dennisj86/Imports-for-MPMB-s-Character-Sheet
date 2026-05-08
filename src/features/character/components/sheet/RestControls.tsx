import type { RestRecoveryPlan, RestResetPlan } from "../../../../services/playState";

interface RestControlsProps {
  onShortRest: () => void;
  onLongRest: () => void;
  plan: RestRecoveryPlan;
}

function summary(plan: RestResetPlan): string {
  const parts = [
    `${plan.resourceKeys.length} resources`,
    `${plan.spellSlotKeys.length} slot pools`,
  ];
  if (plan.skipped.length > 0) {
    parts.push(`${plan.skipped.length} manual/special`);
  }
  return parts.join(" · ");
}

export function RestControls({ onShortRest, onLongRest, plan }: RestControlsProps) {
  const notes = Array.from(new Set([...plan.shortRest.notes, ...plan.longRest.notes]));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Short Rest</p>
          <p className="text-xs text-slate-600">{summary(plan.shortRest)}</p>
          <button className="mt-2 rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={onShortRest} type="button">
            Apply Short Rest
          </button>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Long Rest</p>
          <p className="text-xs text-slate-600">{summary(plan.longRest)} · HP/death saves/concentration</p>
          <button className="mt-2 rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={onLongRest} type="button">
            Apply Long Rest
          </button>
        </div>
      </div>
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
