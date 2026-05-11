export const SHEET_TABS = ["overview", "actions", "spells", "inventory", "features", "manage"] as const;

export type SheetTabId = (typeof SHEET_TABS)[number];

export const SHEET_TAB_LABELS: Record<SheetTabId, string> = {
  overview: "Overview",
  actions: "Actions",
  spells: "Spells",
  inventory: "Inventory",
  features: "Features",
  manage: "Manage",
};
