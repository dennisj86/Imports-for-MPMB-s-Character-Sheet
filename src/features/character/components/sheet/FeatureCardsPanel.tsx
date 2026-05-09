import type { FeatureGroupViewModel } from "../../viewModels/featuresViewModel";

interface FeatureCardsPanelProps {
  groups: FeatureGroupViewModel[];
}

export function FeatureCardsPanel({ groups }: FeatureCardsPanelProps) {
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No readable feature entries resolved yet.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} className="space-y-2">
          <h3 className="text-xs font-medium uppercase text-slate-500">{group.label}</h3>
          <div className="grid gap-2 lg:grid-cols-2">
            {group.features.map((feature) => (
              <article key={feature.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{feature.name}</p>
                    <p className="text-xs text-slate-600">
                      {feature.sourceLabel}
                      {feature.level ? ` · L${feature.level}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {feature.actionType ? <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{feature.actionType}</span> : null}
                    {feature.usesLabel ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{feature.usesLabel}</span> : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{feature.summary}</p>
                {feature.details ? (
                  <details className="mt-2 text-xs text-slate-600">
                    <summary className="cursor-pointer text-slate-700">Details</summary>
                    <p className="mt-1 whitespace-pre-wrap">{feature.details}</p>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
