import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { useCharacterStore } from "../../store/characterStore";
import { usePartyStore } from "../../store/partyStore";
import { buildPartySessionReadiness } from "./sessionReadinessViewModel";

interface PartySessionDashboardProps {
  partyId: string;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "never";
  }
  return new Date(value).toLocaleString();
}

function serverInfoLabel(mode: "local-only" | "shared-server"): string {
  if (mode === "local-only") {
    return "browser local session";
  }
  if (typeof window === "undefined") {
    return "shared server";
  }
  return window.location.origin;
}

function downloadJson(fileName: string, payload: string) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function PartySessionDashboard({ partyId }: PartySessionDashboardProps) {
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const party = usePartyStore((state) => state.party);
  const mode = usePartyStore((state) => state.mode);
  const connectionStatus = usePartyStore((state) => state.connectionStatus);
  const error = usePartyStore((state) => state.error);
  const saveError = usePartyStore((state) => state.saveError);
  const syncError = usePartyStore((state) => state.syncError);
  const storageInfo = usePartyStore((state) => state.storageInfo);
  const lastSyncAt = usePartyStore((state) => state.lastSyncAt);
  const lastSaveAt = usePartyStore((state) => state.lastSaveAt);
  const lastLocalUpdateAt = usePartyStore((state) => state.lastLocalUpdateAt);
  const lastBackupAt = usePartyStore((state) => state.lastBackupAt);
  const manualBackups = usePartyStore((state) => state.manualBackups);
  const lastRemoteUpdate = usePartyStore((state) => state.lastRemoteUpdate);
  const exportParty = usePartyStore((state) => state.exportParty);
  const createManualBackup = usePartyStore((state) => state.createManualBackup);
  const restoreManualBackup = usePartyStore((state) => state.restoreManualBackup);
  const restorePartyBackupPayload = usePartyStore((state) => state.restorePartyBackupPayload);
  const loadParty = usePartyStore((state) => state.loadParty);
  const characters = useCharacterStore((state) => state.characters);
  const [backupMessage, setBackupMessage] = useState<string | undefined>();

  const readiness = useMemo(
    () => buildPartySessionReadiness(party, characters, { partyId }),
    [characters, party, partyId],
  );

  const hasUnsavedChanges =
    Boolean(lastLocalUpdateAt && (!lastSaveAt || lastLocalUpdateAt > lastSaveAt)) ||
    Boolean(saveError) ||
    Boolean(syncError);
  const latestBackup = manualBackups[0];

  return (
    <div className="min-h-0 overflow-y-auto pr-1">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
        <Panel title="Session Dashboard">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DashboardStat label="Party Name" value={party?.partyName ?? "Adventuring Party"} />
            <DashboardStat label="Server Mode" value={mode} />
            <DashboardStat label="Connection" value={connectionStatus} />
            <DashboardStat label="Members" value={String(readiness.memberCount)} />
            <DashboardStat label="Last Sync" value={formatTimestamp(lastSyncAt)} />
            <DashboardStat label="Last Save" value={formatTimestamp(lastSaveAt)} />
            <DashboardStat label="Storage" value={storageInfo ?? "pending"} />
            <DashboardStat label="Server Info" value={serverInfoLabel(mode)} />
            <DashboardStat label="Last Local Update" value={formatTimestamp(lastLocalUpdateAt)} />
            <DashboardStat
              label="Last Remote Update"
              value={lastRemoteUpdate ? `${lastRemoteUpdate.type} · ${formatTimestamp(lastRemoteUpdate.updatedAt)}` : "none"}
            />
          </div>
        </Panel>

        <Panel title="Session Safety">
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
              onClick={() => downloadJson(`${partyId}-party-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, exportParty())}
              type="button"
            >
              Export Full Party Backup
            </button>
            <button
              className="rounded bg-indigo-700 px-3 py-2 text-sm text-white"
              onClick={() => {
                const backup = createManualBackup();
                setBackupMessage(backup ? `Manual backup created at ${formatTimestamp(backup.createdAt)}.` : "Manual backup could not be created.");
              }}
              type="button"
            >
              Create Manual Backup Now
            </button>
            <button
              className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800"
              onClick={() => restoreInputRef.current?.click()}
              type="button"
            >
              Import / Restore Backup
            </button>
            {latestBackup ? (
              <button
                className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800"
                onClick={() => void restoreManualBackup(latestBackup.id)}
                type="button"
              >
                Restore Latest Browser Backup
              </button>
            ) : null}
          </div>
          <input
            ref={restoreInputRef}
            hidden
            accept="application/json"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void file.text().then(async (payload) => {
                await restorePartyBackupPayload(payload, partyId);
                setBackupMessage(`Backup restore requested from ${file.name}.`);
              }).catch(() => {
                setBackupMessage("Backup restore failed.");
              });
              event.target.value = "";
            }}
          />
          <div className="mt-3 space-y-2 text-sm">
            {hasUnsavedChanges ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                Warning: unsaved changes or sync/save issues are present. Create a backup before continuing.
              </p>
            ) : null}
            {saveError ? <p className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-900">Save error: {saveError}</p> : null}
            {syncError ? <p className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">Sync error: {syncError}</p> : null}
            {backupMessage ? <p className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-700">{backupMessage}</p> : null}
            <p className="text-xs text-slate-600">Latest browser backup: {latestBackup ? formatTimestamp(latestBackup.createdAt) : "none"}</p>
            <p className="text-xs text-slate-600">Last manual backup action: {formatTimestamp(lastBackupAt)}</p>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
        <Panel title="Character Readiness">
          {readiness.characters.length === 0 ? (
            <p className="text-sm text-slate-600">No party members loaded yet.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {readiness.characters.map((character) => (
                <Link
                  className="rounded border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-400 hover:bg-white"
                  key={character.id}
                  to={character.href}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{character.name}</p>
                      <p className="text-sm text-slate-600">{character.classLevelLabel}</p>
                    </div>
                    <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">L{character.level}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                    <span className="rounded bg-white px-2 py-1">HP {character.hpLabel}</span>
                    {character.armorClassLabel ? <span className="rounded bg-white px-2 py-1">{character.armorClassLabel}</span> : null}
                    <span className="rounded bg-white px-2 py-1">Pending {character.pendingChoices}</span>
                    <span className="rounded bg-white px-2 py-1">Manual/Unsupported {character.unsupportedManualRules}</span>
                    <span className="rounded bg-white px-2 py-1">Missing Components {character.missingSpellComponents}</span>
                    <span className="rounded bg-white px-2 py-1">Depleted Resources {character.depletedResources}</span>
                  </div>
                  {character.topNotes.length ? <p className="mt-3 text-xs text-slate-600">{character.topNotes.join(" · ")}</p> : null}
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Shared Mode Diagnostics">
          <div className="grid gap-2 text-sm">
            <DashboardStat label="SSE" value={mode === "shared-server" ? connectionStatus : "local-only"} compact />
            <DashboardStat label="Last Remote Update" value={lastRemoteUpdate ? `${lastRemoteUpdate.type} · ${formatTimestamp(lastRemoteUpdate.updatedAt)}` : "none"} compact />
            <DashboardStat label="Last Local Update" value={formatTimestamp(lastLocalUpdateAt)} compact />
            <DashboardStat label="Load Error" value={error ?? "none"} compact />
            <DashboardStat label="Save Error" value={saveError ?? "none"} compact />
            <DashboardStat label="Sync Error" value={syncError ?? "none"} compact />
          </div>
          <button className="mt-3 rounded bg-slate-800 px-3 py-2 text-sm text-white" onClick={() => void loadParty(partyId)} type="button">
            Retry
          </button>
        </Panel>
      </div>

      <div className="mt-3">
        <Panel title="Known Gaps Overview">
          {readiness.knownGaps.length === 0 ? (
            <p className="text-sm text-slate-600">No player-facing gaps are currently flagged from party diagnostics.</p>
          ) : (
            <div className="space-y-2">
              {readiness.knownGaps.map((gap) => (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" key={gap.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{gap.label}</p>
                      <p className="mt-1 text-xs">{gap.detail}</p>
                    </div>
                    <Link className="rounded bg-white px-2 py-1 text-xs text-slate-800" to={`/party/${partyId}/characters/${gap.characterId}`}>
                      Open Sheet
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DashboardStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded border border-slate-200 bg-slate-50 p-2 ${compact ? "" : "min-h-20"}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
