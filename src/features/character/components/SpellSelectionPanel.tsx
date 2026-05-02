import { useMemo, useState } from "react";
import { inputClassName } from "../../../components/ui/FormField";
import type { SpellDefinition } from "../../../domain/content";

type SpellSelectionPanelProps = {
  spells: SpellDefinition[];
  classKey?: string;
  selectedSpellIds: string[];
  onChange: (next: string[]) => void;
};

export function SpellSelectionPanel({ spells, classKey, selectedSpellIds, onChange }: SpellSelectionPanelProps) {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | "all">("all");
  const [classOnly, setClassOnly] = useState(true);

  const visibleSpells = useMemo(() => {
    const lower = query.toLowerCase().trim();
    return spells.filter((spell) => {
      if (lower && !spell.name.toLowerCase().includes(lower) && !spell.key.toLowerCase().includes(lower)) {
        return false;
      }
      if (levelFilter !== "all" && spell.level !== levelFilter) {
        return false;
      }
      if (classOnly && classKey && !spell.classes.includes(classKey.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [classKey, classOnly, levelFilter, query, spells]);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={inputClassName()} placeholder="Search spells..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <select
          className={inputClassName()}
          value={levelFilter}
          onChange={(event) => {
            const value = event.target.value;
            setLevelFilter(value === "all" ? "all" : Number(value));
          }}
        >
          <option value="all">All levels</option>
          {Array.from({ length: 10 }, (_, index) => (
            <option key={index} value={index}>
              {index === 0 ? "Cantrip" : `Level ${index}`}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <input checked={classOnly} disabled={!classKey} type="checkbox" onChange={(event) => setClassOnly(event.target.checked)} />
          Selected class only
        </label>
      </div>
      <div className="max-h-80 space-y-1 overflow-auto rounded border border-slate-200 p-2">
        {visibleSpells.map((spell) => {
          const selected = selectedSpellIds.includes(spell.id);
          return (
            <label key={spell.id} className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-slate-100">
              <input
                className="mt-1"
                type="checkbox"
                checked={selected}
                onChange={() => {
                  if (selected) {
                    onChange(selectedSpellIds.filter((entry) => entry !== spell.id));
                  } else {
                    onChange([...selectedSpellIds, spell.id]);
                  }
                }}
              />
              <span className="text-sm">
                <span className="font-medium">{spell.name}</span>
                <span className="block text-xs text-slate-500">
                  {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`} · {spell.school ?? "Unknown school"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
