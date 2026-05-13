import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import {
  createPartyBundle,
  createPartyState,
  createPartyStorage,
  isStalePartySyncEvent,
  isUnsafeEmptyPartyOverwrite,
  mergePartyBundles,
  wouldRemovePartyMembers,
} from "../services/party";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("party shared session persistence repair v1", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads shared-server party data without pushing local state first", async () => {
    const character = createCharacterDraft("server-a", "Server A");
    const serverBundle = createPartyBundle(createPartyState("default", "Server Party", [character.id]), [character]);
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, options?: RequestInit) => {
      requests.push({ url: String(url), method: options?.method ?? "GET" });
      return jsonResponse(serverBundle);
    }));

    const loaded = await createPartyStorage("shared-server").loadParty("default");

    expect(loaded?.characters[0]?.id).toBe("server-a");
    expect(requests).toEqual([{ url: "/api/parties/default", method: "GET" }]);
  });

  it("uses merge as the default shared save strategy instead of destructive replace", async () => {
    const character = createCharacterDraft("merge-a", "Merge A");
    const bundle = createPartyBundle(createPartyState("default", "Merge Party", [character.id]), [character]);
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, options?: RequestInit) => {
      requests.push({ url: String(url), method: options?.method ?? "GET" });
      return jsonResponse(bundle);
    }));

    await createPartyStorage("shared-server").saveParty(bundle);

    expect(requests[0]).toEqual({ url: "/api/parties/default?strategy=merge", method: "PUT" });
  });

  it("detects destructive saves before server members would be removed", () => {
    const serverA = createCharacterDraft("server-a", "Server A");
    const serverB = createCharacterDraft("server-b", "Server B");
    const localA = createCharacterDraft("server-a", "Server A Local");
    const serverBundle = createPartyBundle(createPartyState("default", "Server", ["server-a", "server-b"]), [serverA, serverB]);
    const nextBundle = createPartyBundle(createPartyState("default", "Local", ["server-a"]), [localA]);

    expect(wouldRemovePartyMembers(serverBundle, nextBundle)).toBe(true);
    expect(mergePartyBundles(serverBundle, nextBundle).party.characterIds).toEqual(["server-a", "server-b"]);
  });

  it("ignores stale empty sync updates instead of clearing the visible party", () => {
    const currentParty = createPartyState("default", "Current", ["a"]);
    currentParty.version = 5;
    currentParty.updatedAt = "2026-05-13T12:00:00.000Z";
    const emptyBundle = createPartyBundle(createPartyState("default", "Empty", []), []);
    emptyBundle.party.version = 4;
    emptyBundle.party.updatedAt = "2026-05-13T11:00:00.000Z";

    expect(isStalePartySyncEvent({
      type: "party-updated",
      partyId: "default",
      version: 4,
      updatedAt: "2026-05-13T11:00:00.000Z",
    }, currentParty)).toBe(true);
    expect(isUnsafeEmptyPartyOverwrite(emptyBundle, currentParty)).toBe(true);
  });

  it("keeps party mode full-width with Party Rail, Sheet Main, and Roll Dock columns", () => {
    const appShell = readFileSync("src/app/AppShell.tsx", "utf8");
    const partyShell = readFileSync("src/features/party/PartyShell.tsx", "utf8");
    const sheetPage = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");

    expect(appShell).toContain('location.pathname.startsWith("/party/")');
    expect(appShell).toContain('partyMode ? "w-full px-2 py-2 lg:px-3"');
    expect(partyShell).toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(partyShell).toContain("PartyErrorBoundary");
    expect(sheetPage).toContain("lg:grid-cols-[minmax(0,1fr),340px]");
    expect(sheetPage).toContain("lg:h-full");
  });

  it("surfaces conflict/status UI and stable compact party tiles", () => {
    const partyShell = readFileSync("src/features/party/PartyShell.tsx", "utf8");
    const partyStore = readFileSync("src/store/partyStore.ts", "utf8");
    expect(partyShell).toContain("Destructive save blocked");
    expect(partyShell).toContain("Merge local into shared");
    expect(partyShell).toContain("Replace shared party");
    expect(partyShell).toContain("Sync disconnected");
    expect(partyShell).toContain("Members loaded");
    expect(partyShell).toContain("flex h-24 gap-3");
    expect(partyShell).toContain("aria-current");
    expect(partyStore).toContain("bundlesHaveDifferentMembers");
    expect(partyStore).toContain("Shared server data was loaded");
    expect(partyStore).toContain("hydratePartyBundle(conflict.localBundle)");
  });

  it("hardens the local party server persistence path", () => {
    const serverSource = readFileSync("scripts/party-server.mjs", "utf8");
    expect(serverSource).toContain("tempFilePath");
    expect(serverSource).toContain("await rename(tempPath, filePath)");
    expect(serverSource).toContain("backupFilePath");
    expect(serverSource).toContain("mergeBundles");
    expect(serverSource).toContain('strategy === "replace"');
    expect(serverSource).toContain("Party file for");
  });
});
