import { useMemo, useState } from "react";
import type { InventoryItemViewModel, InventoryViewModel } from "../../viewModels/inventoryViewModel";
import { EmptyState, InfoPopover, InventoryItemCard, SectionHeader, StatusBadge } from "./SheetDesignSystem";
import { RuleDetailDrawer } from "./RuleDetailDrawer";
import { normalizeRuleAutomationStatus, ruleAutomationTone } from "./ruleAutomationStatus";
import { ruleInfo } from "./rulesInfo";

interface InventoryPanelProps {
  viewModel: InventoryViewModel;
  onEquipItem: (itemInstanceId: string, slot?: InventoryItemViewModel["equipmentSlot"]) => void;
  onUnequipItem: (itemInstanceId: string) => void;
  onSetCurrency: (denomination: "cp" | "sp" | "ep" | "gp" | "pp", amount: number) => void;
  onAdjustCurrency: (denomination: "cp" | "sp" | "ep" | "gp" | "pp", delta: number) => void;
}

const CURRENCY_KEYS: Array<"cp" | "sp" | "ep" | "gp" | "pp"> = ["cp", "sp", "ep", "gp", "pp"];

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
  const [detailsOpenByItemId, setDetailsOpenByItemId] = useState<Record<string, boolean>>({});
  return (
    <section className="space-y-2">
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <EmptyState title={title} description="None." />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((item) => (
            <li key={item.instanceId}>
              <InventoryItemCard
                title={item.name}
                subtitle={`${item.category}${item.type ? ` · ${item.type}` : ""}${item.quantity !== 1 ? ` · x${item.quantity}` : ""}`}
                badges={
                  <>
                    {item.equipped ? <StatusBadge label="equipped" status="complete" /> : <StatusBadge label="stowed" status="pending" />}
                    {item.equipmentSlot ? <StatusBadge label={item.equipmentSlot} status="info" /> : null}
                    <StatusBadge label={item.automationStatus} status={ruleAutomationTone(normalizeRuleAutomationStatus(item.automationStatus, "unknown"))} />
                  </>
                }
                actions={
                  <div className="flex flex-wrap gap-2">
                    {item.canEquip ? (
                      item.equipped ? (
                        <button
                          aria-label={`Unequip ${item.name}`}
                          className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                          onClick={() => onUnequipItem(item.instanceId)}
                          type="button"
                        >
                          Unequip
                        </button>
                      ) : (
                        <button
                          aria-label={`Equip ${item.name}`}
                          className="sheet-focus-ring rounded bg-slate-800 px-2 py-1 text-xs text-white"
                          onClick={() => onEquipItem(item.instanceId, item.equipmentSlot)}
                          type="button"
                        >
                          Equip
                        </button>
                      )
                    ) : null}
                    <button
                      aria-controls={`inventory-detail-${item.instanceId}`}
                      aria-expanded={detailsOpenByItemId[item.instanceId] ?? false}
                      aria-label={`Toggle details for ${item.name}`}
                      className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-800"
                      onClick={() =>
                        setDetailsOpenByItemId((current) => ({
                          ...current,
                          [item.instanceId]: !(current[item.instanceId] ?? false),
                        }))
                      }
                      type="button"
                    >
                      Details
                    </button>
                  </div>
                }
              >
                {item.relevantStats.length ? <p className="text-xs text-slate-700">{item.relevantStats.join(" · ")}</p> : null}
                {item.damageInfo || item.armorInfo || item.weightLabel ? (
                  <p className="text-xs text-slate-700">
                    {[item.damageInfo ? `Damage ${item.damageInfo}` : undefined, item.armorInfo ? `Armor ${item.armorInfo}` : undefined, item.weightLabel].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {item.mappingBadges.length ? (
                  <div className="flex flex-wrap gap-1">
                    {item.mappingBadges.map((badge) => (
                      <span key={`${item.instanceId}-${badge}`} className="inline-flex items-center gap-1">
                        <StatusBadge label={badge} status="info" />
                        <InfoPopover title={badge} description={ruleInfo("weapon-mastery")} />
                      </span>
                    ))}
                  </div>
                ) : null}
                {(item.propertyLabels.length || item.consumableStatus) ? (
                  <p className="text-xs text-slate-600">
                    {[
                      item.propertyLabels.length ? `Properties: ${item.propertyLabels.join(", ")}` : undefined,
                      item.consumableStatus ? `Status: ${item.consumableStatus}` : undefined,
                    ].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {detailsOpenByItemId[item.instanceId] ? (
                  <RuleDetailDrawer
                    detail={{
                      name: item.name,
                      source: item.sourceLabel ? `${item.category} · ${item.sourceLabel}` : item.category,
                      timing: item.equipped ? "equipped/passive" : "inventory/stowed",
                      cost: item.consumableStatus,
                      description: item.description,
                      gameplaySummary: `${item.type ?? item.category}${item.quantity !== 1 ? ` · x${item.quantity}` : ""}`,
                      automationStatus: item.automationStatus,
                      manualInstructions: item.manualInstructions,
                      knownLimitations: item.knownLimitations,
                      fields: [
                        { label: "Item Type", value: item.type ?? item.category },
                        { label: "Equipped State", value: item.equipped ? `equipped${item.equipmentSlot ? ` (${item.equipmentSlot})` : ""}` : "stowed" },
                        { label: "Weight", value: item.weightLabel },
                        { label: "Damage", value: item.damageInfo },
                        { label: "Armor", value: item.armorInfo },
                        { label: "Properties", value: item.propertyLabels.join(", ") || undefined },
                        { label: "Weapon Mastery", value: item.masteryName },
                        { label: "Consumable/Ammo", value: item.consumableStatus },
                      ],
                    }}
                    heading="Item Details"
                    id={`inventory-detail-${item.instanceId}`}
                  />
                ) : null}
              </InventoryItemCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InventoryPanel({ viewModel, onEquipItem, onUnequipItem, onSetCurrency, onAdjustCurrency }: InventoryPanelProps) {
  const [itemSearch, setItemSearch] = useState("");
  const [equipFilter, setEquipFilter] = useState<"all" | "equipped" | "stowed">("all");
  const ac = viewModel.armorClass;
  const normalizedSearch = itemSearch.trim().toLowerCase();
  const matchesFilters = (item: InventoryItemViewModel): boolean => {
    const searchMatch =
      normalizedSearch.length === 0
      || `${item.name} ${item.category} ${item.type ?? ""} ${item.relevantStats.join(" ")} ${item.mappingBadges.join(" ")} ${item.propertyLabels.join(" ")} ${item.damageInfo ?? ""} ${item.armorInfo ?? ""} ${item.description ?? ""}`.toLowerCase().includes(normalizedSearch);
    const equipMatch = equipFilter === "all" ? true : equipFilter === "equipped" ? item.equipped : !item.equipped;
    return searchMatch && equipMatch;
  };
  const filteredArmor = useMemo(() => viewModel.armor.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.armor]);
  const filteredShields = useMemo(() => viewModel.shields.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.shields]);
  const filteredWeapons = useMemo(() => viewModel.weapons.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.weapons]);
  const filteredOther = useMemo(() => viewModel.other.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.other]);
  const filteredUnresolved = useMemo(() => viewModel.unresolvedItems.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.unresolvedItems]);
  const totalFilteredCount = filteredArmor.length + filteredShields.length + filteredWeapons.length + filteredOther.length + filteredUnresolved.length;
  return (
    <div className="space-y-4">
      <div className="sheet-card border-indigo-200 bg-indigo-50/60 p-3 text-sm">
        <SectionHeader
          actions={<StatusBadge label={`${viewModel.currencyTotalGp.toFixed(2)} gp`} status="info" />}
          subtitle="Track coin totals directly on the sheet."
          title="Currency"
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {CURRENCY_KEYS.map((currency) => (
            <div key={`currency-${currency}`} className="sheet-card space-y-2 p-2">
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium uppercase text-slate-600">{currency}</p>
                <InfoPopover title={currency.toUpperCase()} description={ruleInfo(currency)} />
              </div>
              <input
                aria-label={`Set ${currency} amount`}
                className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                min={0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  onSetCurrency(currency, Number.isFinite(next) ? next : 0);
                }}
                type="number"
                value={viewModel.currency[currency]}
              />
              <div className="grid grid-cols-2 gap-1">
                <button
                  aria-label={`Subtract one ${currency}`}
                  className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                  onClick={() => onAdjustCurrency(currency, -1)}
                  type="button"
                >
                  -1
                </button>
                <button
                  aria-label={`Add one ${currency}`}
                  className="sheet-focus-ring rounded bg-slate-800 px-2 py-1 text-xs text-white"
                  onClick={() => onAdjustCurrency(currency, 1)}
                  type="button"
                >
                  +1
                </button>
                <button
                  aria-label={`Subtract ten ${currency}`}
                  className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                  onClick={() => onAdjustCurrency(currency, -10)}
                  type="button"
                >
                  -10
                </button>
                <button
                  aria-label={`Add ten ${currency}`}
                  className="sheet-focus-ring rounded bg-slate-800 px-2 py-1 text-xs text-white"
                  onClick={() => onAdjustCurrency(currency, 10)}
                  type="button"
                >
                  +10
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sheet-card grid gap-2 p-3 md:grid-cols-[minmax(0,2fr),repeat(2,minmax(0,1fr))]">
        <input
          aria-label="Search inventory items"
          className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setItemSearch(event.target.value)}
          placeholder="Search items, stats, mappings..."
          type="search"
          value={itemSearch}
        />
        <select
          aria-label="Filter inventory by equipped state"
          className="sheet-no-overflow rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setEquipFilter(event.target.value as "all" | "equipped" | "stowed")}
          value={equipFilter}
        >
          <option value="all">All Items</option>
          <option value="equipped">Equipped</option>
          <option value="stowed">Stowed</option>
        </select>
        <div className="flex items-center">
          <StatusBadge label={`${totalFilteredCount} shown`} status="info" />
        </div>
      </div>

      <div className="sheet-card border-indigo-200 bg-indigo-50/60 p-3 text-sm">
        <SectionHeader title="AC Breakdown" subtitle="Armor and shield state in effect" />
        <p className="mt-2 text-2xl font-semibold text-slate-950">{ac.total}</p>
        <p className="text-slate-700">
          Base {ac.armorBase}
          {ac.armorName ? ` (${ac.armorName})` : ""} · Dex {ac.dexApplied >= 0 ? "+" : ""}
          {ac.dexApplied} · Shield +{ac.shieldBonus} · Bonus +{ac.bonus}
        </p>
        {ac.shieldName ? <p className="text-xs text-slate-600">Shield: {ac.shieldName}</p> : null}
        {ac.bonusSources.length ? <p className="text-xs text-slate-600">Bonus sources: {ac.bonusSources.join(", ")}</p> : null}
        {ac.warnings.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {ac.warnings.map((warning) => (
              <StatusBadge key={warning} label={warning} status="pending" />
            ))}
          </div>
        ) : null}
      </div>

      {totalFilteredCount === 0 ? (
        <EmptyState title="Inventory Search" description="No inventory entries match the current filters." />
      ) : (
        <>
          <ItemList title="Armor" items={filteredArmor} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
          <ItemList title="Shields" items={filteredShields} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
          <ItemList title="Weapons" items={filteredWeapons} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
          <ItemList title="Other Items" items={filteredOther} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
          {filteredUnresolved.length ? (
            <ItemList title="Unresolved Items" items={filteredUnresolved} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
          ) : null}
        </>
      )}
    </div>
  );
}
