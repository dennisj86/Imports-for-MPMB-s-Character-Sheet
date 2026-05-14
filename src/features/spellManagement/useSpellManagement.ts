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
  contextOverrides: SpellManagementQueryContext = {},
): SpellManagementViewState | undefined {
  if (!draft) {
    return undefined;
  }
  const context: SpellManagementQueryContext = {
    provider: contextOverrides.provider ?? draft.provider,
    rulesMode: contextOverrides.rulesMode ?? draft.rulesMode,
    levelUpTargetContext: contextOverrides.levelUpTargetContext,
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
  contextOverrides: SpellManagementQueryContext = {},
): SpellManagementViewState | undefined {
  return useMemo(
    () => resolveSpellManagementViewState(draft, activeSourceKeys, contextOverrides),
    [draft, activeSourceKeys, generation, contextOverrides],
  );
}
