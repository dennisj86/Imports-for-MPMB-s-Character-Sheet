import { useState } from "react";
import type { ActiveConditionState } from "../../../../domain/playState";
import { inputClassName } from "../../../../components/ui/FormField";

interface ConditionTrayProps {
  activeConditions: ActiveConditionState[];
  onToggleCondition: (conditionName: string, source?: string, notes?: string) => void;
}

const QUICK_CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Poisoned", "Prone", "Restrained", "Stunned"];

export function ConditionTray({ activeConditions, onToggleCondition }: ConditionTrayProps) {
  const [customCondition, setCustomCondition] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {QUICK_CONDITIONS.map((conditionName) => {
          const active = activeConditions.some((entry) => entry.name.toLowerCase() === conditionName.toLowerCase());
          return (
            <button
              key={conditionName}
              className={`rounded px-2 py-1 text-xs ${active ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-800"}`}
              onClick={() => onToggleCondition(conditionName)}
              type="button"
            >
              {conditionName}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          className={inputClassName()}
          onChange={(event) => setCustomCondition(event.target.value)}
          placeholder="Custom condition"
          value={customCondition}
        />
        <button
          className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
          onClick={() => {
            const trimmed = customCondition.trim();
            if (!trimmed) {
              return;
            }
            onToggleCondition(trimmed, "manual");
            setCustomCondition("");
          }}
          type="button"
        >
          Toggle
        </button>
      </div>

      {activeConditions.length === 0 ? (
        <p className="text-sm text-slate-500">No active conditions.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {activeConditions.map((condition) => (
            <li key={condition.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
              <span>
                {condition.name}
                {condition.source ? <span className="ml-2 text-xs text-slate-500">({condition.source})</span> : null}
              </span>
              <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => onToggleCondition(condition.name)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
