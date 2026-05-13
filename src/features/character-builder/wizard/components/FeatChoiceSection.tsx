import { useMemo, useState } from "react";
import { inputClassName } from "../../../../components/ui/FormField";
import type { FeatChoiceContext, SpellChoiceContext } from "../../../../domain/builderWizard";

type FeatChoiceSectionProps = {
  contexts: FeatChoiceContext[];
  spellContexts: SpellChoiceContext[];
  onOpenSpellsStep?: () => void;
  onSelectFeat: (contextId: string, featId: string | undefined) => void;
  onSelectSubchoice: (subchoiceId: string, optionId: string | undefined) => void;
};

export function FeatChoiceSection({
  contexts,
  spellContexts,
  onOpenSpellsStep,
  onSelectFeat,
  onSelectSubchoice,
}: FeatChoiceSectionProps) {
  const [query, setQuery] = useState("");

  const queryLower = query.toLowerCase().trim();

  const filtered = useMemo(
    () =>
      contexts.map((context) => ({
        ...context,
        visibleFeats: context.eligibleFeats.filter((feat) => {
          if (!queryLower) {
            return true;
          }
          return feat.name.toLowerCase().includes(queryLower) || feat.key.toLowerCase().includes(queryLower);
        }),
      })),
    [contexts, queryLower],
  );

  if (contexts.length === 0) {
    return <p className="text-sm text-slate-500">No feat selections are required for the current state.</p>;
  }

  return (
    <div className="space-y-3">
      <input
        className={inputClassName()}
        placeholder="Search eligible feats..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {filtered.map((context) => (
        <section key={context.id} className="rounded border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{context.title}</h3>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                context.satisfied ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {context.satisfied ? "complete" : "pending"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">{context.description}</p>
          {context.notes.length > 0 ? (
            <div className="mt-2 space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {context.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
          <select
            className={`${inputClassName()} mt-2`}
            value={context.selectedFeatId ?? ""}
            onChange={(event) => onSelectFeat(context.id, event.target.value || undefined)}
          >
            <option value="">Select a legal feat</option>
            {context.visibleFeats.map((feat) => (
              <option key={feat.id} value={feat.id}>
                {feat.name}
              </option>
            ))}
          </select>
          {context.subchoices.length > 0 ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {context.subchoices.map((subchoice) => (
                <div key={subchoice.id} className="rounded border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-700">{subchoice.title}</p>
                  <p className="text-xs text-slate-500">{subchoice.description}</p>
                  <select
                    className={`${inputClassName()} mt-1`}
                    value={subchoice.selectedOptionId ?? ""}
                    onChange={(event) => onSelectSubchoice(subchoice.id, event.target.value || undefined)}
                  >
                    <option value="">Select</option>
                    {subchoice.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
          {context.selectedFeatId
            ? (() => {
                const relatedSpellContexts = spellContexts.filter((entry) => entry.source === "feat" && entry.sourceId === context.selectedFeatId);
                if (relatedSpellContexts.length === 0) {
                  return null;
                }
                return (
                  <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
                    <p className="font-medium">Spell Choices Owned By Spells Tab</p>
                    <div className="mt-1 space-y-1">
                      {relatedSpellContexts.map((entry) => (
                        <p key={entry.id}>
                          {entry.title}: {entry.selectedSpellIds.length}/{entry.requiredCount} ({entry.satisfied ? "complete" : "pending"})
                        </p>
                      ))}
                    </div>
                    <button
                      className="sheet-focus-ring mt-2 rounded bg-indigo-700 px-2 py-1 text-xs text-white"
                      onClick={onOpenSpellsStep}
                      type="button"
                    >
                      Complete spell choices in Spells
                    </button>
                  </div>
                );
              })()
            : null}
          {context.selectedFeatName ? <p className="mt-2 text-xs text-slate-600">Selected: {context.selectedFeatName}</p> : null}
        </section>
      ))}
    </div>
  );
}
