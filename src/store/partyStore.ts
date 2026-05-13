import { create } from "zustand";
import type { CharacterDraft } from "../domain/character";
import type { PartyBundle, PartyState, PartyStorageMode, PartySyncEvent } from "../domain/party";
import {
  bumpParty,
  createPartyBundle,
  createPartyState,
  createPartyStorage,
  DEFAULT_PARTY_ID,
  getStoredPartyStorageMode,
  isStalePartySyncEvent,
  isUnsafeEmptyPartyOverwrite,
  mergePartyBundles,
  partyMemberCount,
  setActivePartyRuntime,
  setStoredPartyStorageMode,
  wouldRemovePartyMembers,
  withSuppressedPartyCharacterSaves,
} from "../services/party";
import { useCharacterStore } from "./characterStore";

type PartyConnectionStatus = "local" | "connecting" | "connected" | "disconnected";
type PartyConflictAction = "cancel" | "merge-local" | "replace-shared";

type PendingPartyConflict = {
  kind: "shared-switch" | "destructive-save";
  partyId: string;
  message: string;
  localMemberCount: number;
  serverMemberCount: number;
  localBundle: PartyBundle;
  serverBundle: PartyBundle;
  attemptedBundle?: PartyBundle;
};

type PartyStore = {
  party?: PartyState;
  mode: PartyStorageMode;
  loading: boolean;
  error?: string;
  saveError?: string;
  syncError?: string;
  connectionStatus: PartyConnectionStatus;
  lastSyncAt?: string;
  lastSaveAt?: string;
  pendingConflict?: PendingPartyConflict;
  lastRemoteUpdate?: PartySyncEvent;
  setMode: (mode: PartyStorageMode, partyId?: string) => Promise<void>;
  loadParty: (partyId?: string) => Promise<void>;
  saveParty: (party: PartyState, characters?: CharacterDraft[], options?: { strategy?: "merge" | "replace"; force?: boolean }) => Promise<void>;
  resolvePendingConflict: (action: PartyConflictAction) => Promise<void>;
  importCharactersToParty: (characters: CharacterDraft[]) => Promise<void>;
  exportParty: () => string;
  subscribeToParty: (partyId: string) => () => void;
  applyRemoteEvent: (event: PartySyncEvent) => Promise<void>;
};

function currentCharactersForParty(party: PartyState | undefined): CharacterDraft[] {
  const characters = useCharacterStore.getState().characters;
  if (!party) {
    return characters;
  }
  const ids = new Set(party.characterIds);
  return characters.filter((entry) => ids.has(entry.id));
}

async function loadOrCreateParty(partyId: string, mode: PartyStorageMode): Promise<PartyBundle> {
  const storage = createPartyStorage(mode);
  const existing = await storage.loadParty(partyId);
  if (existing) {
    return existing;
  }
  const localCharacters = useCharacterStore.getState().characters;
  const party = createPartyState(partyId, "Adventuring Party", localCharacters.map((entry) => entry.id));
  const bundle = createPartyBundle(party, localCharacters);
  return storage.saveParty(bundle);
}

async function loadSharedParty(partyId: string): Promise<PartyBundle> {
  const storage = createPartyStorage("shared-server");
  return (await storage.loadParty(partyId)) ?? createPartyBundle(createPartyState(partyId), []);
}

