import { useMemo, useState } from "react";
import { inputClassName } from "../../../components/ui/FormField";
import type { FeatDefinition } from "../../../domain/content";

type FeatSelectionPanelProps = {
  feats: FeatDefinition[];
  selectedFeatIds: string[];
  onChange: (next: string[]) => void;
};

export function FeatSelectionPanel({ feats, selectedFeatIds, onChange }: FeatSelectionPanelProps) {
  const [query, setQuery] = useState("");

  const visibleFeats = useMemo(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) {
      return feats;
    }
    return feats.filter((feat) => feat.name.toLowerCase().includes(lower) || feat.key.toLowerCase().includes(lower));
  }, [feats, query]);

  return (
    <div className="space-y-2">
      <input
        className={inputClassName()}
        placeholder="Search feats..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-72 space-y-1 overflow-auto rounded border border-slate-200 p-2">
        {visibleFeats.map((feat) => {
          const selected = selectedFeatIds.includes(feat.id);
          return (
            <label key={feat.id} className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-slate-100">
              <input
                className="mt-1"
                type="checkbox"
                checked={selected}
                onChange={() => {
                  if (selected) {
                    onChange(selectedFeatIds.filter((entry) => entry !== feat.id));
                  } else {
                    onChange([...selectedFeatIds, feat.id]);
                  }
                }}
              />
              <span className="text-sm">
                <span className="font-medium">{feat.name}</span>
                {feat.prerequisite ? <span className="block text-xs text-slate-500">Prerequisite: {feat.prerequisite}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
