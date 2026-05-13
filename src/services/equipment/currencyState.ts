import type { CurrencyState, CurrencyTransaction, InventoryState } from "../../domain/character";

const CURRENCY_ORDER: Array<keyof CurrencyState> = ["pp", "gp", "ep", "sp", "cp"];

const CP_FACTOR: Record<keyof CurrencyState, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

const MAX_TRANSACTION_LOG = 50;

function clampCurrencyValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
}

function transactionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `currency-tx-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
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

function currencyToCopper(currency: CurrencyState): number {
  return (
    currency.cp * CP_FACTOR.cp
    + currency.sp * CP_FACTOR.sp
    + currency.ep * CP_FACTOR.ep
    + currency.gp * CP_FACTOR.gp
    + currency.pp * CP_FACTOR.pp
  );
}

function copperToCurrency(totalCopper: number): CurrencyState {
  let remaining = clampCurrencyValue(totalCopper);
  const next: CurrencyState = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  for (const denomination of CURRENCY_ORDER) {
    const factor = CP_FACTOR[denomination];
    next[denomination] = Math.floor(remaining / factor);
    remaining -= next[denomination] * factor;
  }
  return next;
}

export function normalizeCurrencyDenominations(currency: InventoryState["currency"]): CurrencyState {
  return copperToCurrency(currencyToCopper(normalizeCurrencyState(currency)));
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

export function applyCurrencyNormalization(inventory: InventoryState): InventoryState {
  return {
    ...inventory,
    currency: normalizeCurrencyDenominations(inventory.currency),
  };
}

export function applyCurrencyTransaction(
  inventory: InventoryState,
  input: {
    mode: "add" | "subtract";
    denomination: keyof CurrencyState;
    amount: number;
    note?: string;
    now?: string;
    log?: boolean;
  },
): InventoryState {
  const amount = clampCurrencyValue(input.amount);
  if (amount <= 0) {
    return inventory;
  }
  const sign = input.mode === "subtract" ? -1 : 1;
  const nextBase = adjustCurrencyAmount(inventory, input.denomination, sign * amount);
  const normalized = applyCurrencyNormalization(nextBase);
  if (input.log === false) {
    return normalized;
  }
  const transaction: CurrencyTransaction = {
    id: transactionId(),
    timestamp: input.now ?? new Date().toISOString(),
    delta: normalizeCurrencyState({
      cp: input.denomination === "cp" ? amount : 0,
      sp: input.denomination === "sp" ? amount : 0,
      ep: input.denomination === "ep" ? amount : 0,
      gp: input.denomination === "gp" ? amount : 0,
      pp: input.denomination === "pp" ? amount : 0,
    }),
    mode: input.mode,
    note: input.note?.trim() || undefined,
  };
  const nextTransactions = [...(inventory.currencyTransactions ?? []), transaction];
  return {
    ...normalized,
    currencyTransactions: nextTransactions.slice(Math.max(0, nextTransactions.length - MAX_TRANSACTION_LOG)),
  };
}

export function currencyTotalInGp(currency: InventoryState["currency"]): number {
  const normalized = normalizeCurrencyState(currency);
  return (normalized.cp / 100) + (normalized.sp / 10) + (normalized.ep / 2) + normalized.gp + (normalized.pp * 10);
}

