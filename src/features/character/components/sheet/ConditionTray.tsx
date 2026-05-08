import { useState } from "react";
import type { ActiveConditionState } from "../../../../domain/playState";
import { inputClassName } from "../../../../components/ui/FormField";
import { findConditionDefinition, STANDARD_CONDITION_DEFINITIONS } from "../../../../services/playState";

interface ConditionTrayProps {
  activeConditions: ActiveConditionState[];
  onToggleCondition: (conditionName: string, source?: string, notes?: string) => void;
}

export function ConditionTray({ activeConditions, onToggleCondition }: ConditionTrayProps) {
  const [customCondition, setCustomCondition] = useState("");
  const [filter, setFilter] = useState("");
  const normalizedFilter = filter.trim().toLowerCase();
  const conditionOptions = STANDARD_CONDITION_DEFINITIONS.filter((condition) => {
    if (!normalizedFilter) {
      return true;
    }
    return condition.label.toLowerCase().includes(normalizedFilter) || condition.id.toLowerCase().includes(normalizedFilter);
  });

  return (
    <div className="space-y-3">
      <input
        className={inputClassName()}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter conditions"
        value={filter}
      />
      <div className="flex flex-wrap gap-1">
        {conditionOptions.map((condition) => {
          const active = activeConditions.some((entry) => entry.id === condition.id);
          return (
            <button
              key={condition.id}
              title={condition.shortRulesHint}
              className={`rounded px-2 py-1 text-xs ${active ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-800"}`}
              onClick={() => onToggleCondition(condition.id)}
              type="button"
            >
              {condition.label}
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
                {findConditionDefinition(condition.id)?.shortRulesHint ? (
                  <span className="block text-xs text-slate-500">{findConditionDefinition(condition.id)?.shortRulesHint}</span>
                ) : null}
              </span>
              <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => onToggleCondition(condition.id)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
