import type { CharacterDraft } from "../../domain/character";
import type { CharacterPlayState } from "../../domain/playState";
import type { PartyBundle, PartySaveStrategy, PartyState, PartyStorageMode, PartySyncEvent } from "../../domain/party";
import { deserializeCharacters, serializeCharacters } from "../persistence/characterPersistence";

export const PARTY_STORAGE_MODE_KEY = "mpmb-party-storage-mode:v1";
export const DEFAULT_PARTY_ID = "default";

const LOCAL_PARTY_STORAGE_PREFIX = "mpmb-party-session:v1:";
const SERVER_BASE = "/api/parties";

export interface PartySaveOptions {
  strategy?: PartySaveStrategy;
}

export interface PartyStorageAdapter {
  mode: PartyStorageMode;
  loadParty: (partyId: string) => Promise<PartyBundle | undefined>;
  saveParty: (bundle: PartyBundle, options?: PartySaveOptions) => Promise<PartyBundle>;
  listCharacters: (partyId: string) => Promise<CharacterDraft[]>;
  loadCharacter: (partyId: string, characterId: string) => Promise<CharacterDraft | undefined>;
  saveCharacter: (partyId: string, character: CharacterDraft) => Promise<CharacterDraft>;
  updateCharacterPlayState: (partyId: string, characterId: string, playState: CharacterPlayState) => Promise<CharacterDraft | undefined>;
  subscribe: (partyId: string, onEvent: (event: PartySyncEvent) => void) => () => void;
}

export function createPartyState(partyId = DEFAULT_PARTY_ID, partyName = "Adventuring Party", characterIds: string[] = []): PartyState {
  const now = new Date().toISOString();
  return {
    partyId,
    partyName,
    characterIds: Array.from(new Set(characterIds)),
    updatedAt: now,
    version: 1,
  };
}

export function createPartyBundle(party: PartyState, characters: CharacterDraft[]): PartyBundle {
  return {
    version: 1,
    party: {
      ...party,
      characterIds: Array.from(new Set(party.characterIds.length ? party.characterIds : characters.map((entry) => entry.id))),
    },
    characters,
    exportedAt: new Date().toISOString(),
  };
}

export function bumpCharacterSync(character: CharacterDraft, updatedAt = new Date().toISOString()): CharacterDraft {
  return {
    ...character,
    syncVersion: (character.syncVersion ?? 0) + 1,
    updatedAt,
  };
}

export function bumpParty(party: PartyState, characterIds = party.characterIds): PartyState {
  return {
    ...party,
    characterIds: Array.from(new Set(characterIds)),
    updatedAt: new Date().toISOString(),
    version: party.version + 1,
  };
}

export function normalizePartyBundle(input: unknown, fallbackPartyId = DEFAULT_PARTY_ID): PartyBundle {
  const source = input && typeof input === "object" ? input as Partial<PartyBundle> : {};
  const rawCharacters = Array.isArray(source.characters) ? source.characters : [];
  const characters = deserializeCharacters(serializeCharacters(rawCharacters as CharacterDraft[]));
  const rawParty = source.party && typeof source.party === "object" ? source.party as Partial<PartyState> : {};
  const party = createPartyState(
    typeof rawParty.partyId === "string" && rawParty.partyId ? rawParty.partyId : fallbackPartyId,
    typeof rawParty.partyName === "string" && rawParty.partyName ? rawParty.partyName : "Adventuring Party",
    Array.isArray(rawParty.characterIds) ? rawParty.characterIds.filter((entry): entry is string => typeof entry === "string") : characters.map((entry) => entry.id),
  );
  return {
    version: 1,
    party: {
      ...party,
      updatedAt: typeof rawParty.updatedAt === "string" ? rawParty.updatedAt : party.updatedAt,
      version: typeof rawParty.version === "number" && Number.isFinite(rawParty.version) ? Math.max(1, Math.floor(rawParty.version)) : party.version,
      activeCharacterId: typeof rawParty.activeCharacterId === "string" ? rawParty.activeCharacterId : undefined,
    },
    characters,
    exportedAt: typeof source.exportedAt === "string" ? source.exportedAt : new Date().toISOString(),
    storageMeta: source.storageMeta && typeof source.storageMeta === "object"
      ? {
        source: source.storageMeta.source === "shared-server" ? "shared-server" : source.storageMeta.source === "local-only" ? "local-only" : undefined,
        persisted: typeof source.storageMeta.persisted === "boolean" ? source.storageMeta.persisted : undefined,
        loadedAt: typeof source.storageMeta.loadedAt === "string" ? source.storageMeta.loadedAt : undefined,
        storagePath: typeof source.storageMeta.storagePath === "string" ? source.storageMeta.storagePath : undefined,
        serverInfo: typeof source.storageMeta.serverInfo === "string" ? source.storageMeta.serverInfo : undefined,
      }
      : undefined,
  };
}

