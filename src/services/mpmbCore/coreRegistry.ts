import type { MpmContentSnapshot, RulesMode } from "../../domain/content";
import {
  buildMpmbV2ModeSnapshots,
  filterMpmSnapshotBySourceKeys,
  type MpmbV2ModeSnapshots,
} from "../mpmbNormalization/snapshotMerge";
import { buildMpmbRuntimeLoadPlan, type MpmbRuntimeLoadPlan } from "../mpmbRuntime/runtimeLoadPlan";
import { summarizeMpmbRuntimeRegistry, type MpmbRuntimeRegistrySummary } from "../mpmbRuntime/registrySummary";

export type CoreProviderSelection = "mpmb" | "open5e" | "all";

export type CoreQueryContext = {
  provider?: CoreProviderSelection;
  rulesMode?: RulesMode;
};

export interface MpmbCoreRegistry {
  baseSnapshot: MpmContentSnapshot;
  selectedSourceKeys: Set<string>;
  selectedSnapshot: MpmContentSnapshot;
  modeSnapshots: MpmbV2ModeSnapshots;
}

const DEFAULT_RULES_MODE: RulesMode = "2024";
const DEFAULT_PROVIDER: CoreProviderSelection = "all";

function toSelectedSourceSet(snapshot: MpmContentSnapshot, selectedSourceKeys?: string[]): Set<string> {
  if (selectedSourceKeys) {
    return new Set(selectedSourceKeys);
  }
  return new Set(snapshot.sources.map((source) => source.key));
}

export function createMpmbCoreRegistry(
  snapshot: MpmContentSnapshot,
  selectedSourceKeys?: string[],
): MpmbCoreRegistry {
  const selectedSourceSet = toSelectedSourceSet(snapshot, selectedSourceKeys);
  const selectedSnapshot = filterMpmSnapshotBySourceKeys(snapshot, selectedSourceSet);
  return {
    baseSnapshot: snapshot,
    selectedSourceKeys: selectedSourceSet,
    selectedSnapshot,
    modeSnapshots: buildMpmbV2ModeSnapshots(selectedSnapshot),
  };
}

export function withSelectedSourcesForMpmbCoreRegistry(
  registry: MpmbCoreRegistry,
  selectedSourceKeys: string[],
): MpmbCoreRegistry {
  return createMpmbCoreRegistry(registry.baseSnapshot, selectedSourceKeys);
}

export function resolveSnapshotForCoreContext(
  registry: MpmbCoreRegistry,
  context: CoreQueryContext = {},
): MpmContentSnapshot {
  const provider = context.provider ?? DEFAULT_PROVIDER;
  const rulesMode = context.rulesMode ?? DEFAULT_RULES_MODE;
  if (provider === "mpmb") {
    return registry.modeSnapshots.mpmbByMode[rulesMode];
  }
  if (provider === "open5e") {
    return registry.modeSnapshots.open5e;
  }
  return registry.modeSnapshots.combinedByMode[rulesMode];
}

export function getMpmbCoreRuntimeLoadPlan(rulesMode: RulesMode): MpmbRuntimeLoadPlan {
  return buildMpmbRuntimeLoadPlan(rulesMode);
}

export function getMpmbCoreRuntimeRegistrySummary(
  registry: MpmbCoreRegistry,
  rulesMode: RulesMode,
): MpmbRuntimeRegistrySummary {
  const snapshot = registry.modeSnapshots.mpmbByMode[rulesMode];
  return summarizeMpmbRuntimeRegistry(snapshot, rulesMode);
}
