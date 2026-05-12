import { useMemo, useState } from "react";
import type { FeatureGroupId, FeatureGroupViewModel } from "../../viewModels/featuresViewModel";
import { EmptyState, FeatureCardShell, SectionHeader, StatusBadge } from "./SheetDesignSystem";

interface FeatureCardsPanelProps {
  groups: FeatureGroupViewModel[];
}

export function FeatureCardsPanel({ groups }: FeatureCardsPanelProps) {
  const [featureSearch, setFeatureSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | FeatureGroupId>("all");
  const [actionFilter, setActionFilter] = useState<"all" | "actionable" | "passive">("all");

  const normalizedFeatureSearch = featureSearch.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          features: group.features.filter((feature) => {
            const searchMatch = normalizedFeatureSearch.length === 0
              || `${feature.name} ${feature.summary} ${feature.details ?? ""} ${feature.sourceLabel} ${feature.actionType ?? ""} ${feature.ruleChoiceLabels.join(" ")} ${feature.appliedSummaryLabels.join(" ")}`.toLowerCase().includes(normalizedFeatureSearch);
            const groupMatch = groupFilter === "all" || group.id === groupFilter;
            const actionMatch = actionFilter === "all"
              ? true
              : actionFilter === "actionable"
                ? Boolean(feature.actionType && feature.actionType !== "Passive")
                : !feature.actionType || feature.actionType === "Passive";
            return searchMatch && groupMatch && actionMatch;
          }),
        }))
        .filter((group) => group.features.length > 0),
    [actionFilter, groupFilter, groups, normalizedFeatureSearch],
  );
  const shownFeatures = filteredGroups.reduce((sum, group) => sum + group.features.length, 0);

  if (groups.length === 0) {
    return <EmptyState title="Features" description="No readable feature entries resolved yet." />;
  }

  return (
    <div className="space-y-4">
      <div className="sheet-card grid gap-2 p-3 md:grid-cols-[minmax(0,2fr),repeat(2,minmax(0,1fr)),auto]">
        <input
          aria-label="Search features"
          className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setFeatureSearch(event.target.value)}
          placeholder="Search features, summaries, applied choices..."
          type="search"
          value={featureSearch}
        />
        <select
          aria-label="Filter features by source"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setGroupFilter(event.target.value as "all" | FeatureGroupId)}
          value={groupFilter}
        >
          <option value="all">All Sources</option>
          {groups.map((group) => (
            <option key={`feature-group-${group.id}`} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter features by action profile"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setActionFilter(event.target.value as "all" | "actionable" | "passive")}
          value={actionFilter}
        >
          <option value="all">All Action Types</option>
          <option value="actionable">Actionable</option>
          <option value="passive">Passive / Utility</option>
        </select>
        <div className="flex items-center">
          <StatusBadge label={`${shownFeatures} shown`} status="info" />
        </div>
      </div>

      {shownFeatures === 0 ? (
        <EmptyState title="Feature Search" description="No features match the current filters." />
      ) : null}

      {filteredGroups.map((group) => (
        <section key={group.id} className="space-y-2">
          <SectionHeader actions={<StatusBadge label={`${group.features.length}`} status="info" />} title={group.label} />
          <div className="grid gap-2 lg:grid-cols-2">
            {group.features.map((feature) => (
              <FeatureCardShell
                key={feature.id}
                title={feature.name}
                subtitle={`${feature.sourceLabel}${feature.level ? ` · L${feature.level}` : ""}`}
                badges={
                  <>
                    {feature.actionType ? <StatusBadge status="info" label={feature.actionType} /> : null}
                    {feature.usesLabel ? <StatusBadge status="pending" label={feature.usesLabel} /> : null}
                    {feature.ruleChoiceLabels.map((label) => (
                      <StatusBadge key={label} label={label} status="complete" />
                    ))}
                    {feature.appliedSummaryLabels.map((label) => (
                      <StatusBadge key={label} label={label} status="info" />
                    ))}
                  </>
                }
              >
                <p className="text-sm text-slate-700">{feature.summary}</p>
                {feature.details ? (
                  <details className="mt-2 text-xs text-slate-600">
                    <summary aria-label={`Show details for ${feature.name}`} className="sheet-focus-ring cursor-pointer text-slate-700">
                      Details
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap">{feature.details}</p>
                  </details>
                ) : null}
              </FeatureCardShell>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
