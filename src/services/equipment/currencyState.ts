import type { CurrencyState, InventoryState } from "../../domain/character";

function clampCurrencyValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
}

export function normalizeCurrencyState(currency: InventoryState["currency"]): CurrencyState {
  return {
    cp: clampCurrencyValue(currency?.cp),
    sp: clampCurrencyValue(currency?.sp),
    ep: clampCurrencyValue(currency?.ep),
    gp: clampCurrencyValue(currency?.gp),
    pp: clampCurrencyValue(currency?.pp),
  };
}

export function setCurrencyAmount(
  inventory: InventoryState,
  denomination: keyof CurrencyState,
  amount: number,
): InventoryState {
  return {
    ...inventory,
    currency: {
      ...normalizeCurrencyState(inventory.currency),
      [denomination]: clampCurrencyValue(amount),
    },
  };
}

export function adjustCurrencyAmount(
  inventory: InventoryState,
  denomination: keyof CurrencyState,
  delta: number,
): InventoryState {
  const current = normalizeCurrencyState(inventory.currency);
  return setCurrencyAmount(inventory, denomination, current[denomination] + delta);
}

export function currencyTotalInGp(currency: InventoryState["currency"]): number {
  const normalized = normalizeCurrencyState(currency);
  return (normalized.cp / 100) + (normalized.sp / 10) + (normalized.ep / 2) + normalized.gp + (normalized.pp * 10);
}

