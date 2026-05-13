import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { createDefaultCharacterPlayState } from "../domain/playState";
import { buildPartyTiles } from "../features/party/partyViewModel";
import {
  bumpCharacterSync,
  createPartyBundle,
  createPartyState,
  createPartyStorage,
  setStoredPartyStorageMode,
} from "../services/party";

function installWindowStorage() {
  const values = new Map<string, string>();
  const listeners = new Map<string, Array<(event: Event) => void>>();
  class TestCustomEvent<T> extends Event {
    detail: T;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail as T;
    }
  }
  vi.stubGlobal("CustomEvent", TestCustomEvent);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("party shared session v1", () => {
  it("builds Party Shell routes and character tiles from the existing sheet data", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const shellSource = readFileSync("src/features/party/PartyShell.tsx", "utf8");
    expect(appSource).toContain("/party/:partyId/characters/:characterId");
    expect(shellSource).toContain("Party characters");
    expect(shellSource).toContain("to={`/party/${partyId}/characters/${tile.id}`}");

    const character = createCharacterDraft("tile-a", "Asha");
    character.classSelection.level = 3;
    character.playState.currentHp = 7;
    character.playState.tempHp = 2;
    const tiles = buildPartyTiles(createPartyState("default", "Test", [character.id]), [character]);
    expect(tiles[0]).toEqual(expect.objectContaining({
      id: "tile-a",
      name: "Asha",
      hpLabel: expect.stringContaining("/"),
      tempHpLabel: "+2 temp",
    }));
  });

  it("persists party state in local mode and exposes server mode through the shared storage interface", async () => {
    installWindowStorage();
    setStoredPartyStorageMode("shared-server");
    expect(createPartyStorage().mode).toBe("shared-server");

    const local = createPartyStorage("local-only");
    const character = createCharacterDraft("local-a", "Local A");
    const party = createPartyState("lan", "LAN Party", [character.id]);
    await local.saveParty(createPartyBundle(party, [character]));
    const loaded = await local.loadParty("lan");
    expect(loaded?.party.partyName).toBe("LAN Party");
    expect(loaded?.characters[0]?.id).toBe("local-a");
  });

  it("bumps character sync version and keeps updates scoped to the changed character", async () => {
    installWindowStorage();
    const storage = createPartyStorage("local-only");
    const characterA = createCharacterDraft("a", "A");
    const characterB = createCharacterDraft("b", "B");
    await storage.saveParty(createPartyBundle(createPartyState("party", "Party", ["a", "b"]), [characterA, characterB]));

    const updatedA = bumpCharacterSync({ ...characterA, name: "A Updated" }, "2026-05-13T12:00:00.000Z");
    await storage.saveCharacter("party", updatedA);
    const loaded = await storage.loadParty("party");
    expect(loaded?.characters.find((entry) => entry.id === "a")?.name).toBe("A Updated");
    expect(loaded?.characters.find((entry) => entry.id === "b")?.name).toBe("B");
    expect(updatedA.syncVersion).toBe((characterA.syncVersion ?? 1) + 1);
  });

  it("synchronizes local tab listeners and supports playState-only updates", async () => {
    installWindowStorage();
    const storage = createPartyStorage("local-only");
    const character = createCharacterDraft("sync-a", "Sync A");
    await storage.saveParty(createPartyBundle(createPartyState("sync", "Sync", [character.id]), [character]));
    const events: string[] = [];
    const unsubscribe = storage.subscribe("sync", (event) => {
      events.push(event.type);
    });

    const playState = createDefaultCharacterPlayState(character.id, { maxHp: 10, now: "2026-05-13T12:00:00.000Z" });
    playState.currentHp = 4;
    await storage.updateCharacterPlayState("sync", character.id, playState);
    unsubscribe();

    const loaded = await storage.loadCharacter("sync", character.id);
    expect(loaded?.playState.currentHp).toBe(4);
    expect(events).toContain("character-updated");
  });

  it("wires portrait/background editing, ally buff targeting, and import/export UI", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const actionSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const shellSource = readFileSync("src/features/party/PartyShell.tsx", "utf8");
    expect(sheetSource).toContain("portraitUrl");
    expect(sheetSource).toContain("backgroundImageUrl");
    expect(actionSource).toContain("partyAllies");
    expect(actionSource).toContain("onActivateEffectOnAlly");
    expect(actionSource).toContain("shared-server mode is required");
    expect(shellSource).toContain("Import Characters");
    expect(shellSource).toContain("Export Party JSON");
  });
});