export function partyMemberCount(bundle: PartyBundle | undefined): number {
  if (!bundle) {
    return 0;
  }
  return new Set([
    ...bundle.party.characterIds,
    ...bundle.characters.map((entry) => entry.id),
  ]).size;
}

export function mergePartyBundles(serverBundle: PartyBundle, incomingBundle: PartyBundle): PartyBundle {
  const charactersById = new Map<string, CharacterDraft>();
  for (const character of serverBundle.characters) {
    charactersById.set(character.id, character);
  }
  for (const character of incomingBundle.characters) {
    charactersById.set(character.id, character);
  }
  const characterIds = Array.from(new Set([
    ...serverBundle.party.characterIds,
    ...incomingBundle.party.characterIds,
    ...incomingBundle.characters.map((entry) => entry.id),
  ]));
  return createPartyBundle(
    {
      ...serverBundle.party,
      ...incomingBundle.party,
      characterIds,
      version: Math.max(serverBundle.party.version, incomingBundle.party.version),
      updatedAt: incomingBundle.party.updatedAt > serverBundle.party.updatedAt ? incomingBundle.party.updatedAt : serverBundle.party.updatedAt,
    },
    characterIds
      .map((id) => charactersById.get(id))
      .filter((entry): entry is CharacterDraft => Boolean(entry)),
  );
}

export function wouldRemovePartyMembers(serverBundle: PartyBundle | undefined, nextBundle: PartyBundle): boolean {
  if (!serverBundle || partyMemberCount(serverBundle) === 0) {
    return false;
  }
  const nextIds = new Set([
    ...nextBundle.party.characterIds,
    ...nextBundle.characters.map((entry) => entry.id),
  ]);
  return serverBundle.party.characterIds.some((id) => !nextIds.has(id));
}

export function isStalePartySyncEvent(event: PartySyncEvent, currentParty: PartyState | undefined): boolean {
  if (event.type !== "party-updated") {
    return false;
  }
  if (event.version === 0) {
    return true;
  }
  if (!currentParty) {
    return false;
  }
  if (event.version < currentParty.version) {
    return true;
  }
  return event.version === currentParty.version && event.updatedAt <= currentParty.updatedAt;
}

export function isUnsafeEmptyPartyOverwrite(bundle: PartyBundle, currentParty: PartyState | undefined): boolean {
  if (!currentParty || currentParty.characterIds.length === 0) {
    return false;
  }
  if (partyMemberCount(bundle) > 0) {
    return false;
  }
  if (bundle.party.version < currentParty.version) {
    return true;
  }
  return bundle.party.version === currentParty.version && bundle.party.updatedAt <= currentParty.updatedAt;
}

function partyStorageKey(partyId: string): string {
  return `${LOCAL_PARTY_STORAGE_PREFIX}${partyId}`;
}

function localStorageLabel(partyId: string): string {
  return `localStorage:${partyStorageKey(partyId)}`;
}

function browserOrigin(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return typeof window.location?.origin === "string" ? window.location.origin : undefined;
}

