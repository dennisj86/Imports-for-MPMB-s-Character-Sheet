import { useMemo, useState } from "react";
import type { CurrencyState, InventoryItemType } from "../../../../domain/character";
import type { InventoryItemViewModel, InventoryViewModel, SpellMaterialNeedViewModel } from "../../viewModels/inventoryViewModel";
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
  onNormalizeCurrency: () => void;
  onApplyCurrencyTransaction: (input: { mode: "add" | "subtract"; denomination: keyof CurrencyState; amount: number; note?: string }) => void;
  onAddItem: (input: {
    name: string;
    quantity: number;
    itemType: InventoryItemType;
    category?: string;
    type?: string;
    notes?: string;
    equipped?: boolean;
  }) => void;
  onUpdateItem: (itemInstanceId: string, patch: {
    name?: string;
    quantity?: number;
    itemType?: InventoryItemType;
    category?: string;
    type?: string;
    notes?: string;
    equipped?: boolean;
  }) => void;
  onRemoveItem: (itemInstanceId: string) => void;
  onDuplicateItem: (itemInstanceId: string) => void;
  onConsumeItem: (itemInstanceId: string, amount?: number) => void;
  onAdjustItemQuantity: (itemInstanceId: string, delta: number) => void;
  onAddSpellComponentItem: (need: SpellMaterialNeedViewModel) => void;
}

const CURRENCY_KEYS: Array<"cp" | "sp" | "ep" | "gp" | "pp"> = ["cp", "sp", "ep", "gp", "pp"];

const ITEM_TYPE_OPTIONS: Array<{ value: InventoryItemType; label: string }> = [
  { value: "weapon", label: "Weapon" },
  { value: "armor", label: "Armor" },
  { value: "shield", label: "Shield" },
  { value: "gear", label: "Gear" },
  { value: "tool", label: "Tool" },
  { value: "focus", label: "Focus" },
  { value: "consumable", label: "Consumable" },
  { value: "ammunition", label: "Ammunition" },
  { value: "magic-item", label: "Magic Item" },
  { value: "spell-component", label: "Spell Component" },
  { value: "custom", label: "Custom" },
];

type InventoryItemFormState = {
  name: string;
  quantity: string;
  itemType: InventoryItemType;
  category: string;
  type: string;
  notes: string;
  equipped: boolean;
};

function defaultItemForm(item?: InventoryItemViewModel): InventoryItemFormState {
  return {
    name: item?.name ?? "",
    quantity: String(item?.quantity ?? 1),
    itemType: item?.itemType ?? "gear",
    category: item?.category ?? "",
    type: item?.type ?? "",
    notes: item?.notes ?? "",
    equipped: item?.equipped ?? false,
  };
}

function isConsumableLike(item: InventoryItemViewModel): boolean {
  return item.itemType === "consumable" || item.itemType === "ammunition" || item.itemType === "spell-component";
}

function statusToneForMaterial(status: SpellMaterialNeedViewModel["status"]): "complete" | "pending" | "blocked" | "info" {
  if (status === "present") return "complete";
  if (status === "covered-by-focus") return "info";
  if (status === "missing") return "pending";
  return "blocked";
}

