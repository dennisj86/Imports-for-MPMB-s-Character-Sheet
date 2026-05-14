import type { CharacterDraft } from "../../domain/character";
import type { PartyStorageAdapter } from "./partyStorage";

interface ActivePartyRuntime {
  partyId: string;
  storage: PartyStorageAdapter;
  onLocalUpdate?: (timestamp: string) => void;
  onSaveError?: (error: unknown) => void;
  onSaveSuccess?: () => void;
}

let activeRuntime: ActivePartyRuntime | undefined;
let suppressCharacterSaves = false;

export function setActivePartyRuntime(runtime: ActivePartyRuntime | undefined): void {
  activeRuntime = runtime;
}

export function getActivePartyRuntime(): ActivePartyRuntime | undefined {
  return activeRuntime;
}

export function withSuppressedPartyCharacterSaves<T>(callback: () => T): T {
  const previous = suppressCharacterSaves;
  suppressCharacterSaves = true;
  try {
    return callback();
  } finally {
    suppressCharacterSaves = previous;
  }
}

export function saveCharacterToActiveParty(character: CharacterDraft): void {
  if (!activeRuntime || suppressCharacterSaves) {
    return;
  }
  const runtime = activeRuntime;
  runtime.onLocalUpdate?.(character.updatedAt);
  void runtime.storage
    .saveCharacter(runtime.partyId, character)
    .then(() => runtime.onSaveSuccess?.())
    .catch((error: unknown) => runtime.onSaveError?.(error));
}
