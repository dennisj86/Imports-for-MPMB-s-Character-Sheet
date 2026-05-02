import { useMemo, useState } from "react";
import { Panel } from "../components/ui/Panel";
import { inputClassName } from "../components/ui/FormField";
import {
  getBackgrounds,
  getClasses,
  getEquipmentCatalog,
  getFeats,
  getSpecies,
  getSpells,
  getSubclassesForClass,
  type EquipmentFilters,
  type SpellFilters,
} from "../services/data/adapter";
import { SourceSelectionPanel } from "../features/content/components/SourceSelectionPanel";
import { useSourceStore } from "../store/sourceStore";

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
  const [activeTab, setActiveTab] = useState<TabKey>("classes");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [spellLevelFilter, setSpellLevelFilter] = useState<number | "all">("all");
  const [equipmentCategory, setEquipmentCategory] = useState<EquipmentFilters["category"] | "all">("all");

  const classes = useMemo(() => getClasses(), [generation]);
  const species = useMemo(() => getSpecies(), [generation]);
  const backgrounds = useMemo(() => getBackgrounds(), [generation]);
  const feats = useMemo(() => getFeats(), [generation]);

  const subclassRows = useMemo(() => {
    const selectedClass = classFilter ? classes.find((entry) => entry.id === classFilter) : undefined;
    if (selectedClass) {
      return getSubclassesForClass(selectedClass.id);
    }
    return classes.flatMap((entry) => getSubclassesForClass(entry.id));
  }, [classFilter, classes, generation]);

  const spellRows = useMemo(() => {
    const filters: SpellFilters = {
      query,
      classKey: classFilter ? classes.find((entry) => entry.id === classFilter)?.key : undefined,
      level: spellLevelFilter === "all" ? undefined : spellLevelFilter,
    };
    return getSpells(filters);
  }, [classFilter, query, spellLevelFilter, classes, generation]);

  const equipmentRows = useMemo(() => {
    const filters: EquipmentFilters = {
      query,
      category: equipmentCategory === "all" ? undefined : equipmentCategory,
    };
    return getEquipmentCatalog(filters);
  }, [equipmentCategory, query, generation]);

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
        <div className="mb-3 grid gap-2 lg:grid-cols-4">
          <input className={inputClassName()} placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} />
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
                const value = event.target.value as EquipmentFilters["category"] | "all";
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
          This browser uses normalized declarative content only. Imperative MPMB hooks are intentionally ignored in Phase 1.
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
