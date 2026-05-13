import { useState } from "react";
import type { ActiveConditionState } from "../../../../domain/playState";
import { inputClassName } from "../../../../components/ui/FormField";
import { findConditionDefinition, STANDARD_CONDITION_DEFINITIONS } from "../../../../services/playState";
import { EmptyState, InfoPopover, StatusBadge } from "./SheetDesignSystem";
import { RuleDetailDrawer, type RuleDetailModel } from "./RuleDetailDrawer";
import { ruleInfo } from "./rulesInfo";

interface ConditionTrayProps {
  activeConditions: ActiveConditionState[];
  onToggleCondition: (conditionName: string, source?: string, notes?: string) => void;
}

export function ConditionTray({ activeConditions, onToggleCondition }: ConditionTrayProps) {
  const [customCondition, setCustomCondition] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<RuleDetailModel | undefined>();
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
        aria-label="Filter active condition options"
        className={inputClassName()}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter conditions"
        value={filter}
      />
      <div className="flex flex-wrap gap-1">
        {conditionOptions.map((condition) => {
          const active = activeConditions.some((entry) => entry.id === condition.id);
          const explanation = condition.shortRulesHint ?? ruleInfo(condition.label);
          return (
            <div key={condition.id} className="inline-flex items-center gap-1">
              <button
                title={condition.shortRulesHint}
                aria-label={`Toggle condition ${condition.label}`}
                className={`sheet-focus-ring rounded px-2 py-1 text-xs ${active ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-800"}`}
                onClick={() => onToggleCondition(condition.id)}
                type="button"
              >
                {condition.label}
              </button>
              <InfoPopover title={condition.label} description={explanation} />
              <button
                aria-label={`Open details for condition ${condition.label}`}
                className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                onClick={() =>
                  setSelectedDetail({
                    name: condition.label,
                    source: condition.source ?? "basic-rules",
                    timing: "condition",
                    duration: "until removed",
                    description: condition.shortRulesHint,
                    gameplaySummary: explanation,
                    automationStatus: "manual",
                    manualInstructions: "Apply penalties, immunities, and expiry manually unless another system handles it.",
                    knownLimitations: "No full encounter target engine is active.",
                    fields: [
                      { label: "Category", value: condition.category ?? "standard" },
                      { label: "Rest Clear", value: condition.clearableOnRest ?? "manual" },
                    ],
                  })
                }
                type="button"
              >
                Details
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          aria-label="Custom condition name"
          className={inputClassName()}
          onChange={(event) => setCustomCondition(event.target.value)}
          placeholder="Custom condition"
          value={customCondition}
        />
        <button
          aria-label="Toggle custom condition"
          className="sheet-focus-ring rounded bg-slate-700 px-3 py-2 text-sm text-white"
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
        <EmptyState title="Conditions" description="No active conditions." />
      ) : (
        <ul className="space-y-1 text-sm">
          {activeConditions.map((condition) => (
            <li key={condition.id} className="sheet-card flex items-center justify-between p-2">
              <span>
                {condition.name}
                {condition.source ? <span className="ml-2 text-xs text-slate-500">({condition.source})</span> : null}
                {findConditionDefinition(condition.id)?.shortRulesHint ? (
                  <span className="block text-xs text-slate-500">{findConditionDefinition(condition.id)?.shortRulesHint}</span>
                ) : null}
              </span>
              <div className="flex items-center gap-2">
                <StatusBadge label="active" status="pending" />
                <InfoPopover title={condition.name} description={findConditionDefinition(condition.id)?.shortRulesHint ?? ruleInfo(condition.name)} />
                <button
                  aria-label={`Open active condition details for ${condition.name}`}
                  className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                  onClick={() => {
                    const definition = findConditionDefinition(condition.id) ?? findConditionDefinition(condition.name);
                    setSelectedDetail({
                      name: condition.name,
                      source: condition.source ?? definition?.source ?? "manual",
                      timing: "condition",
                      duration: "while active",
                      description: condition.notes ?? definition?.shortRulesHint,
                      gameplaySummary: definition?.shortRulesHint ?? ruleInfo(condition.name),
                      automationStatus: "manual",
                      manualInstructions: "Track who is affected and remove when conditions end.",
                      knownLimitations: "Condition interactions with enemy targets are manual.",
                      fields: [
                        { label: "Category", value: condition.category ?? definition?.category ?? "custom" },
                        { label: "Added", value: condition.addedAt },
                      ],
                    });
                  }}
                  type="button"
                >
                  Details
                </button>
                <button
                  aria-label={`Remove condition ${condition.name}`}
                  className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                  onClick={() => onToggleCondition(condition.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {selectedDetail ? (
        <RuleDetailDrawer
          detail={selectedDetail}
          heading="Condition Details"
        />
      ) : null}
    </div>
  );
}
