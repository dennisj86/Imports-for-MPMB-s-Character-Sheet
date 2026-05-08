import { useMemo, useState } from "react";
import { Panel } from "../../../components/ui/Panel";
import { inputClassName } from "../../../components/ui/FormField";
import { resolveSourceProvider } from "../../../services/data/sourceProvider";
import type { SourcePreset } from "../sourceSelectionService";
import { useSourceStore } from "../../../store/sourceStore";

const presets: Array<{ key: SourcePreset; label: string }> = [
  { key: "all", label: "All Sources" },
  { key: "provider-mpmb", label: "Provider: MPMB" },
  { key: "provider-open5e", label: "Provider: Open5e" },
  { key: "official-handbooks", label: "Official Handbooks" },
  { key: "official-books", label: "Official Books" },
  { key: "adventure", label: "Adventure Books" },
  { key: "ua", label: "Unearthed Arcana" },
  { key: "mpmb-upstream-2014-core", label: "MPMB Upstream 2014 Core" },
  { key: "mpmb-upstream-2024-core", label: "MPMB Upstream 2024 Core" },
  { key: "mpmb-pdf-core", label: "MPMB PDF Core" },
  { key: "open5e-2014", label: "Open5e 2014" },
  { key: "open5e-2024", label: "Open5e 2024" },
  { key: "open5e-both", label: "Open5e 2014+2024" },
];

export function SourceSelectionPanel() {
  const [query, setQuery] = useState("");
  const availableSources = useSourceStore((state) => state.availableSources);
  const generation = useSourceStore((state) => state.generation);
  const draftSelectedSourceKeys = useSourceStore((state) => state.draftSelectedSourceKeys);
  const activeSourceKeys = useSourceStore((state) => state.activeSourceKeys);
  const lastRegeneratedAt = useSourceStore((state) => state.lastRegeneratedAt);
  const lastStats = useSourceStore((state) => state.lastStats);
  const toggleDraftSourceKey = useSourceStore((state) => state.toggleDraftSourceKey);
  const applyPresetToDraft = useSourceStore((state) => state.applyPresetToDraft);
  const selectAllDraft = useSourceStore((state) => state.selectAllDraft);
  const clearDraft = useSourceStore((state) => state.clearDraft);
  const resetDraftToActive = useSourceStore((state) => state.resetDraftToActive);
  const regenerate = useSourceStore((state) => state.regenerate);

  const draftSelectionSet = useMemo(() => new Set(draftSelectedSourceKeys), [draftSelectedSourceKeys]);
  const hasPendingChanges = useMemo(() => {
    if (draftSelectedSourceKeys.length !== activeSourceKeys.length) {
      return true;
    }
    const active = new Set(activeSourceKeys);
    return draftSelectedSourceKeys.some((key) => !active.has(key));
  }, [activeSourceKeys, draftSelectedSourceKeys]);

  const visibleSources = useMemo(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) {
      return availableSources;
    }
    return availableSources.filter((source) => {
      const group = source.group ?? "";
      return (
        source.name.toLowerCase().includes(lower) ||
        source.key.toLowerCase().includes(lower) ||
        group.toLowerCase().includes(lower) ||
        (source.abbreviation ?? "").toLowerCase().includes(lower)
      );
    });
  }, [availableSources, query]);
  const open5eSourceCount = useMemo(
    () => availableSources.filter((source) => resolveSourceProvider(source) === "open5e").length,
    [availableSources],
  );
  const mpmbSourceCount = useMemo(
    () => availableSources.filter((source) => resolveSourceProvider(source) === "mpmb").length,
    [availableSources],
  );

  return (
    <Panel
      title="Data Sources"
      rightSlot={
        <button
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-300"
          disabled={!hasPendingChanges}
          onClick={() => regenerate()}
          type="button"
        >
          Regenerate
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.key}
              className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 hover:bg-slate-300"
              onClick={() => applyPresetToDraft(preset.key)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
          <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 hover:bg-slate-300" onClick={() => selectAllDraft()} type="button">
            Select All
          </button>
          <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 hover:bg-slate-300" onClick={() => clearDraft()} type="button">
            Clear
          </button>
          <button
            className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 hover:bg-slate-300"
            onClick={() => resetDraftToActive()}
            type="button"
          >
            Reset Draft
          </button>
        </div>

        <input
          className={inputClassName()}
          placeholder="Search books/sources..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="max-h-64 space-y-1 overflow-auto rounded border border-slate-200 p-2">
          {visibleSources.map((source) => (
            <label key={source.key} className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-slate-100">
              <input
                className="mt-1"
                type="checkbox"
                checked={draftSelectionSet.has(source.key)}
                onChange={() => toggleDraftSourceKey(source.key)}
              />
              <span className="text-sm">
                <span className="font-medium">
                  {source.name}
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                    {resolveSourceProvider(source)}
                  </span>
                </span>
                <span className="block text-xs text-slate-500">
                  {source.key}
                  {source.group ? ` · ${source.group}` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <p>
            Active sources: <strong>{activeSourceKeys.length}</strong> / {availableSources.length}
          </p>
          <p>
            Providers: <strong>{mpmbSourceCount}</strong> MPMB · <strong>{open5eSourceCount}</strong> Open5e
          </p>
          <p>
            Draft selection: <strong>{draftSelectedSourceKeys.length}</strong>
          </p>
          {lastRegeneratedAt ? <p>Last regenerate: {new Date(lastRegeneratedAt).toLocaleString()}</p> : null}
          {lastStats ? (
            <p>
              Loaded: {lastStats.classCount} classes, {lastStats.subclassCount} subclasses, {lastStats.speciesCount} species, {lastStats.spellCount} spells
            </p>
          ) : (
            <p>Generation: {generation}</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
