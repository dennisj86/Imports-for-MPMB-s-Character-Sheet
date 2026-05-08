import type { PlayResourceCounter } from "../../../../services/playState";

interface ResourceTrackerProps {
  resources: PlayResourceCounter[];
  onSpend: (resourceKey: string, amount?: number, label?: string) => void;
  onRestore: (resourceKey: string, amount?: number, label?: string) => void;
}

export function ResourceTracker({ resources, onSpend, onRestore }: ResourceTrackerProps) {
  if (resources.length === 0) {
    return <p className="text-sm text-slate-500">No limited-use resources resolved.</p>;
  }
  return (
    <ul className="space-y-2">
      {resources.map((resource) => (
        <li key={resource.id} className="rounded border border-slate-200 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{resource.name}</p>
              <p className="text-xs text-slate-600">
                {resource.remaining} / {resource.max} · {resource.rechargeLabel}
                {resource.sourceName ? ` · ${resource.sourceName}` : ""}
              </p>
              {resource.remaining <= 0 ? <p className="text-xs text-amber-700">Resource already depleted.</p> : null}
            </div>
            <div className="flex gap-1">
              <button
                className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={resource.spent <= 0}
                onClick={() => onRestore(resource.id, 1, resource.name)}
                type="button"
              >
                +1
              </button>
              <button
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={resource.remaining <= 0}
                onClick={() => onSpend(resource.id, 1, resource.name)}
                type="button"
              >
                -1
              </button>
            </div>
          </div>
          {resource.dataStatus !== "complete" ? (
            <p className="mt-1 text-xs text-amber-700">Status: {resource.dataStatus}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
