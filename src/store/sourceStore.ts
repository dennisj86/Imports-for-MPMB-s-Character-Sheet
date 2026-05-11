import { create } from "zustand";
import type { SourceDefinition } from "../domain/content";
import {
  getV2AllSourceKeys,
  getV2AvailableSources,
  normalizeSourceSelection,
  persistSourceSelection,
  readPersistedSourceSelection,
  resolveSourceSelectionRuntime,
  sourcePresetKeys,
  type SourcePreset,
  type SourceRegenerationStats,
} from "../features/content/sourceSelectionService";

const SOURCE_SELECTION_STORAGE_KEY = "mpmb-character-builder:sources:v1";

type SourceStore = {
  availableSources: SourceDefinition[];
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

const availableSources = getV2AvailableSources();
const allSourceKeys = getV2AllSourceKeys();
const initialSelected = normalizeSourceSelection(readPersistedSourceSelection(SOURCE_SELECTION_STORAGE_KEY) ?? allSourceKeys);
const initialRuntime = resolveSourceSelectionRuntime(initialSelected);

export const useSourceStore = create<SourceStore>((set, get) => ({
  availableSources,
  generation: 0,
  draftSelectedSourceKeys: initialRuntime.selectedSourceKeys,
  activeSourceKeys: initialRuntime.selectedSourceKeys,
  lastStats: initialRuntime.stats,
  setDraftSelectedSourceKeys: (keys) =>
    set(() => ({
      draftSelectedSourceKeys: normalizeSourceSelection(keys),
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
        draftSelectedSourceKeys: normalizeSourceSelection(Array.from(selected)),
      };
    }),
  applyPresetToDraft: (preset) =>
    set((state) => ({
      ...state,
      draftSelectedSourceKeys: normalizeSourceSelection(sourcePresetKeys(preset, state.availableSources)),
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
    const runtime = resolveSourceSelectionRuntime(selected);
    persistSourceSelection(runtime.selectedSourceKeys, SOURCE_SELECTION_STORAGE_KEY);
    set((state) => ({
      ...state,
      generation: state.generation + 1,
      activeSourceKeys: runtime.selectedSourceKeys,
      lastRegeneratedAt: new Date().toISOString(),
      lastStats: runtime.stats,
    }));
  },
}));
