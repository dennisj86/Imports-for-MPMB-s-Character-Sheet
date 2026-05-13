import { useMemo, useState } from "react";
import type { CharacterEngineState } from "../../../../services/characterEngine";
import type { InventoryViewModel } from "../../viewModels/inventoryViewModel";
import type { CharacterRollViewDiagnostics } from "../../../../domain/rolls";
import { StatusBadge } from "./SheetDesignSystem";

interface DiagnosticsPanelProps {
  engine: CharacterEngineState;
  inventory?: InventoryViewModel;
  rollDiagnostics?: CharacterRollViewDiagnostics;
}

export function DiagnosticsPanel({ engine, inventory, rollDiagnostics }: DiagnosticsPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const summaryText = useMemo(() => {
    const lines = [
      `Derived data status: ${engine.derivedStats.dataStatus}`,
      `Action resource status: ${engine.actionResources.dataStatus}`,
      `Rule pipeline status: ${engine.ruleEngine.dataStatus}`,
      `Action roll hidden duplicates: ${rollDiagnostics?.hiddenActionDuplicates.length ?? 0}`,
      `Rules context: ${engine.context.provider} / ${engine.context.rulesMode}`,
      `Rule sources: ${engine.ruleEngine.sources.length}`,
      `Raw choices: ${engine.ruleEngine.choiceSurface.rawChoiceCount}`,
      `Canonical choices: ${engine.ruleEngine.choiceSurface.choices.length}`,
      `hidden duplicates: ${engine.ruleEngine.choiceSurface.hiddenDuplicates.length}`,
      `Modifiers: ${engine.ruleEngine.modifiers.length}`,
      `Effects: ${engine.ruleEngine.effects.length}`,
    ];
    if (inventory) {
      lines.push(
        `AC ${inventory.armorClass.total} (${inventory.armorClass.calculation})`,
        `Dex mode ${inventory.armorClass.dexMode}; dex used ${inventory.armorClass.dexApplied}`,
      );
    }
    return lines.join("\n");
  }, [engine, inventory]);

  const copySummary = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyState("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <StatusBadge label={`derived ${engine.derivedStats.dataStatus}`} status={engine.derivedStats.dataStatus === "complete" ? "complete" : "pending"} />
          <StatusBadge label={`resources ${engine.actionResources.dataStatus}`} status={engine.actionResources.dataStatus === "complete" ? "complete" : "pending"} />
          <StatusBadge label={`rules ${engine.ruleEngine.dataStatus}`} status={engine.ruleEngine.dataStatus === "complete" ? "complete" : "pending"} />
        </div>
        <div className="flex items-center gap-2">
          {copyState === "copied" ? <StatusBadge label="summary copied" status="complete" /> : null}
          {copyState === "failed" ? <StatusBadge label="copy unavailable" status="unsupported" /> : null}
          <button
            aria-label="Copy diagnostics summary"
            className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-800"
            onClick={() => void copySummary()}
            type="button"
          >
            Copy Summary
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Derived Data Status</p>
          <p className="font-medium">{engine.derivedStats.dataStatus}</p>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Action Resource Status</p>
          <p className="font-medium">{engine.actionResources.dataStatus}</p>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <p className="text-xs uppercase text-slate-500">Rules</p>
          <p className="font-medium">
            {engine.context.provider} · {engine.context.rulesMode}
          </p>
        </div>
      </div>

      {engine.derivedStats.pending.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="mb-1 font-medium">Character Setup Issues</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {engine.derivedStats.pending.map((entry) => (
              <li key={entry.id}>{entry.description}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {engine.actionResources.pending.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="mb-1 font-medium">Rule Compatibility</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {engine.actionResources.pending.map((entry) => (
              <li key={entry.id}>{entry.description}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rollDiagnostics?.hiddenActionDuplicates.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="mb-1 font-medium">Action Card Dedupe</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {rollDiagnostics.hiddenActionDuplicates.map((duplicate) => (
              <li key={`${duplicate.id}:${duplicate.canonicalKey}`}>
                {duplicate.label}
                {duplicate.sourceSummary ? ` (${duplicate.sourceSummary})` : ""}; hidden by {duplicate.hiddenBy}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {engine.derivedStats.notes.length ? (
        <div className="rounded border border-slate-200 p-2 text-xs text-slate-700">
          <p className="mb-1 font-medium">Data Limitations</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {engine.derivedStats.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {inventory ? (
        <details className="rounded border border-slate-200 p-2 text-xs text-slate-700">
          <summary className="sheet-focus-ring cursor-pointer font-medium text-slate-800">Equipment / AC Diagnostics</summary>
          <p className="mt-2">
            AC path: {inventory.armorClass.calculation}; total {inventory.armorClass.total}; dex mode {inventory.armorClass.dexMode}; dex used{" "}
            {inventory.armorClass.dexApplied}.
          </p>
          {inventory.armorClass.warnings.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {inventory.armorClass.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 space-y-1">
            {[...inventory.armor, ...inventory.shields, ...inventory.weapons, ...inventory.other, ...inventory.unresolvedItems].map((item) => (
              <li key={item.instanceId}>
                <span className="font-medium">{item.name}:</span> {item.diagnostics.join(" ")}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="rounded border border-slate-200 p-2 text-xs text-slate-700">
        <summary className="sheet-focus-ring cursor-pointer font-medium text-slate-800">Rule Descriptor Pipeline</summary>
        <p className="mt-2">
          Sources {engine.ruleEngine.sources.length}; raw choices {engine.ruleEngine.choiceSurface.rawChoiceCount}; canonical choices{" "}
          {engine.ruleEngine.choiceSurface.choices.length}; hidden duplicates {engine.ruleEngine.choiceSurface.hiddenDuplicates.length}; modifiers{" "}
          {engine.ruleEngine.modifiers.length}; effects {engine.ruleEngine.effects.length}; status {engine.ruleEngine.dataStatus}.
        </p>
        {engine.ruleEngine.choiceSurface.diagnostics.length ? (
          <div className="mt-2">
            <p className="font-medium">Choice surface diagnostics</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {engine.ruleEngine.choiceSurface.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {engine.ruleEngine.choiceSurface.hiddenDuplicates.length ? (
          <div className="mt-2">
            <p className="font-medium">hidden duplicates</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {engine.ruleEngine.choiceSurface.hiddenDuplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  {duplicate.choiceType} from {duplicate.sourceName}: {duplicate.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {engine.ruleEngine.sources.filter((source) => source.mappingRefs?.length).length ? (
          <div className="mt-2">
            <p className="font-medium">Source mappings</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {engine.ruleEngine.sources.filter((source) => source.mappingRefs?.length).map((source) => (
                <li key={source.id}>
                  {source.sourceName}: mappings {source.mappingRefs?.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {engine.ruleEngine.choices.length ? (
          <div className="mt-2">
            <p className="font-medium">Canonical choices</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {engine.ruleEngine.choices.map((choice) => (
                <li key={choice.id}>
                  {choice.choiceType} from {choice.sourceType}: {choice.status}
                  {choice.parentChoiceId ? `; parent ${choice.parentChoiceId}` : ""}
                  {choice.generatedByOptionId ? `; generated by option ${choice.generatedByOptionId}` : ""}
                  {choice.dependsOn ? `; dependency ${choice.dependsOn.dependencyType}=${choice.dependsOn.requiredSelectedOptionId}` : ""}
                  {choice.diagnostics.length ? ` - ${choice.diagnostics.join(" ")}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {engine.ruleEngine.modifiers.length ? (
          <div className="mt-2">
            <p className="font-medium">Modifiers</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {engine.ruleEngine.modifiers.map((modifier) => (
                <li key={modifier.id}>
                  {modifier.sourceName}: {modifier.target} {modifier.valueType} {String(modifier.value)} ({modifier.condition})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {engine.ruleEngine.diagnostics.length ? (
          <div className="mt-2">
            <p className="font-medium">Pipeline diagnostics</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {engine.ruleEngine.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>

      {engine.ruleEngine.optionScoped.diagnostics.length ? (
        <details className="rounded border border-slate-200 p-2 text-xs text-slate-700">
          <summary className="sheet-focus-ring cursor-pointer font-medium text-slate-800">Option-Scoped Apply Paths</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            {engine.ruleEngine.optionScoped.diagnostics.map((diagnostic) => (
              <li key={diagnostic.id}>
                {diagnostic.sourceName}
                {diagnostic.optionLabel ? ` / ${diagnostic.optionLabel}` : diagnostic.optionId ? ` / ${diagnostic.optionId}` : ""}: {diagnostic.field} -{" "}
                {diagnostic.status}
                {diagnostic.applyPath ? ` via ${diagnostic.applyPath}` : ""}. {diagnostic.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
