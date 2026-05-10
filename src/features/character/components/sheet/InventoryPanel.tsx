import type { InventoryItemViewModel, InventoryViewModel } from "../../viewModels/inventoryViewModel";

interface InventoryPanelProps {
  viewModel: InventoryViewModel;
  onEquipItem: (itemInstanceId: string, slot?: InventoryItemViewModel["equipmentSlot"]) => void;
  onUnequipItem: (itemInstanceId: string) => void;
}

function ItemList({
  title,
  items,
  onEquipItem,
  onUnequipItem,
}: {
  title: string;
  items: InventoryItemViewModel[];
  onEquipItem: InventoryPanelProps["onEquipItem"];
  onUnequipItem: InventoryPanelProps["onUnequipItem"];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase text-slate-500">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">None.</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-600">
                    {item.category}
                    {item.type ? ` · ${item.type}` : ""}
                    {item.quantity !== 1 ? ` · x${item.quantity}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.equipped ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Equipped</span> : null}
                  {item.equipmentSlot ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{item.equipmentSlot}</span> : null}
                </div>
              </div>
              {item.relevantStats.length ? <p className="mt-2 text-xs text-slate-700">{item.relevantStats.join(" · ")}</p> : null}
              {item.mappingBadges.length ? <p className="mt-2 text-xs text-slate-600">{item.mappingBadges.join(" · ")}</p> : null}
              {item.canEquip ? (
                <div className="mt-3 flex gap-2">
                  {item.equipped ? (
                    <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => onUnequipItem(item.instanceId)} type="button">
                      Unequip
                    </button>
                  ) : (
                    <button className="rounded bg-slate-700 px-2 py-1 text-xs text-white" onClick={() => onEquipItem(item.instanceId, item.equipmentSlot)} type="button">
                      Equip
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InventoryPanel({ viewModel, onEquipItem, onUnequipItem }: InventoryPanelProps) {
  const ac = viewModel.armorClass;
  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="text-xs uppercase text-slate-500">AC Breakdown</p>
        <p className="mt-1 text-lg font-semibold">{ac.total}</p>
        <p className="text-slate-700">
          Base {ac.armorBase}
          {ac.armorName ? ` (${ac.armorName})` : ""} · Dex {ac.dexApplied >= 0 ? "+" : ""}
          {ac.dexApplied} · Shield +{ac.shieldBonus} · Bonus +{ac.bonus}
        </p>
        {ac.shieldName ? <p className="text-xs text-slate-600">Shield: {ac.shieldName}</p> : null}
        {ac.bonusSources.length ? <p className="text-xs text-slate-600">Bonus sources: {ac.bonusSources.join(", ")}</p> : null}
      </div>

      <ItemList title="Armor" items={viewModel.armor} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
      <ItemList title="Shields" items={viewModel.shields} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
      <ItemList title="Weapons" items={viewModel.weapons} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
      <ItemList title="Other Items" items={viewModel.other} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
      {viewModel.unresolvedItems.length ? (
        <ItemList title="Unresolved Items" items={viewModel.unresolvedItems} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
      ) : null}
    </div>
  );
}
