import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { createPartyBundle, createPartyState, createManualPartyBackup, loadManualPartyBackups, parsePartyBackupPayload, restoreManualPartyBackup } from "../services/party";
import { buildPartySessionReadiness } from "../features/party/sessionReadinessViewModel";
import { buildPaladinFixtureAtLevel, buildWarlockFixtureAtLevel } from "./support/phbGoldenFixtures";

function installWindowStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("play session readiness v1", () => {
  it("renders the party session dashboard instead of redirecting away from /party/:partyId", () => {
    const pageSource = readFileSync("src/pages/PartyPage.tsx", "utf8");
    const dashboardSource = readFileSync("src/features/party/PartySessionDashboard.tsx", "utf8");
    expect(pageSource).toContain("PartySessionDashboard");
    expect(pageSource).not.toContain("Navigate replace");
    expect(dashboardSource).toContain('Panel title="Session Dashboard"');
    expect(dashboardSource).toContain('Panel title="Character Readiness"');
    expect(dashboardSource).toContain('Panel title="Known Gaps Overview"');
  });

  it("exports full-party backups into browser backup storage", () => {
    installWindowStorage();
    const character = createCharacterDraft("backup-a", "Backup A");
    const bundle = createPartyBundle(createPartyState("default", "Backup Party", [character.id]), [character]);

    const record = createManualPartyBackup(bundle, "2026-05-13T18:00:00.000Z");
    const backups = loadManualPartyBackups();

    expect(record.partyId).toBe("default");
    expect(backups[0]?.bundle.characters[0]?.id).toBe("backup-a");
    expect(backups[0]?.memberCount).toBe(1);
  });

  it("restores backups from stored records and imported payloads", () => {
    installWindowStorage();
    const character = createCharacterDraft("restore-a", "Restore A");
    const bundle = createPartyBundle(createPartyState("default", "Restore Party", [character.id]), [character]);
    const record = createManualPartyBackup(bundle, "2026-05-13T18:05:00.000Z");

    const restored = restoreManualPartyBackup(record.id);
    const parsed = parsePartyBackupPayload(JSON.stringify(bundle), "default");

    expect(restored?.party.partyName).toBe("Restore Party");
    expect(parsed.characters[0]?.id).toBe("restore-a");
  });

  it("lists pending choices and unsupported/manual rules in character readiness", () => {
    const paladin = buildPaladinFixtureAtLevel(4).draft;
    const warlock = buildWarlockFixtureAtLevel(5).draft;
    const pendingPaladin = {
      ...paladin,
      levelUp: {
        ...paladin.levelUp,
        abilityScoreIncreases: {},
        featChoices: {},
      },
    };
    const readiness = buildPartySessionReadiness(
      createPartyState("default", "Readiness", [pendingPaladin.id, warlock.id]),
      [pendingPaladin, warlock],
      { partyId: "default" },
    );

    const paladinEntry = readiness.characters.find((entry) => entry.id === pendingPaladin.id);
    const warlockEntry = readiness.characters.find((entry) => entry.id === warlock.id);

    expect(paladinEntry?.pendingChoices ?? 0).toBeGreaterThan(0);
    expect(warlockEntry?.unsupportedManualRules ?? 0).toBeGreaterThan(0);
    expect(readiness.knownGaps.some((entry) => entry.characterId === pendingPaladin.id)).toBe(true);
  });

  it("shows shared sync diagnostics and save-error visibility in the dashboard UI", () => {
    const dashboardSource = readFileSync("src/features/party/PartySessionDashboard.tsx", "utf8");
    expect(dashboardSource).toContain('Panel title="Shared Mode Diagnostics"');
    expect(dashboardSource).toContain('label="SSE"');
    expect(dashboardSource).toContain("Last Remote Update");
    expect(dashboardSource).toContain("Last Local Update");
    expect(dashboardSource).toContain("Save error:");
    expect(dashboardSource).toContain("Retry");
  });
});
