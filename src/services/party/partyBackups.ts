import type { PartyBundle } from "../../domain/party";
import { DEFAULT_PARTY_ID, normalizePartyBundle, partyMemberCount } from "./partyStorage";

export interface PartyManualBackupRecord {
  id: string;
  partyId: string;
  partyName: string;
  createdAt: string;
  memberCount: number;
  bundle: PartyBundle;
}

const PARTY_MANUAL_BACKUPS_KEY = "mpmb-party-manual-backups:v1";
const MAX_MANUAL_BACKUPS = 8;

function readStoredBackups(): unknown {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(PARTY_MANUAL_BACKUPS_KEY);
  if (!raw) {
    return [];
  }
  return JSON.parse(raw);
}

function writeStoredBackups(backups: PartyManualBackupRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PARTY_MANUAL_BACKUPS_KEY, JSON.stringify(backups, null, 2));
}

function normalizeBackupRecord(input: unknown): PartyManualBackupRecord | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const source = input as Partial<PartyManualBackupRecord>;
  const bundle = normalizePartyBundle(source.bundle, typeof source.partyId === "string" ? source.partyId : DEFAULT_PARTY_ID);
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : bundle.exportedAt;
  return {
    id: typeof source.id === "string" && source.id ? source.id : `backup:${bundle.party.partyId}:${createdAt}`,
    partyId: bundle.party.partyId,
    partyName: bundle.party.partyName,
    createdAt,
    memberCount: partyMemberCount(bundle),
    bundle,
  };
}

export function loadManualPartyBackups(): PartyManualBackupRecord[] {
  const stored = readStoredBackups();
  const raw = Array.isArray(stored) ? stored : [];
  return raw
    .map(normalizeBackupRecord)
    .filter((entry): entry is PartyManualBackupRecord => Boolean(entry))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createManualPartyBackup(bundle: PartyBundle, now = new Date().toISOString()): PartyManualBackupRecord {
  const normalized = normalizePartyBundle(bundle, bundle.party.partyId);
  const record: PartyManualBackupRecord = {
    id: `backup:${normalized.party.partyId}:${now}`,
    partyId: normalized.party.partyId,
    partyName: normalized.party.partyName,
    createdAt: now,
    memberCount: partyMemberCount(normalized),
    bundle: {
      ...normalized,
      exportedAt: now,
    },
  };
  const existing = loadManualPartyBackups().filter((entry) => entry.id !== record.id);
  writeStoredBackups([record, ...existing].slice(0, MAX_MANUAL_BACKUPS));
  return record;
}

export function restoreManualPartyBackup(backupId: string): PartyBundle | undefined {
  return loadManualPartyBackups().find((entry) => entry.id === backupId)?.bundle;
}

export function parsePartyBackupPayload(payload: string, fallbackPartyId = DEFAULT_PARTY_ID): PartyBundle {
  return normalizePartyBundle(JSON.parse(payload), fallbackPartyId);
}
