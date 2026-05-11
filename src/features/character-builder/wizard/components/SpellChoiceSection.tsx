import { useMemo, useState } from "react";
import { inputClassName } from "../../../../components/ui/FormField";
import type { SpellChoiceContext } from "../../../../domain/builderWizard";

type SpellChoiceSectionProps = {
  contexts: SpellChoiceContext[];
  onToggleSpell: (contextId: string, spellId: string, selected: boolean) => void;
};

export function SpellChoiceSection({ contexts, onToggleSpell }: SpellChoiceSectionProps) {
  const [queryByContext, setQueryByContext] = useState<Record<string, string>>({});

  const filteredByContext = useMemo(() => {
    return contexts.map((context) => {
      const query = (queryByContext[context.id] ?? "").toLowerCase().trim();
      const visibleSpells = context.eligibleSpells.filter((spell) => {
        if (!query) {
          return true;
        }
        return spell.name.toLowerCase().includes(query) || spell.key.toLowerCase().includes(query);
      });
      return {
        context,
        visibleSpells,
      };
    });
  }, [contexts, queryByContext]);

  if (contexts.length === 0) {
    return <p className="text-sm text-slate-500">No spell selections are required for the current state.</p>;
  }

  return (
    <div className="space-y-3">
      {filteredByContext.map(({ context, visibleSpells }) => {
        const selectedSet = new Set(context.selectedSpellIds);
        const maxSelections = context.maxSelections ?? context.requiredCount;
        return (
          <section key={context.id} className="rounded border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{context.title}</h3>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  context.satisfied ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {context.satisfied ? "complete" : "pending"}{" "}
                {context.requiredCount > 0 ? `${context.selectedSpellIds.length}/${context.requiredCount}` : context.selectedSpellIds.length}
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
            <input
              className={`${inputClassName()} mt-2`}
              placeholder="Search legal spells..."
              value={queryByContext[context.id] ?? ""}
              onChange={(event) =>
                setQueryByContext((current) => ({
                  ...current,
                  [context.id]: event.target.value,
                }))
              }
            />
            <div className="mt-2 max-h-72 space-y-1 overflow-auto rounded border border-slate-200 p-2">
              {visibleSpells.length === 0 ? (
                <p className="text-xs text-slate-500">No legal spells found for this context.</p>
              ) : (
                visibleSpells.map((spell) => {
                  const selected = selectedSet.has(spell.id);
                  const blockedByLimit = !selected && maxSelections > 0 && context.selectedSpellIds.length >= maxSelections;
                  return (
                    <label key={spell.id} className={`flex items-start gap-2 rounded p-1 text-sm ${blockedByLimit ? "opacity-60" : "hover:bg-slate-100"}`}>
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={selected}
                        disabled={blockedByLimit}
                        onChange={(event) => onToggleSpell(context.id, spell.id, event.target.checked)}
                      />
                      <span>
                        <span className="font-medium">{spell.name}</span>
                        <span className="block text-xs text-slate-500">
                          {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`} · {spell.school ?? "Unknown school"}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

