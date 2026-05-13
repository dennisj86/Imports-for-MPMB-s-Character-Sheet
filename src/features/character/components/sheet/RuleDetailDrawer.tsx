import { useId } from "react";
import { StatusBadge } from "./SheetDesignSystem";
import {
  defaultManualInstructionForStatus,
  normalizeRuleAutomationStatus,
  ruleAutomationExplanation,
  ruleAutomationTone,
  type RuleAutomationStatus,
} from "./ruleAutomationStatus";

export interface RuleDetailField {
  label: string;
  value?: string;
}

export interface RuleDetailModel {
  name: string;
  source?: string;
  timing?: string;
  rangeOrTarget?: string;
  duration?: string;
  cost?: string;
  description?: string;
  gameplaySummary?: string;
  automationStatus?: RuleAutomationStatus | string;
  manualInstructions?: string;
  knownLimitations?: string;
  fields?: RuleDetailField[];
}

interface RuleDetailDrawerProps {
  detail: RuleDetailModel;
  heading?: string;
  className?: string;
  id?: string;
}

function detailEntries(detail: RuleDetailModel): RuleDetailField[] {
  const entries: RuleDetailField[] = [
    { label: "Source", value: detail.source },
    { label: "Timing", value: detail.timing },
    { label: "Range/Target", value: detail.rangeOrTarget },
    { label: "Duration", value: detail.duration },
    { label: "Cost/Resource", value: detail.cost },
  ];
  for (const entry of detail.fields ?? []) {
    if (entry.label) {
      entries.push(entry);
    }
  }
  return entries.filter((entry) => Boolean(entry.value));
}

export function RuleDetailDrawer({
  detail,
  heading = "Rule Details",
  className,
  id,
}: RuleDetailDrawerProps) {
  const generatedId = useId();
  const detailId = id ?? `rule-detail-${generatedId}`;
  const status = normalizeRuleAutomationStatus(detail.automationStatus, "unknown");
  const manualInstructions = detail.manualInstructions?.trim() || defaultManualInstructionForStatus(status);
  const knownLimitations = detail.knownLimitations?.trim() || (status === "unsupported" ? "Behavior is known but currently unsupported in this sheet." : undefined);
  const entries = detailEntries(detail);

  return (
    <section className={`mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 ${className ?? ""}`.trim()} id={detailId}>
      <p className="font-medium text-slate-900">{heading}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{detail.name}</p>
      {detail.gameplaySummary ? <p className="mt-1 text-slate-700">{detail.gameplaySummary}</p> : null}
      {entries.length ? (
        <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-2">
          {entries.map((entry, index) => (
            <div key={`${detail.name}-${entry.label}-${index}`}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{entry.label}</dt>
              <dd className="text-slate-800">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {detail.description ? <p className="mt-2 whitespace-pre-wrap text-slate-700">{detail.description}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">Automation Status</span>
        <StatusBadge label={status} status={ruleAutomationTone(status)} />
      </div>
      <p className="mt-1 text-slate-700">{ruleAutomationExplanation(status)}</p>
      {manualInstructions ? <p className="mt-1 text-slate-700">Manual: {manualInstructions}</p> : null}
      {knownLimitations ? <p className="mt-1 text-slate-600">Known Limitations: {knownLimitations}</p> : null}
    </section>
  );
}