function ItemList({
  title,
  items,
  onEquipItem,
  onUnequipItem,
  onEditItem,
  onDuplicateItem,
  onRemoveItem,
  onConsumeItem,
  onAdjustItemQuantity,
}: {
  title: string;
  items: InventoryItemViewModel[];
  onEquipItem: InventoryPanelProps["onEquipItem"];
  onUnequipItem: InventoryPanelProps["onUnequipItem"];
  onEditItem: (itemInstanceId: string) => void;
  onDuplicateItem: InventoryPanelProps["onDuplicateItem"];
  onRemoveItem: InventoryPanelProps["onRemoveItem"];
  onConsumeItem: InventoryPanelProps["onConsumeItem"];
  onAdjustItemQuantity: InventoryPanelProps["onAdjustItemQuantity"];
}) {
  const [detailsOpenByItemId, setDetailsOpenByItemId] = useState<Record<string, boolean>>({});
  return (
    <section className="space-y-2">
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <EmptyState title={title} description="None." />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((item) => {
            const consumableLike = isConsumableLike(item);
            return (
              <li key={item.instanceId}>
                <InventoryItemCard
                  title={item.name}
                  subtitle={`${item.itemType}${item.type ? ` · ${item.type}` : ""}${item.quantity !== 1 ? ` · x${item.quantity}` : ""}`}
                  badges={
                    <>
                      {item.equipped ? <StatusBadge label="equipped" status="complete" /> : <StatusBadge label="stowed" status="pending" />}
                      {item.equipmentSlot ? <StatusBadge label={item.equipmentSlot} status="info" /> : null}
                      <StatusBadge label={item.automationStatus} status={ruleAutomationTone(normalizeRuleAutomationStatus(item.automationStatus, "unknown"))} />
                      {item.itemType === "ammunition" ? <StatusBadge label="Ammo tracking available" status="info" /> : null}
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
                      {consumableLike ? (
                        <button
                          aria-label={`Use one ${item.name}`}
                          className="sheet-focus-ring rounded bg-indigo-700 px-2 py-1 text-xs text-white"
                          onClick={() => onConsumeItem(item.instanceId, 1)}
                          type="button"
                        >
                          Use
                        </button>
                      ) : null}
                      <button
                        aria-label={`Edit ${item.name}`}
                        className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                        onClick={() => onEditItem(item.instanceId)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        aria-label={`Duplicate ${item.name}`}
                        className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                        onClick={() => onDuplicateItem(item.instanceId)}
                        type="button"
                      >
                        Duplicate
                      </button>
                      <button
                        aria-label={`Delete ${item.name}`}
                        className="sheet-focus-ring rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                        onClick={() => onRemoveItem(item.instanceId)}
                        type="button"
                      >
                        Delete
                      </button>
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
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="sheet-focus-ring rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-800"
                      onClick={() => onAdjustItemQuantity(item.instanceId, -1)}
                      type="button"
                    >
                      -1
                    </button>
                    <span className="text-xs text-slate-700">Qty {item.quantity}</span>
                    <button
                      aria-label={`Increase quantity of ${item.name}`}
                      className="sheet-focus-ring rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white"
                      onClick={() => onAdjustItemQuantity(item.instanceId, 1)}
                      type="button"
                    >
                      +1
                    </button>
                  </div>
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
                  {(item.propertyLabels.length || item.consumableStatus || item.notes) ? (
                    <p className="text-xs text-slate-600">
                      {[
                        item.propertyLabels.length ? `Properties: ${item.propertyLabels.join(", ")}` : undefined,
                        item.consumableStatus ? `Status: ${item.consumableStatus}` : undefined,
                        item.notes ? `Notes: ${item.notes}` : undefined,
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
                        gameplaySummary: `${item.type ?? item.itemType}${item.quantity !== 1 ? ` · x${item.quantity}` : ""}`,
                        automationStatus: item.automationStatus,
                        manualInstructions: item.manualInstructions,
                        knownLimitations: item.knownLimitations,
                        fields: [
                          { label: "Item Type", value: item.itemType },
                          { label: "Equipped State", value: item.equipped ? `equipped${item.equipmentSlot ? ` (${item.equipmentSlot})` : ""}` : "stowed" },
                          { label: "Quantity", value: String(item.quantity) },
                          { label: "Weight", value: item.weightLabel },
                          { label: "Damage", value: item.damageInfo },
                          { label: "Armor", value: item.armorInfo },
                          { label: "Properties", value: item.propertyLabels.join(", ") || undefined },
                          { label: "Weapon Mastery", value: item.masteryName },
                          { label: "Use/Consume Status", value: item.consumableStatus },
                          { label: "Notes", value: item.notes },
                        ],
                      }}
                      heading="Item Details"
                      id={`inventory-detail-${item.instanceId}`}
                    />
                  ) : null}
                </InventoryItemCard>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function InventoryPanel({
  viewModel,
  onEquipItem,
  onUnequipItem,
  onSetCurrency,
  onAdjustCurrency,
  onNormalizeCurrency,
  onApplyCurrencyTransaction,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onDuplicateItem,
  onConsumeItem,
  onAdjustItemQuantity,
  onAddSpellComponentItem,
}: InventoryPanelProps) {
  const [itemSearch, setItemSearch] = useState("");
  const [equipFilter, setEquipFilter] = useState<"all" | "equipped" | "stowed">("all");
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | undefined>();
  const [itemForm, setItemForm] = useState<InventoryItemFormState>(defaultItemForm());
  const [txMode, setTxMode] = useState<"add" | "subtract">("add");
  const [txDenomination, setTxDenomination] = useState<keyof CurrencyState>("gp");
  const [txAmount, setTxAmount] = useState("10");
  const [txNote, setTxNote] = useState("");

  const ac = viewModel.armorClass;
  const normalizedSearch = itemSearch.trim().toLowerCase();
  const allItems = useMemo(
    () => [
      ...viewModel.armorShields,
      ...viewModel.weapons,
      ...viewModel.consumables,
      ...viewModel.ammunition,
      ...viewModel.toolsFocus,
      ...viewModel.spellComponents,
      ...viewModel.other,
      ...viewModel.unresolvedItems,
    ],
    [
      viewModel.armorShields,
      viewModel.weapons,
      viewModel.consumables,
      viewModel.ammunition,
      viewModel.toolsFocus,
      viewModel.spellComponents,
      viewModel.other,
      viewModel.unresolvedItems,
    ],
  );
  const itemById = useMemo(() => new Map(allItems.map((item) => [item.instanceId, item])), [allItems]);

  const matchesFilters = (item: InventoryItemViewModel): boolean => {
    const searchMatch =
      normalizedSearch.length === 0
      || `${item.name} ${item.itemType} ${item.category} ${item.type ?? ""} ${item.relevantStats.join(" ")} ${item.mappingBadges.join(" ")} ${item.propertyLabels.join(" ")} ${item.damageInfo ?? ""} ${item.armorInfo ?? ""} ${item.description ?? ""} ${item.notes ?? ""}`.toLowerCase().includes(normalizedSearch);
    const equipMatch = equipFilter === "all" ? true : equipFilter === "equipped" ? item.equipped : !item.equipped;
    return searchMatch && equipMatch;
  };

  const filteredEquipped = useMemo(() => viewModel.equipped.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.equipped]);
  const filteredWeapons = useMemo(() => viewModel.weapons.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.weapons]);
  const filteredArmorShields = useMemo(() => viewModel.armorShields.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.armorShields]);
  const filteredConsumables = useMemo(() => viewModel.consumables.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.consumables]);
  const filteredAmmunition = useMemo(() => viewModel.ammunition.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.ammunition]);
  const filteredToolsFocus = useMemo(() => viewModel.toolsFocus.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.toolsFocus]);
  const filteredSpellComponents = useMemo(() => viewModel.spellComponents.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.spellComponents]);
  const filteredOther = useMemo(() => viewModel.other.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.other]);
  const filteredUnresolved = useMemo(() => viewModel.unresolvedItems.filter(matchesFilters), [equipFilter, normalizedSearch, viewModel.unresolvedItems]);
  const totalFilteredCount =
    filteredEquipped.length
    + filteredWeapons.length
    + filteredArmorShields.length
    + filteredConsumables.length
    + filteredAmmunition.length
    + filteredToolsFocus.length
    + filteredSpellComponents.length
    + filteredOther.length
    + filteredUnresolved.length;

  const openAddModal = () => {
    setEditingItemId(undefined);
    setItemForm(defaultItemForm());
    setShowItemModal(true);
  };

  const openEditModal = (itemInstanceId: string) => {
    const item = itemById.get(itemInstanceId);
    if (!item) {
      return;
    }
    setEditingItemId(itemInstanceId);
    setItemForm(defaultItemForm(item));
    setShowItemModal(true);
  };

  const applyItemForm = () => {
    const quantity = Math.max(1, Math.floor(Number(itemForm.quantity) || 1));
    const payload = {
      name: itemForm.name.trim() || "Custom Item",
      quantity,
      itemType: itemForm.itemType,
      category: itemForm.category.trim() || undefined,
      type: itemForm.type.trim() || undefined,
      notes: itemForm.notes.trim() || undefined,
      equipped: itemForm.equipped,
    };
    if (editingItemId) {
      onUpdateItem(editingItemId, payload);
    } else {
      onAddItem(payload);
    }
    setShowItemModal(false);
  };

  const applyTransaction = () => {
    const amount = Math.max(0, Math.floor(Number(txAmount) || 0));
    if (amount <= 0) {
      return;
    }
    onApplyCurrencyTransaction({
      mode: txMode,
      denomination: txDenomination,
      amount,
      note: txNote.trim() || undefined,
    });
    setTxNote("");
  };

  return (
    <div className="space-y-4">
      <div className="sheet-card border-indigo-200 bg-indigo-50/60 p-3 text-sm">
        <SectionHeader
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge label={`${viewModel.currencyTotalGp.toFixed(2)} gp`} status="info" />
              <button className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800" onClick={onNormalizeCurrency} type="button">
                Normalize
              </button>
            </div>
          }
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
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 rounded border border-indigo-200 bg-white p-2 md:grid-cols-[auto,auto,auto,1fr,auto]">
          <select
            aria-label="Currency transaction mode"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setTxMode(event.target.value as "add" | "subtract")}
            value={txMode}
          >
            <option value="add">add</option>
            <option value="subtract">subtract</option>
          </select>
          <select
            aria-label="Currency transaction denomination"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setTxDenomination(event.target.value as keyof CurrencyState)}
            value={txDenomination}
          >
            {CURRENCY_KEYS.map((entry) => (
              <option key={`tx-${entry}`} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <input
            aria-label="Currency transaction amount"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            min={1}
            onChange={(event) => setTxAmount(event.target.value)}
            type="number"
            value={txAmount}
          />
          <input
            aria-label="Currency transaction note"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setTxNote(event.target.value)}
            placeholder="Transaction note"
            value={txNote}
          />
          <button className="sheet-focus-ring rounded bg-slate-800 px-3 py-1 text-sm text-white" onClick={applyTransaction} type="button">
            Apply
          </button>
        </div>

        {viewModel.currencyTransactions.length > 0 ? (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <p className="font-medium text-slate-800">Recent Transactions</p>
            <ul className="mt-1 space-y-1">
              {viewModel.currencyTransactions.slice(-5).reverse().map((entry) => (
                <li key={entry.id}>
                  {entry.mode} {CURRENCY_KEYS.map((denom) => (entry.delta[denom] > 0 ? `${entry.delta[denom]} ${denom}` : undefined)).filter(Boolean).join(", ")}
                  {entry.note ? ` · ${entry.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="sheet-card grid gap-2 p-3 md:grid-cols-[minmax(0,2fr),repeat(2,minmax(0,1fr)),auto]">
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
        <button className="sheet-focus-ring rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={openAddModal} type="button">
          Add Item
        </button>
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
      </div>

      <section className="sheet-card p-3">
        <SectionHeader
          title="Needed for prepared spells"
          subtitle={viewModel.hasComponentFocusCoverage ? "Focus/component pouch coverage detected where applicable." : "No focus/component pouch coverage detected."}
        />
        {viewModel.neededSpellComponents.length === 0 ? (
          <EmptyState title="Spell Components" description="No prepared/known spells currently require detected material components." />
        ) : (
          <ul className="mt-2 space-y-2">
            {viewModel.neededSpellComponents.map((need) => (
              <li key={need.id} className="rounded border border-slate-200 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{need.spellName}</p>
                    <p className="text-xs text-slate-700">{need.componentText}</p>
                    {need.matchingItemName ? <p className="text-xs text-slate-600">Matched item: {need.matchingItemName}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={need.statusLabel} status={statusToneForMaterial(need.status)} />
                    <button
                      aria-label={`Add material component for ${need.spellName} to inventory`}
                      className="sheet-focus-ring rounded bg-slate-800 px-2 py-1 text-xs text-white"
                      onClick={() => onAddSpellComponentItem(need)}
                      type="button"
                    >
                      Add to inventory
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {totalFilteredCount === 0 ? (
        <EmptyState title="Inventory Search" description="No inventory entries match the current filters." />
      ) : (
        <>
          <ItemList
            title="Equipped"
            items={filteredEquipped}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Weapons"
            items={filteredWeapons}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Armor/Shields"
            items={filteredArmorShields}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Consumables"
            items={filteredConsumables}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Ammunition"
            items={filteredAmmunition}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Tools/Focus"
            items={filteredToolsFocus}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Spell Components"
            items={filteredSpellComponents}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          <ItemList
            title="Other"
            items={filteredOther}
            onAdjustItemQuantity={onAdjustItemQuantity}
            onConsumeItem={onConsumeItem}
            onDuplicateItem={onDuplicateItem}
            onEditItem={openEditModal}
            onEquipItem={onEquipItem}
            onRemoveItem={onRemoveItem}
            onUnequipItem={onUnequipItem}
          />
          {filteredUnresolved.length ? (
            <ItemList
              title="Unresolved Items"
              items={filteredUnresolved}
              onAdjustItemQuantity={onAdjustItemQuantity}
              onConsumeItem={onConsumeItem}
              onDuplicateItem={onDuplicateItem}
              onEditItem={openEditModal}
              onEquipItem={onEquipItem}
              onRemoveItem={onRemoveItem}
              onUnequipItem={onUnequipItem}
            />
          ) : null}
        </>
      )}

      {showItemModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded border border-slate-300 bg-white p-4 shadow-lg">
            <SectionHeader title={editingItemId ? "Edit Item" : "Add Item"} subtitle="Create or update inventory entries without leaving the sheet." />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                Name
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
                  value={itemForm.name}
                />
              </label>
              <label className="text-sm text-slate-700">
                Quantity
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  min={1}
                  onChange={(event) => setItemForm((current) => ({ ...current, quantity: event.target.value }))}
                  type="number"
                  value={itemForm.quantity}
                />
              </label>
              <label className="text-sm text-slate-700">
                Item Type
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  onChange={(event) => setItemForm((current) => ({ ...current, itemType: event.target.value as InventoryItemType }))}
                  value={itemForm.itemType}
                >
                  {ITEM_TYPE_OPTIONS.map((option) => (
                    <option key={`item-type-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Category
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}
                  value={itemForm.category}
                />
              </label>
              <label className="text-sm text-slate-700">
                Type
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  onChange={(event) => setItemForm((current) => ({ ...current, type: event.target.value }))}
                  value={itemForm.type}
                />
              </label>
              <label className="text-sm text-slate-700">
                Equipped
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  onChange={(event) => setItemForm((current) => ({ ...current, equipped: event.target.value === "yes" }))}
                  value={itemForm.equipped ? "yes" : "no"}
                >
                  <option value="no">Stowed</option>
                  <option value="yes">Equipped</option>
                </select>
              </label>
            </div>
            <label className="mt-2 block text-sm text-slate-700">
              Notes
              <textarea
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                onChange={(event) => setItemForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                value={itemForm.notes}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="sheet-focus-ring rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-800"
                onClick={() => setShowItemModal(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="sheet-focus-ring rounded bg-indigo-700 px-3 py-1 text-sm text-white" onClick={applyItemForm} type="button">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
