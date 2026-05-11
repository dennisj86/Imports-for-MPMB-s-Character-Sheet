import { useMemo } from "react";
import type { CharacterDraft } from "../../../domain/character";
import { contentSnapshot } from "../../../services/data/content";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../../../services/mpmbCore";
import { resolveCharacterEngineState, type CharacterEngineQueryContext, type CharacterEngineState } from "../../../services/characterEngine";

export interface CharacterEngineViewState {
  context: CharacterEngineQueryContext;
  snapshot: ReturnType<typeof resolveSnapshotForCoreContext>;
  engine: CharacterEngineState;
}

export function resolveCharacterEngineViewState(
  draft: CharacterDraft | undefined,
  activeSourceKeys: string[],
): CharacterEngineViewState | undefined {
  if (!draft) {
    return undefined;
  }
  const context: CharacterEngineQueryContext = {
    provider: draft.provider,
    rulesMode: draft.rulesMode,
  };
  const coreRegistry = createMpmbCoreRegistry(contentSnapshot, activeSourceKeys);
  const snapshot = resolveSnapshotForCoreContext(coreRegistry, context);
  const engine = resolveCharacterEngineState(snapshot, draft, context);
  return {
    context,
    snapshot,
    engine,
  };
}

export function useCharacterEngine(
  draft: CharacterDraft | undefined,
  activeSourceKeys: string[],
  generation = 0,
): CharacterEngineViewState | undefined {
  return useMemo(() => resolveCharacterEngineViewState(draft, activeSourceKeys), [draft, activeSourceKeys, generation]);
}
