import { useMemo, useState } from "react";
import type { CharacterDeathSaveState } from "../../../../domain/playState";
import { inputClassName } from "../../../../components/ui/FormField";

interface HitPointControlsProps {
  currentHp: number;
  maxHp: number;
  tempHp: number;
  deathSaves: CharacterDeathSaveState;
  onApplyDamage: (amount: number) => void;
  onApplyHealing: (amount: number) => void;
  onSetCurrentHp: (amount: number) => void;
  onSetTempHp: (amount: number) => void;
  onReplaceTempHp: (amount: number) => void;
  onRecordDeathSave: (result: "success" | "failure" | "critical-success" | "critical-failure") => void;
  onRollDeathSave?: () => void;
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
}

export function HitPointControls({
  currentHp,
  maxHp,
  tempHp,
  deathSaves,
  onApplyDamage,
  onApplyHealing,
  onSetCurrentHp,
  onSetTempHp,
  onReplaceTempHp,
  onRecordDeathSave,
  onRollDeathSave,
}: HitPointControlsProps) {
  const [deltaInput, setDeltaInput] = useState("1");
  const [currentHpInput, setCurrentHpInput] = useState(String(currentHp));
  const [tempHpInput, setTempHpInput] = useState("0");
  const deltaAmount = useMemo(() => parseAmount(deltaInput), [deltaInput]);
  const nextCurrentHp = useMemo(() => parseAmount(currentHpInput), [currentHpInput]);
  const nextTempHp = useMemo(() => parseAmount(tempHpInput), [tempHpInput]);

  const deathSaveStateLabel = deathSaves.dead ? "Dead" : deathSaves.stable ? "Stable" : currentHp > 0 ? "Conscious" : "Active";
  const deathSaveRollDisabled = currentHp > 0 || deathSaves.dead || !onRollDeathSave;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-slate-200 p-2 text-sm">
          <p className="text-xs uppercase text-slate-500">Current HP</p>
          <p className="text-lg font-semibold">
            {currentHp} / {maxHp}
          </p>
        </div>
        <div className="rounded border border-slate-200 p-2 text-sm">
          <p className="text-xs uppercase text-slate-500">Temp HP</p>
          <p className="text-lg font-semibold">{tempHp}</p>
        </div>
        <div className="rounded border border-slate-200 p-2 text-sm">
          <p className="text-xs uppercase text-slate-500">Death Saves</p>
          <p className="text-sm">
            Successes {deathSaves.successes} / 3
          </p>
          <p className="text-sm">
            Failures {deathSaves.failures} / 3
          </p>
          <p className="text-xs text-slate-600">{deathSaveStateLabel}</p>
        </div>
        <div className={`rounded border p-2 text-sm ${deathSaves.dead ? "border-rose-300 bg-rose-50" : currentHp <= 0 ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
          <p className="text-xs uppercase text-slate-500">Death Save Roll</p>
          <p className="text-xs text-slate-700">Roll d20: 10+ success, 9- failure, 1 = two failures, 20 = recover.</p>
          <button
            aria-label="Roll Death Save"
            className="sheet-focus-ring mt-2 w-full rounded bg-rose-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={deathSaveRollDisabled}
            onClick={onRollDeathSave}
            title={currentHp > 0 ? "Only available at 0 HP." : deathSaves.dead ? "Character is already dead." : undefined}
            type="button"
          >
            Roll Death Save
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[140px,minmax(0,1fr),minmax(0,1fr)]">
        <input
          className={inputClassName()}
          inputMode="numeric"
          min={0}
          onChange={(event) => setDeltaInput(event.target.value)}
          type="number"
          value={deltaInput}
        />
        <button className="rounded bg-red-600 px-3 py-2 text-sm text-white" onClick={() => onApplyDamage(deltaAmount)} type="button">
          Apply Damage
        </button>
        <button className="rounded bg-emerald-600 px-3 py-2 text-sm text-white" onClick={() => onApplyHealing(deltaAmount)} type="button">
          Apply Healing
        </button>
      </div>

      <details className="rounded border border-slate-200 bg-slate-50 p-2">
        <summary aria-label="Show manual HP and death save overrides" className="sheet-focus-ring cursor-pointer rounded px-2 py-1 text-sm text-slate-700">
          Manual Overrides
        </summary>
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[140px,minmax(0,1fr)]">
            <input
              className={inputClassName()}
              inputMode="numeric"
              min={0}
              onChange={(event) => setCurrentHpInput(event.target.value)}
              type="number"
              value={currentHpInput}
            />
            <button className="rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={() => onSetCurrentHp(nextCurrentHp)} type="button">
              Set Current HP
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px,minmax(0,1fr),minmax(0,1fr)]">
            <input
              className={inputClassName()}
              inputMode="numeric"
              min={0}
              onChange={(event) => setTempHpInput(event.target.value)}
              type="number"
              value={tempHpInput}
            />
            <button className="rounded bg-sky-700 px-3 py-2 text-sm text-white" onClick={() => onSetTempHp(nextTempHp)} type="button">
              Set Temp HP
            </button>
            <button className="rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={() => onReplaceTempHp(nextTempHp)} type="button">
              Replace Temp HP
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <button className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => onRecordDeathSave("success")} type="button">
              Death Save Success
            </button>
            <button className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => onRecordDeathSave("failure")} type="button">
              Death Save Failure
            </button>
            <button className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => onRecordDeathSave("critical-success")} type="button">
              Critical Success
            </button>
            <button className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => onRecordDeathSave("critical-failure")} type="button">
              Critical Failure
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