function readLocalBundle(partyId: string): PartyBundle | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = window.localStorage.getItem(partyStorageKey(partyId));
  if (!raw) {
    return undefined;
  }
  return normalizePartyBundle(JSON.parse(raw), partyId);
}

function writeLocalBundle(bundle: PartyBundle): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(partyStorageKey(bundle.party.partyId), JSON.stringify(bundle, null, 2));
}

function emitLocalSync(event: PartySyncEvent): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("mpmb-party-sync", { detail: event }));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("mpmb-party-sync");
    channel.postMessage(event);
    channel.close();
  }
}

export function getStoredPartyStorageMode(): PartyStorageMode {
  if (typeof window === "undefined") {
    return "local-only";
  }
  const stored = window.localStorage.getItem(PARTY_STORAGE_MODE_KEY);
  if (stored === "shared-server" || stored === "local-only") {
    return stored;
  }
  const pathname = typeof window.location?.pathname === "string" ? window.location.pathname : "";
  return pathname.startsWith("/party/") ? "shared-server" : "local-only";
}

export function setStoredPartyStorageMode(mode: PartyStorageMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PARTY_STORAGE_MODE_KEY, mode);
}

function localPartyStorage(): PartyStorageAdapter {
  return {
    mode: "local-only",
    async loadParty(partyId) {
      const bundle = readLocalBundle(partyId);
      return bundle
        ? {
          ...bundle,
          storageMeta: {
            ...bundle.storageMeta,
            source: "local-only",
            persisted: true,
            loadedAt: new Date().toISOString(),
            storagePath: localStorageLabel(partyId),
            serverInfo: browserOrigin(),
          },
        }
        : undefined;
    },
    async saveParty(bundle) {
      const normalized = {
        ...normalizePartyBundle(bundle, bundle.party.partyId),
        storageMeta: {
          ...bundle.storageMeta,
          source: "local-only" as const,
          persisted: true,
          loadedAt: new Date().toISOString(),
          storagePath: localStorageLabel(bundle.party.partyId),
          serverInfo: browserOrigin(),
        },
      };
      writeLocalBundle(normalized);
      emitLocalSync({
        type: "party-updated",
        partyId: normalized.party.partyId,
        updatedAt: normalized.party.updatedAt,
        version: normalized.party.version,
      });
      return normalized;
    },
    async listCharacters(partyId) {
      return readLocalBundle(partyId)?.characters ?? [];
    },
    async loadCharacter(partyId, characterId) {
      return readLocalBundle(partyId)?.characters.find((entry) => entry.id === characterId);
    },
    async saveCharacter(partyId, character) {
      const current = readLocalBundle(partyId) ?? createPartyBundle(createPartyState(partyId), []);
      const characters = current.characters.filter((entry) => entry.id !== character.id);
      const nextCharacter = character;
      const nextParty = bumpParty(current.party, [...current.party.characterIds, nextCharacter.id]);
      const next = {
        ...createPartyBundle(nextParty, [...characters, nextCharacter]),
        storageMeta: {
          source: "local-only" as const,
          persisted: true,
          loadedAt: new Date().toISOString(),
          storagePath: localStorageLabel(partyId),
          serverInfo: browserOrigin(),
        },
      };
      writeLocalBundle(next);
      emitLocalSync({
        type: "character-updated",
        partyId,
        characterId: nextCharacter.id,
        updatedAt: nextCharacter.updatedAt,
        version: nextCharacter.syncVersion ?? nextParty.version,
      });
      return nextCharacter;
    },
    async updateCharacterPlayState(partyId, characterId, playState) {
      const current = readLocalBundle(partyId);
      const character = current?.characters.find((entry) => entry.id === characterId);
      if (!character) {
        return undefined;
      }
      const updated = bumpCharacterSync({ ...character, playState });
      return this.saveCharacter(partyId, updated);
    },
    subscribe(partyId, onEvent) {
      const storageHandler = (event: StorageEvent) => {
        if (event.key !== partyStorageKey(partyId) || !event.newValue) {
          return;
        }
        const bundle = normalizePartyBundle(JSON.parse(event.newValue), partyId);
        onEvent({ type: "party-updated", partyId, updatedAt: bundle.party.updatedAt, version: bundle.party.version });
      };
      const customHandler = (event: Event) => {
        const detail = (event as CustomEvent<PartySyncEvent>).detail;
        if (detail?.partyId === partyId) {
          onEvent(detail);
        }
      };
      let channel: BroadcastChannel | undefined;
      if (typeof window !== "undefined") {
        window.addEventListener("storage", storageHandler);
        window.addEventListener("mpmb-party-sync", customHandler);
        if ("BroadcastChannel" in window) {
          channel = new BroadcastChannel("mpmb-party-sync");
          channel.onmessage = (event) => {
            const detail = event.data as PartySyncEvent;
            if (detail?.partyId === partyId) {
              onEvent(detail);
            }
          };
        }
      }
      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", storageHandler);
          window.removeEventListener("mpmb-party-sync", customHandler);
        }
        channel?.close();
      };
    },
  };
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (response.status === 404) {
    return undefined as T;
  }
  if (!response.ok) {
    throw new Error(`Party server request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function serverPartyStorage(): PartyStorageAdapter {
  return {
    mode: "shared-server",
    async loadParty(partyId) {
      const data = await fetchJson<PartyBundle | undefined>(`${SERVER_BASE}/${encodeURIComponent(partyId)}`);
      return data ? normalizePartyBundle(data, partyId) : undefined;
    },
    async saveParty(bundle, options) {
      const strategy = options?.strategy ?? "merge";
      const data = await fetchJson<PartyBundle>(`${SERVER_BASE}/${encodeURIComponent(bundle.party.partyId)}?strategy=${encodeURIComponent(strategy)}`, {
        method: "PUT",
        body: JSON.stringify(normalizePartyBundle(bundle, bundle.party.partyId)),
      });
      return normalizePartyBundle(data, bundle.party.partyId);
    },
    async listCharacters(partyId) {
      const data = await fetchJson<{ characters: CharacterDraft[] }>(`${SERVER_BASE}/${encodeURIComponent(partyId)}/characters`);
      return data?.characters ?? [];
    },
    async loadCharacter(partyId, characterId) {
      const data = await fetchJson<CharacterDraft | undefined>(`${SERVER_BASE}/${encodeURIComponent(partyId)}/characters/${encodeURIComponent(characterId)}`);
      return data;
    },
    async saveCharacter(partyId, character) {
      return fetchJson<CharacterDraft>(`${SERVER_BASE}/${encodeURIComponent(partyId)}/characters/${encodeURIComponent(character.id)}`, {
        method: "PUT",
        body: JSON.stringify(character),
      });
    },
    async updateCharacterPlayState(partyId, characterId, playState) {
      return fetchJson<CharacterDraft | undefined>(`${SERVER_BASE}/${encodeURIComponent(partyId)}/characters/${encodeURIComponent(characterId)}/play-state`, {
        method: "PATCH",
        body: JSON.stringify({ playState }),
      });
    },
    subscribe(partyId, onEvent) {
      if (typeof EventSource === "undefined") {
        return () => undefined;
      }
      const source = new EventSource(`${SERVER_BASE}/${encodeURIComponent(partyId)}/events`);
      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as PartySyncEvent;
          onEvent(parsed);
        } catch {
          // Ignore malformed sync packets.
        }
      };
      source.onerror = () => {
        onEvent({
          type: "sync-disconnected",
          partyId,
          updatedAt: new Date().toISOString(),
          version: 0,
          message: "Shared sync stream disconnected.",
        });
      };
      return () => source.close();
    },
  };
}

export function createPartyStorage(mode: PartyStorageMode = getStoredPartyStorageMode()): PartyStorageAdapter {
  return mode === "shared-server" ? serverPartyStorage() : localPartyStorage();
}
