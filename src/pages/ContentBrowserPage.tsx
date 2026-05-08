import { useEffect, useMemo, useState } from "react";
import { Panel } from "../components/ui/Panel";
import { inputClassName } from "../components/ui/FormField";
import type { EquipmentDefinition, RulesMode } from "../domain/content";
import { useContentBrowserV2State } from "../features/content/useContentBrowserV2State";
import { SourceSelectionPanel } from "../features/content/components/SourceSelectionPanel";
import { useSourceStore } from "../store/sourceStore";
import type { CoreProviderSelection } from "../services/mpmbCore";

type TabKey = "classes" | "subclasses" | "species" | "backgrounds" | "feats" | "spells" | "equipment";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "classes", label: "Classes" },
  { key: "subclasses", label: "Subclasses" },
  { key: "species", label: "Species" },
  { key: "backgrounds", label: "Backgrounds" },
  { key: "feats", label: "Feats" },
  { key: "spells", label: "Spells" },
  { key: "equipment", label: "Equipment" },
];

export function ContentBrowserPage() {
  const generation = useSourceStore((state) => state.generation);
  const activeSourceKeys = useSourceStore((state) => state.activeSourceKeys);
  const [activeTab, setActiveTab] = useState<TabKey>("classes");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [provider, setProvider] = useState<CoreProviderSelection>("all");
  const [rulesMode, setRulesMode] = useState<RulesMode>("2024");
  const [spellLevelFilter, setSpellLevelFilter] = useState<number | "all">("all");
  const [equipmentCategory, setEquipmentCategory] = useState<EquipmentDefinition["category"] | "all">("all");

  const content = useContentBrowserV2State(
    activeSourceKeys,
    {
      provider,
      rulesMode,
    },
    generation,
  );

  const classes = content.classes;
  const species = content.species;
  const backgrounds = content.backgrounds;
  const feats = content.feats;

  useEffect(() => {
    if (classFilter && !classes.some((entry) => entry.id === classFilter)) {
      setClassFilter("");
    }
  }, [classFilter, classes]);

  const subclassRows = useMemo(() => {
    const selectedClass = classFilter ? classes.find((entry) => entry.id === classFilter) : undefined;
    if (selectedClass) {
      return content.resolveSubclassesForClass(selectedClass.id);
    }
    return classes.flatMap((entry) => content.resolveSubclassesForClass(entry.id));
  }, [classFilter, classes, content]);

  const spellRows = useMemo(() => {
    return content.filterSpells({
      query,
      classKey: classFilter ? classes.find((entry) => entry.id === classFilter)?.key : undefined,
      level: spellLevelFilter === "all" ? undefined : spellLevelFilter,
    });
  }, [classFilter, classes, content, query, spellLevelFilter]);

  const equipmentRows = useMemo(() => {
    return content.filterEquipment({
      query,
      category: equipmentCategory === "all" ? undefined : equipmentCategory,
    });
  }, [content, equipmentCategory, query]);

  return (
    <div className="space-y-4">
      <SourceSelectionPanel />

      <header className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded px-3 py-1.5 text-sm ${activeTab === tab.key ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-800"}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </header>

      <Panel title={`${tabs.find((tab) => tab.key === activeTab)?.label ?? ""} Browser`}>
        <div className="mb-3 grid gap-2 lg:grid-cols-6">
          <input className={inputClassName()} placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className={inputClassName()} value={provider} onChange={(event) => setProvider(event.target.value as CoreProviderSelection)}>
            <option value="all">All providers</option>
            <option value="mpmb">MPMB</option>
            <option value="open5e">Open5e</option>
          </select>
          <select className={inputClassName()} value={rulesMode} onChange={(event) => setRulesMode(event.target.value as RulesMode)}>
            <option value="2014">Rules 2014</option>
            <option value="2024">Rules 2024</option>
          </select>
          <select className={inputClassName()} value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="">All classes</option>
            {classes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          {activeTab === "spells" ? (
            <select
              className={inputClassName()}
              value={spellLevelFilter}
              onChange={(event) => setSpellLevelFilter(event.target.value === "all" ? "all" : Number(event.target.value))}
            >
              <option value="all">All levels</option>
              {Array.from({ length: 10 }, (_, index) => (
                <option key={index} value={index}>
                  {index === 0 ? "Cantrip" : `Level ${index}`}
                </option>
              ))}
            </select>
          ) : null}
          {activeTab === "equipment" ? (
            <select
              className={inputClassName()}
              value={equipmentCategory}
              onChange={(event) => {
                const value = event.target.value as EquipmentDefinition["category"] | "all";
                setEquipmentCategory(value);
              }}
            >
              <option value="all">All equipment</option>
              <option value="magic-item">Magic items</option>
              <option value="weapon">Weapons</option>
              <option value="armor">Armor</option>
              <option value="gear">Gear</option>
              <option value="ammo">Ammo</option>
            </select>
          ) : null}
        </div>

        {activeTab === "classes" && <SimpleList rows={filterByQuery(classes, query)} subtitle={(row) => row.sourceRefs.join(", ")} />}
        {activeTab === "subclasses" && <SimpleList rows={filterByQuery(subclassRows, query)} subtitle={(row) => row.classKey} />}
        {activeTab === "species" && <SimpleList rows={filterByQuery(species, query)} subtitle={(row) => row.sourceRefs.join(", ")} />}
        {activeTab === "backgrounds" && <SimpleList rows={filterByQuery(backgrounds, query)} subtitle={(row) => row.skillText ?? "No skill text"} />}
        {activeTab === "feats" && <SimpleList rows={filterByQuery(feats, query)} subtitle={(row) => row.prerequisite ?? "No prerequisite"} />}
        {activeTab === "spells" && (
          <SimpleList
            rows={spellRows}
            subtitle={(row) => `${row.level === 0 ? "Cantrip" : `Level ${row.level}`} · ${row.school ?? "Unknown school"}`}
          />
        )}
        {activeTab === "equipment" && <SimpleList rows={equipmentRows} subtitle={(row) => `${row.category}${row.rarity ? ` · ${row.rarity}` : ""}`} />}
      </Panel>

      <Panel title="Data Notes">
        <p className="text-sm text-slate-600">
          This browser resolves content through the V2 core registry (`provider` + `rulesMode`) with active source selection from the V2 source store.
        </p>
      </Panel>
    </div>
  );
}

function filterByQuery<T extends { name: string; key: string }>(rows: T[], query: string): T[] {
  const lower = query.toLowerCase().trim();
  if (!lower) {
    return rows;
  }
  return rows.filter((row) => row.name.toLowerCase().includes(lower) || row.key.toLowerCase().includes(lower));
}

function SimpleList<T extends { id: string; name: string }>({ rows, subtitle }: { rows: T[]; subtitle: (row: T) => string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No entries found.</p>;
  }
  return (
    <ul className="max-h-[70vh] space-y-2 overflow-auto">
      {rows.map((row) => (
        <li key={row.id} className="rounded border border-slate-200 p-2">
          <p className="text-sm font-medium">{row.name}</p>
          <p className="text-xs text-slate-500">{subtitle(row)}</p>
        </li>
      ))}
    </ul>
  );
}
