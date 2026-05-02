import { useMemo, useState } from "react";
import { inputClassName } from "../../../components/ui/FormField";
import type { EquipmentDefinition } from "../../../domain/content";
import type { InventoryState } from "../../../domain/character";

type InventoryEditorProps = {
  catalog: EquipmentDefinition[];
  inventory: InventoryState;
  onChange: (next: InventoryState) => void;
};

export function InventoryEditor({ catalog, inventory, onChange }: InventoryEditorProps) {
  const [query, setQuery] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");

  const visibleCatalog = useMemo(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) {
      return catalog.slice(0, 100);
    }
    return catalog.filter((item) => item.name.toLowerCase().includes(lower) || item.key.toLowerCase().includes(lower)).slice(0, 100);
  }, [catalog, query]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className={inputClassName()} placeholder="Search equipment..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <button
          className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
          disabled={!selectedCatalogId}
          onClick={() => {
            const selected = visibleCatalog.find((item) => item.id === selectedCatalogId);
            if (!selected) {
              return;
            }
            const existing = inventory.items.find((item) => item.id === selected.id);
            if (existing) {
              onChange({
                items: inventory.items.map((item) => (item.id === selected.id ? { ...item, quantity: item.quantity + 1 } : item)),
              });
            } else {
              onChange({
                items: [...inventory.items, { id: selected.id, name: selected.name, quantity: 1 }],
              });
            }
          }}
          type="button"
        >
          Add Item
        </button>
      </div>

      <select className={inputClassName()} value={selectedCatalogId} onChange={(event) => setSelectedCatalogId(event.target.value)}>
        <option value="">Select equipment</option>
        {visibleCatalog.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} [{item.category}]
          </option>
        ))}
      </select>

      <div className="space-y-1 rounded border border-slate-200 p-2">
        {inventory.items.length === 0 ? (
          <p className="text-sm text-slate-500">No inventory items selected.</p>
        ) : (
          inventory.items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_90px_auto_auto] items-center gap-2">
              <span className="text-sm">{item.name}</span>
              <input
                className={inputClassName()}
                min={1}
                type="number"
                value={item.quantity}
                onChange={(event) => {
                  const nextQty = Math.max(1, Number(event.target.value) || 1);
                  onChange({
                    items: inventory.items.map((entry) => (entry.id === item.id ? { ...entry, quantity: nextQty } : entry)),
                  });
                }}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(item.equipped)}
                  onChange={(event) =>
                    onChange({
                      items: inventory.items.map((entry) =>
                        entry.id === item.id ? { ...entry, equipped: event.target.checked } : entry,
                      ),
                    })
                  }
                />
                Equipped
              </label>
              <button
                className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                onClick={() => onChange({ items: inventory.items.filter((entry) => entry.id !== item.id) })}
                type="button"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
