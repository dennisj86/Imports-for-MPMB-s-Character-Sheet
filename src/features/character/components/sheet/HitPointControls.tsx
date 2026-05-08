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
}: HitPointControlsProps) {
  const [deltaInput, setDeltaInput] = useState("1");
  const [currentHpInput, setCurrentHpInput] = useState(String(currentHp));
  const [tempHpInput, setTempHpInput] = useState("0");
  const deltaAmount = useMemo(() => parseAmount(deltaInput), [deltaInput]);
  const nextCurrentHp = useMemo(() => parseAmount(currentHpInput), [currentHpInput]);
  const nextTempHp = useMemo(() => parseAmount(tempHpInput), [tempHpInput]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
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
            S {deathSaves.successes} / 3 · F {deathSaves.failures} / 3
          </p>
          <p className="text-xs text-slate-600">
            {deathSaves.dead ? "Dead" : deathSaves.stable ? "Stable" : "Active"}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[140px,1fr,1fr]">
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

      <div className="grid gap-2 sm:grid-cols-[140px,1fr]">
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

      <div className="grid gap-2 sm:grid-cols-[140px,1fr,1fr]">
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
  );
}
