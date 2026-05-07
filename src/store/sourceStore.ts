import { create } from "zustand";
import { getActiveSourceKeys, getAvailableSources, regenerateContentForSelectedSources } from "../services/data/adapter";
import { resolveSourceProvider, sourceKeysForProvider } from "../services/data/sourceProvider";

export type SourcePreset =
  | "all"
  | "provider-open5e"
  | "provider-mpmb"
  | "official-handbooks"
  | "official-books"
  | "ua"
  | "adventure"
  | "mpmb-pdf-core"
  | "mpmb-upstream-2014-core"
  | "mpmb-upstream-2024-core"
  | "open5e-2014"
  | "open5e-2024"
  | "open5e-both";

const SOURCE_SELECTION_STORAGE_KEY = "mpmb-character-builder:sources:v1";

type SourceRegenerationStats = {
  sourceCount: number;
  classCount: number;
  subclassCount: number;
  speciesCount: number;
  backgroundCount: number;
  featCount: number;
  spellCount: number;
  equipmentCount: number;
};

type SourceStore = {
  generation: number;
  draftSelectedSourceKeys: string[];
  activeSourceKeys: string[];
  lastRegeneratedAt?: string;
  lastStats?: SourceRegenerationStats;
  setDraftSelectedSourceKeys: (keys: string[]) => void;
  toggleDraftSourceKey: (key: string) => void;
  applyPresetToDraft: (preset: SourcePreset) => void;
  selectAllDraft: () => void;
  clearDraft: () => void;
  resetDraftToActive: () => void;
  regenerate: () => void;
};

const availableSources = getAvailableSources();
const allSourceKeys = availableSources.map((source) => source.key);

function readPersistedSelection(): string[] | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(SOURCE_SELECTION_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as { selectedSourceKeys?: string[] };
    if (!Array.isArray(parsed.selectedSourceKeys)) {
      return undefined;
    }
    return parsed.selectedSourceKeys.filter((key) => allSourceKeys.includes(key));
  } catch {
    return undefined;
  }
}

function persistSelection(selectedSourceKeys: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SOURCE_SELECTION_STORAGE_KEY, JSON.stringify({ selectedSourceKeys }, null, 2));
}

function presetKeys(preset: SourcePreset): string[] {
  if (preset === "all") {
    return allSourceKeys;
  }
  if (preset === "provider-open5e") {
    return sourceKeysForProvider(availableSources, "open5e");
  }
  if (preset === "provider-mpmb") {
    return sourceKeysForProvider(availableSources, "mpmb");
  }
  if (preset === "official-handbooks") {
    return availableSources
      .filter((source) => resolveSourceProvider(source) === "mpmb" && /handbook/i.test(source.name))
      .map((source) => source.key);
  }
  if (preset === "official-books") {
    return availableSources
      .filter(
        (source) =>
          resolveSourceProvider(source) === "mpmb" &&
          (/sources/i.test(source.group ?? "") || /book/i.test(source.group ?? "")),
      )
      .map((source) => source.key);
  }
  if (preset === "ua") {
    return availableSources
      .filter(
        (source) =>
          resolveSourceProvider(source) === "mpmb" &&
          (/unearthed arcana/i.test(source.group ?? "") || /^UA[:]/i.test(source.key)),
      )
      .map((source) => source.key);
  }
  if (preset === "mpmb-pdf-core") {
    return availableSources.filter((source) => source.key.toLowerCase().startsWith("mpmbpdf-")).map((source) => source.key);
  }
  if (preset === "mpmb-upstream-2014-core") {
    return availableSources
      .filter((source) => source.key.toLowerCase().startsWith("mpmbup14-") || (source.group ?? "").toLowerCase().includes("mpmb upstream 2014"))
      .map((source) => source.key);
  }
  if (preset === "mpmb-upstream-2024-core") {
    return availableSources
      .filter((source) => source.key.toLowerCase().startsWith("mpmbup24-") || (source.group ?? "").toLowerCase().includes("mpmb upstream 2024"))
      .map((source) => source.key);
  }
  if (preset === "open5e-2014") {
    return availableSources
      .filter((source) => source.group === "Open5e 2014" || source.key === "srd-2014" || source.key === "open5e")
      .map((source) => source.key);
  }
  if (preset === "open5e-2024") {
    return availableSources
      .filter((source) => source.group === "Open5e 2024" || source.key === "srd-2024" || source.key === "open5e-2024")
      .map((source) => source.key);
  }
  if (preset === "open5e-both") {
    return sourceKeysForProvider(availableSources, "open5e");
  }
  return availableSources
    .filter((source) => resolveSourceProvider(source) === "mpmb" && /adventure/i.test(source.group ?? ""))
    .map((source) => source.key);
}

const initialSelected = readPersistedSelection() ?? getActiveSourceKeys();
regenerateContentForSelectedSources(initialSelected);

export const useSourceStore = create<SourceStore>((set, get) => ({
  generation: 0,
  draftSelectedSourceKeys: initialSelected,
  activeSourceKeys: initialSelected,
  setDraftSelectedSourceKeys: (keys) =>
    set(() => ({
      draftSelectedSourceKeys: Array.from(new Set(keys.filter((key) => allSourceKeys.includes(key)))),
    })),
  toggleDraftSourceKey: (key) =>
    set((state) => {
      if (!allSourceKeys.includes(key)) {
        return state;
      }
      const selected = new Set(state.draftSelectedSourceKeys);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      return {
        ...state,
        draftSelectedSourceKeys: Array.from(selected),
      };
    }),
  applyPresetToDraft: (preset) =>
    set((state) => ({
      ...state,
      draftSelectedSourceKeys: presetKeys(preset),
    })),
  selectAllDraft: () =>
    set((state) => ({
      ...state,
      draftSelectedSourceKeys: allSourceKeys,
    })),
  clearDraft: () =>
    set((state) => ({
      ...state,
      draftSelectedSourceKeys: [],
    })),
  resetDraftToActive: () =>
    set((state) => ({
      ...state,
      draftSelectedSourceKeys: state.activeSourceKeys,
    })),
  regenerate: () => {
    const selected = get().draftSelectedSourceKeys;
    const stats = regenerateContentForSelectedSources(selected);
    persistSelection(selected);
    set((state) => ({
      ...state,
      generation: state.generation + 1,
      activeSourceKeys: selected,
      lastRegeneratedAt: new Date().toISOString(),
      lastStats: stats,
    }));
  },
}));
