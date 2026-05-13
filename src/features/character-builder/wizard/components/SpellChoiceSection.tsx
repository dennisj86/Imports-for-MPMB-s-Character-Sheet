import { useMemo, useState } from "react";
import { inputClassName } from "../../../../components/ui/FormField";
import type { SpellChoiceContext } from "../../../../domain/builderWizard";
import { SpellOptionPreview, spellOptionSummary } from "./SpellOptionPreview";

type SpellChoiceSectionProps = {
  contexts: SpellChoiceContext[];
  onToggleSpell: (contextId: string, spellId: string, selected: boolean) => void;
};

type GroupKey =
  | "class-cantrip"
  | "class-leveled"
  | "class-prepared-pool"
  | "magic-initiate-cantrip"
  | "magic-initiate-level1"
  | "feat-other";

function groupKeyForContext(context: SpellChoiceContext): GroupKey {
  if (context.source === "class") {
    if (context.kind === "class-cantrip") return "class-cantrip";
    if (context.kind === "class-leveled") return "class-leveled";
    return "class-prepared-pool";
  }
  if (/magic initiate/i.test(context.title)) {
    if (context.kind === "feat-cantrip") return "magic-initiate-cantrip";
    if (context.kind === "feat-leveled") return "magic-initiate-level1";
  }
  return "feat-other";
}

const GROUP_TITLES: Record<GroupKey, string> = {
  "class-cantrip": "Class Cantrip Choices",
  "class-leveled": "Class Leveled Spell Choices",
  "class-prepared-pool": "Class Spell Pool",
  "magic-initiate-cantrip": "Magic Initiate Cantrips",
  "magic-initiate-level1": "Magic Initiate Level 1 Spell",
  "feat-other": "Feature / Feat Granted Spell Choices",
};

const GROUP_ORDER: GroupKey[] = [
  "class-cantrip",
  "class-leveled",
  "class-prepared-pool",
  "magic-initiate-cantrip",
  "magic-initiate-level1",
  "feat-other",
];

export function SpellChoiceSection({ contexts, onToggleSpell }: SpellChoiceSectionProps) {
  const [queryByContext, setQueryByContext] = useState<Record<string, string>>({});
  const [previewSpellIdByContext, setPreviewSpellIdByContext] = useState<Record<string, string | undefined>>({});

  const filteredByContext = useMemo(() => {
    return contexts.map((context) => {
      const query = (queryByContext[context.id] ?? "").toLowerCase().trim();
      const visibleSpells = context.eligibleSpells.filter((spell) => {
        if (!query) {
          return true;
        }
        return `${spell.name} ${spell.key} ${spell.school ?? ""} ${spell.castingTime ?? ""} ${spell.range ?? ""} ${spell.duration ?? ""}`
          .toLowerCase()
          .includes(query);
      });
      return {
        context,
        visibleSpells,
      };
    });
  }, [contexts, queryByContext]);
  const grouped = useMemo(() => {
    const byKey = new Map<GroupKey, Array<(typeof filteredByContext)[number]>>();
    for (const entry of filteredByContext) {
      const key = groupKeyForContext(entry.context);
      byKey.set(key, [...(byKey.get(key) ?? []), entry]);
    }
    return GROUP_ORDER
      .map((key) => ({ key, title: GROUP_TITLES[key], entries: byKey.get(key) ?? [] }))
      .filter((entry) => entry.entries.length > 0);
  }, [filteredByContext]);

  if (contexts.length === 0) {
    return <p className="text-sm text-slate-500">No spell selections are required for the current state.</p>;
  }

  return (
    <div className="space-y-3">
      {grouped.map((group) => (
        <section key={group.key} className="rounded border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
          <div className="mt-2 space-y-3">
            {group.entries.map(({ context, visibleSpells }) => {
              const selectedSet = new Set(context.selectedSpellIds);
              const maxSelections = context.maxSelections ?? context.requiredCount;
              const previewSpellId = previewSpellIdByContext[context.id];
              const previewSpell =
                (previewSpellId ? context.eligibleSpells.find((spell) => spell.id === previewSpellId) : undefined) ??
                context.eligibleSpells.find((spell) => selectedSet.has(spell.id)) ??
                visibleSpells[0];
              return (
                <div key={context.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{context.title}</h4>
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
                  {previewSpell ? (
                    <SpellOptionPreview
                      automationStatus="partial"
                      heading="Spell Choice Preview"
                      id={`spell-choice-preview-${context.id}`}
                      sourceLabel={context.title}
                      spell={previewSpell}
                    />
                  ) : null}
                  <input
                    aria-label={`Search legal spells for ${context.title}`}
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
                  <div className="mt-2 max-h-72 space-y-1 overflow-auto rounded border border-slate-200 bg-white p-2">
                    {visibleSpells.length === 0 ? (
                      <p className="text-xs text-slate-500">No legal spells found for this context.</p>
                    ) : (
                      visibleSpells.map((spell) => {
                        const selected = selectedSet.has(spell.id);
                        const blockedByLimit = !selected && maxSelections > 0 && context.selectedSpellIds.length >= maxSelections;
                        return (
                          <label
                            key={spell.id}
                            className={`flex items-start gap-2 rounded border px-2 py-1 text-sm ${blockedByLimit ? "opacity-60" : "hover:bg-slate-100"}`}
                            onMouseEnter={() =>
                              setPreviewSpellIdByContext((current) => ({ ...current, [context.id]: spell.id }))
                            }
                          >
                            <input
                              className="mt-1"
                              type="checkbox"
                              checked={selected}
                              disabled={blockedByLimit}
                              onChange={(event) => onToggleSpell(context.id, spell.id, event.target.checked)}
                              onFocus={() =>
                                setPreviewSpellIdByContext((current) => ({ ...current, [context.id]: spell.id }))
                              }
                            />
                            <span>
                              <span className="font-medium">{spell.name}</span>
                              <span className="block text-xs text-slate-500">{spellOptionSummary(spell)}</span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
