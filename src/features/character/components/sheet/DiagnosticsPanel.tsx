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
    </div>
  );
}
