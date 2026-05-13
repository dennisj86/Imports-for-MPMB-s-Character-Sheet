import type { CharacterDraft } from "./character";

export type PartyStorageMode = "local-only" | "shared-server";
export type PartySaveStrategy = "merge" | "replace";

export interface PartyState {
  partyId: string;
  partyName: string;
  characterIds: string[];
  updatedAt: string;
  version: number;
  activeCharacterId?: string;
}

export interface PartyBundle {
  version: 1;
  party: PartyState;
  characters: CharacterDraft[];
  exportedAt: string;
  storageMeta?: {
    source?: PartyStorageMode;
    persisted?: boolean;
    loadedAt?: string;
  };
}

export type PartySyncEvent =
  | {
    type: "party-updated";
    partyId: string;
    updatedAt: string;
    version: number;
  }
  | {
    type: "character-updated";
    partyId: string;
    characterId: string;
    updatedAt: string;
    version: number;
  }
  | {
    type: "sync-disconnected";
    partyId: string;
    updatedAt: string;
    version: 0;
    message?: string;
  };