function hydratePartyBundle(bundle: PartyBundle): void {
  withSuppressedPartyCharacterSaves(() => {
    useCharacterStore.getState().replaceCharactersFromParty(bundle.characters);
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function bundleMemberIds(bundle: PartyBundle): Set<string> {
  return new Set([...bundle.party.characterIds, ...bundle.characters.map((entry) => entry.id)]);
}

function bundlesHaveDifferentMembers(a: PartyBundle, b: PartyBundle): boolean {
  const aIds = bundleMemberIds(a);
  const bIds = bundleMemberIds(b);
  if (aIds.size !== bIds.size) {
    return true;
  }
  return Array.from(aIds).some((id) => !bIds.has(id));
}

export const usePartyStore = create<PartyStore>((set, get) => ({
  mode: getStoredPartyStorageMode(),
  loading: false,
  connectionStatus: getStoredPartyStorageMode() === "shared-server" ? "connecting" : "local",
  setMode: async (mode, partyIdArg) => {
    const partyId = partyIdArg ?? get().party?.partyId ?? DEFAULT_PARTY_ID;
    setStoredPartyStorageMode(mode);
    set({ mode, error: undefined, saveError: undefined, syncError: undefined, pendingConflict: undefined });

    if (mode === "shared-server") {
      const storage = createPartyStorage("shared-server");
      const localBundle = createPartyBundle(get().party ?? createPartyState(partyId), currentCharactersForParty(get().party));
      set({ loading: true, connectionStatus: "connecting" });
      try {
        const serverBundle = await loadSharedParty(partyId);
        const localHasMembers = partyMemberCount(localBundle) > 0;
        const serverHasMembers = partyMemberCount(serverBundle) > 0;

        if (!serverHasMembers && localHasMembers) {
          setActivePartyRuntime(undefined);
          set({
            loading: false,
            connectionStatus: "connected",
            pendingConflict: {
              kind: "shared-switch",
              partyId,
              message: "Shared server is empty. Choose whether to merge local characters into shared storage or keep local-only mode.",
              localMemberCount: partyMemberCount(localBundle),
              serverMemberCount: partyMemberCount(serverBundle),
              localBundle,
              serverBundle,
            },
          });
          return;
        }

        hydratePartyBundle(serverBundle);
        setActivePartyRuntime({
          partyId,
          storage,
          onSaveError: (error) => set({ saveError: errorMessage(error, "Party save failed."), connectionStatus: "disconnected" }),
          onSaveSuccess: () => set({ lastSaveAt: new Date().toISOString(), saveError: undefined, connectionStatus: "connected" }),
        });
        set({
          party: serverBundle.party,
          loading: false,
          connectionStatus: "connected",
          lastSyncAt: new Date().toISOString(),
          error: undefined,
          pendingConflict: localHasMembers && serverHasMembers && bundlesHaveDifferentMembers(localBundle, serverBundle)
            ? {
              kind: "shared-switch",
              partyId,
              message: "Shared server data was loaded. Local characters differ from the shared party; choose whether to merge them into shared storage or stay local-only.",
              localMemberCount: partyMemberCount(localBundle),
              serverMemberCount: partyMemberCount(serverBundle),
              localBundle,
              serverBundle,
            }
            : undefined,
        });
      } catch (error) {
        setActivePartyRuntime(undefined);
        set({
          loading: false,
          connectionStatus: "disconnected",
          error: errorMessage(error, "Shared server unavailable."),
        });
      }
      return;
    }

    const storage = createPartyStorage("local-only");
    set({ loading: true, connectionStatus: "local" });
    try {
      const bundle = await loadOrCreateParty(partyId, "local-only");
      hydratePartyBundle(bundle);
      setActivePartyRuntime({ partyId: bundle.party.partyId, storage });
      set({ party: bundle.party, loading: false, connectionStatus: "local", error: undefined });
    } catch (error) {
      set({ loading: false, error: errorMessage(error, "Local party load failed.") });
    }
  },
  loadParty: async (partyId = DEFAULT_PARTY_ID) => {
    const mode = get().mode;
    const storage = createPartyStorage(mode);
    set({ loading: true, error: undefined });
    try {
      const bundle = mode === "shared-server" ? await loadSharedParty(partyId) : await loadOrCreateParty(partyId, mode);
      const localBundle = createPartyBundle(get().party ?? createPartyState(partyId), currentCharactersForParty(get().party));
      const localHasMembers = partyMemberCount(localBundle) > 0;
      const serverHasMembers = mode === "shared-server" && partyMemberCount(bundle) > 0;
      if (mode === "shared-server" && !serverHasMembers && localHasMembers) {
        setActivePartyRuntime(undefined);
        set({
          loading: false,
          connectionStatus: "connected",
          pendingConflict: {
            kind: "shared-switch",
            partyId,
            message: "Shared server is empty. Choose whether to merge local characters into shared storage or keep local-only mode.",
            localMemberCount: partyMemberCount(localBundle),
            serverMemberCount: partyMemberCount(bundle),
            localBundle,
            serverBundle: bundle,
          },
        });
        return;
      }
      hydratePartyBundle(bundle);
      setActivePartyRuntime({
        partyId: bundle.party.partyId,
        storage,
        onSaveError: (error) => set({ saveError: errorMessage(error, "Party save failed."), connectionStatus: "disconnected" }),
        onSaveSuccess: () => set({ lastSaveAt: new Date().toISOString(), saveError: undefined, connectionStatus: mode === "shared-server" ? "connected" : "local" }),
      });
      set({
        party: bundle.party,
        loading: false,
        error: undefined,
        connectionStatus: mode === "shared-server" ? "connected" : "local",
        lastSyncAt: new Date().toISOString(),
        pendingConflict: mode === "shared-server" && localHasMembers && serverHasMembers && bundlesHaveDifferentMembers(localBundle, bundle)
          ? {
            kind: "shared-switch",
            partyId,
            message: "Shared server data was loaded. Local characters differ from the shared party; choose whether to merge them into shared storage or stay local-only.",
            localMemberCount: partyMemberCount(localBundle),
            serverMemberCount: partyMemberCount(bundle),
            localBundle,
            serverBundle: bundle,
          }
          : undefined,
      });
    } catch (error) {
      if (mode === "shared-server") {
        setActivePartyRuntime(undefined);
        set({ loading: false, connectionStatus: "disconnected", error: errorMessage(error, "Shared server unavailable.") });
        return;
      }
      set({ loading: false, error: errorMessage(error, "Party load failed.") });
    }
  },
  saveParty: async (party, characters = currentCharactersForParty(party), options) => {
    const storage = createPartyStorage(get().mode);
    const nextParty = bumpParty(party, characters.map((entry) => entry.id));
    const nextBundle = createPartyBundle(nextParty, characters);
    try {
      if (get().mode === "shared-server" && !options?.force) {
        const serverBundle = await storage.loadParty(nextParty.partyId);
        if (wouldRemovePartyMembers(serverBundle, nextBundle)) {
          set({
            pendingConflict: {
              kind: "destructive-save",
              partyId: nextParty.partyId,
              message: "This save would remove characters from the shared party. Choose how to proceed.",
              localMemberCount: partyMemberCount(nextBundle),
              serverMemberCount: partyMemberCount(serverBundle),
              localBundle: nextBundle,
              serverBundle: serverBundle ?? createPartyBundle(createPartyState(nextParty.partyId), []),
              attemptedBundle: nextBundle,
            },
          });
          return;
        }
      }
      const bundle = await storage.saveParty(nextBundle, { strategy: options?.strategy ?? (get().mode === "shared-server" ? "merge" : "replace") });
      hydratePartyBundle(bundle);
      setActivePartyRuntime({
        partyId: bundle.party.partyId,
        storage,
        onSaveError: (error) => set({ saveError: errorMessage(error, "Party save failed."), connectionStatus: "disconnected" }),
        onSaveSuccess: () => set({ lastSaveAt: new Date().toISOString(), saveError: undefined, connectionStatus: get().mode === "shared-server" ? "connected" : "local" }),
      });
      set({
        party: bundle.party,
        error: undefined,
        saveError: undefined,
        lastSaveAt: new Date().toISOString(),
        connectionStatus: get().mode === "shared-server" ? "connected" : "local",
      });
    } catch (error) {
      set({ saveError: errorMessage(error, "Party save failed."), connectionStatus: get().mode === "shared-server" ? "disconnected" : "local" });
    }
  },
  resolvePendingConflict: async (action) => {
    const conflict = get().pendingConflict;
    if (!conflict) {
      return;
    }
    if (action === "cancel") {
      if (conflict.kind === "shared-switch") {
        hydratePartyBundle(conflict.localBundle);
        setStoredPartyStorageMode("local-only");
        const storage = createPartyStorage("local-only");
        setActivePartyRuntime({ partyId: conflict.partyId, storage });
        set({ mode: "local-only", party: conflict.localBundle.party, connectionStatus: "local", pendingConflict: undefined });
      } else {
        set({ pendingConflict: undefined });
      }
      return;
    }

    const storage = createPartyStorage("shared-server");
    const nextBundle = action === "merge-local"
      ? mergePartyBundles(conflict.serverBundle, conflict.attemptedBundle ?? conflict.localBundle)
      : conflict.attemptedBundle ?? conflict.localBundle;
    try {
      const bundle = await storage.saveParty(nextBundle, { strategy: action === "replace-shared" ? "replace" : "merge" });
      hydratePartyBundle(bundle);
      setStoredPartyStorageMode("shared-server");
      setActivePartyRuntime({
        partyId: bundle.party.partyId,
        storage,
        onSaveError: (error) => set({ saveError: errorMessage(error, "Party save failed."), connectionStatus: "disconnected" }),
        onSaveSuccess: () => set({ lastSaveAt: new Date().toISOString(), saveError: undefined, connectionStatus: "connected" }),
      });
      set({
        mode: "shared-server",
        party: bundle.party,
        pendingConflict: undefined,
        connectionStatus: "connected",
        saveError: undefined,
        lastSaveAt: new Date().toISOString(),
      });
    } catch (error) {
      set({ saveError: errorMessage(error, "Party save failed."), connectionStatus: "disconnected" });
    }
  },
  importCharactersToParty: async (characters) => {
    const currentParty = get().party ?? createPartyState(DEFAULT_PARTY_ID);
    const existing = useCharacterStore.getState().characters;
    const incomingById = new Map(characters.map((entry) => [entry.id, entry]));
    const merged = [
      ...existing.filter((entry) => !incomingById.has(entry.id)),
      ...characters,
    ];
    const partyCharacters = Array.from(new Set([...currentParty.characterIds, ...characters.map((entry) => entry.id)]))
      .map((id) => merged.find((entry) => entry.id === id))
      .filter((entry): entry is CharacterDraft => Boolean(entry));
    useCharacterStore.getState().replaceCharactersFromParty(merged);
    await get().saveParty(currentParty, partyCharacters, { strategy: "merge" });
  },
  exportParty: () => {
    const party = get().party ?? createPartyState(DEFAULT_PARTY_ID);
    return JSON.stringify(createPartyBundle(party, currentCharactersForParty(party)), null, 2);
  },
  subscribeToParty: (partyId) => {
    const storage = createPartyStorage(get().mode);
    return storage.subscribe(partyId, (event) => {
      void get().applyRemoteEvent(event);
    });
  },
  applyRemoteEvent: async (event) => {
    if (event.type === "sync-disconnected") {
      set({ syncError: event.message ?? "Shared sync stream disconnected.", connectionStatus: get().mode === "shared-server" ? "disconnected" : "local", lastRemoteUpdate: event });
      return;
    }
    if (isStalePartySyncEvent(event, get().party)) {
      return;
    }
    const storage = createPartyStorage(get().mode);
    if (event.type === "party-updated") {
      let bundle: PartyBundle | undefined;
      try {
        bundle = await storage.loadParty(event.partyId);
      } catch (error) {
        set({ syncError: errorMessage(error, "Party sync failed."), connectionStatus: get().mode === "shared-server" ? "disconnected" : "local" });
        return;
      }
      if (!bundle) {
        return;
      }
      if (isUnsafeEmptyPartyOverwrite(bundle, get().party)) {
        set({ syncError: "Ignored stale empty party update from sync.", lastRemoteUpdate: event });
        return;
      }
      hydratePartyBundle(bundle);
      set({ party: bundle.party, lastRemoteUpdate: event, lastSyncAt: new Date().toISOString(), syncError: undefined, connectionStatus: get().mode === "shared-server" ? "connected" : "local" });
      return;
    }
    let character: CharacterDraft | undefined;
    try {
      character = await storage.loadCharacter(event.partyId, event.characterId);
    } catch (error) {
      set({ syncError: errorMessage(error, "Character sync failed."), connectionStatus: get().mode === "shared-server" ? "disconnected" : "local" });
      return;
    }
    if (!character) {
      return;
    }
    withSuppressedPartyCharacterSaves(() => {
      useCharacterStore.getState().upsertRemoteCharacter(character);
    });
    set({ lastRemoteUpdate: event, lastSyncAt: new Date().toISOString(), syncError: undefined, connectionStatus: get().mode === "shared-server" ? "connected" : "local" });
  },
}));
