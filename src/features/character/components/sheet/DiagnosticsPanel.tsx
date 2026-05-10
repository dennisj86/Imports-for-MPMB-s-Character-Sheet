import type { CharacterEngineState } from "../../../../services/characterEngine";
import type { InventoryViewModel } from "../../viewModels/inventoryViewModel";

interface DiagnosticsPanelProps {
  engine: CharacterEngineState;
  inventory?: InventoryViewModel;
}

export function DiagnosticsPanel({ engine, inventory }: DiagnosticsPanelProps) {
  return (
    <div className="space-y-3 text-sm">
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
          {engine.derivedStats.pending.map((entry) => (
            <p key={entry.id}>{entry.description}</p>
          ))}
        </div>
      ) : null}

      {engine.actionResources.pending.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="mb-1 font-medium">Rule Compatibility</p>
          {engine.actionResources.pending.map((entry) => (
            <p key={entry.id}>{entry.description}</p>
          ))}
        </div>
      ) : null}

      {engine.derivedStats.notes.length ? (
        <div className="rounded border border-slate-200 p-2 text-xs text-slate-700">
          <p className="mb-1 font-medium">Data Limitations</p>
          {engine.derivedStats.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}

      {inventory ? (
        <div className="rounded border border-slate-200 p-2 text-xs text-slate-700">
          <p className="mb-1 font-medium">Equipment / AC Diagnostics</p>
          <p>
            AC path: {inventory.armorClass.calculation}; total {inventory.armorClass.total}; dex mode {inventory.armorClass.dexMode}; dex used{" "}
            {inventory.armorClass.dexApplied}.
          </p>
          {inventory.armorClass.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {[...inventory.armor, ...inventory.shields, ...inventory.weapons, ...inventory.other, ...inventory.unresolvedItems].map((item) => (
            <p key={item.instanceId}>
              {item.name}: {item.diagnostics.join(" ")}
            </p>
          ))}
        </div>
      ) : null}

      <div className="rounded border border-slate-200 p-2 text-xs text-slate-700">
        <p className="mb-1 font-medium">Rule Descriptor Pipeline</p>
        <p>
          Sources {engine.ruleEngine.sources.length}; choices {engine.ruleEngine.choices.length}; modifiers {engine.ruleEngine.modifiers.length}; effects{" "}
          {engine.ruleEngine.effects.length}; status {engine.ruleEngine.dataStatus}.
        </p>
        {engine.ruleEngine.sources.filter((source) => source.mappingRefs?.length).map((source) => (
          <p key={source.id}>
            {source.sourceName}: mappings {source.mappingRefs?.join(", ")}
          </p>
        ))}
        {engine.ruleEngine.choices.map((choice) => (
          <p key={choice.id}>
            {choice.choiceType} from {choice.sourceType}: {choice.status}
            {choice.diagnostics.length ? ` - ${choice.diagnostics.join(" ")}` : ""}
          </p>
        ))}
        {engine.ruleEngine.modifiers.map((modifier) => (
          <p key={modifier.id}>
            {modifier.sourceName}: {modifier.target} {modifier.valueType} {String(modifier.value)} ({modifier.condition})
          </p>
        ))}
        {engine.ruleEngine.diagnostics.map((diagnostic) => (
          <p key={diagnostic}>{diagnostic}</p>
        ))}
      </div>
    </div>
  );
}
