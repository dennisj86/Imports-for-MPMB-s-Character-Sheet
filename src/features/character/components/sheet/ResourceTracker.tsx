import type { PlayResourceCounter } from "../../../../services/playState";
import { EmptyState, ResourceBadge, StatusBadge } from "./SheetDesignSystem";

interface ResourceTrackerProps {
  resources: PlayResourceCounter[];
  showDiagnostics?: boolean;
  onSpend: (resourceKey: string, amount?: number, label?: string) => void;
  onRestore: (resourceKey: string, amount?: number, label?: string) => void;
}

export function ResourceTracker({ resources, showDiagnostics = false, onSpend, onRestore }: ResourceTrackerProps) {
  if (resources.length === 0) {
    return <EmptyState title="Resources" description="No limited-use resources resolved." />;
  }
  return (
    <ul className="space-y-2">
      {resources.map((resource) => (
        <li key={resource.id} className="space-y-2">
          <ResourceBadge
            label={resource.name}
            max={resource.max}
            rechargeLabel={resource.rechargeLabel}
            remaining={resource.remaining}
            source={resource.sourceName}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex gap-1">
              <button
                aria-label={`Restore one use of ${resource.name}`}
                className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={resource.spent <= 0}
                onClick={() => onRestore(resource.id, 1, resource.name)}
                title={resource.spent <= 0 ? `${resource.name} is already full.` : undefined}
                type="button"
              >
                +1
              </button>
              <button
                aria-label={`Spend one use of ${resource.name}`}
                className="sheet-focus-ring rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={resource.remaining <= 0}
                onClick={() => onSpend(resource.id, 1, resource.name)}
                title={resource.remaining <= 0 ? `${resource.name} is depleted.` : undefined}
                type="button"
              >
                -1
              </button>
            </div>
            {resource.remaining <= 0 ? <StatusBadge label="depleted" status="pending" /> : null}
          </div>
          {showDiagnostics && resource.dataStatus !== "complete" ? (
            <p className="mt-1 text-xs text-amber-700">Status: {resource.dataStatus}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
