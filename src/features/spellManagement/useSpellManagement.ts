import { useMemo } from "react";
import type { CharacterDraft } from "../../domain/character";
import { contentSnapshot } from "../../services/data/content";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../../services/mpmbCore";
import { buildSpellManagementState, type SpellManagementQueryContext, type SpellManagementState } from "./spellManagementService";

export interface SpellManagementViewState {
  context: SpellManagementQueryContext;
  snapshot: ReturnType<typeof resolveSnapshotForCoreContext>;
  spellManagement: SpellManagementState;
}

export function resolveSpellManagementViewState(
  draft: CharacterDraft | undefined,
  activeSourceKeys: string[],
): SpellManagementViewState | undefined {
  if (!draft) {
    return undefined;
  }
  const context: SpellManagementQueryContext = {
    provider: draft.provider,
    rulesMode: draft.rulesMode,
  };
  const coreRegistry = createMpmbCoreRegistry(contentSnapshot, activeSourceKeys);
  const snapshot = resolveSnapshotForCoreContext(coreRegistry, context);
  const spellManagement = buildSpellManagementState(snapshot, draft, context);
  return {
    context,
    snapshot,
    spellManagement,
  };
}

export function useSpellManagement(
  draft: CharacterDraft | undefined,
  activeSourceKeys: string[],
  generation = 0,
): SpellManagementViewState | undefined {
  return useMemo(() => resolveSpellManagementViewState(draft, activeSourceKeys), [draft, activeSourceKeys, generation]);
}
