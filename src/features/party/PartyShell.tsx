import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PartyStorageMode } from "../../domain/party";
import { deserializeCharacters } from "../../services/persistence/characterPersistence";
import { createPartyState } from "../../services/party";
import { useCharacterStore } from "../../store/characterStore";
import { usePartyStore } from "../../store/partyStore";
import { buildPartyTiles } from "./partyViewModel";

interface PartyShellProps extends PropsWithChildren {
  partyId: string;
  selectedCharacterId?: string;
}

function tileImageStyle(src: string | undefined, themeColor: string | undefined) {
  return src
    ? { backgroundImage: `linear-gradient(90deg, rgb(15 23 42 / 0.72), rgb(15 23 42 / 0.42)), url(${src})` }
    : { backgroundColor: themeColor ?? "#334155" };
}

function serverUrlLabel(): string {
  if (typeof window === "undefined") {
    return "/api/parties";
  }
  return `${window.location.origin}/api/parties`;
}

class PartyErrorBoundary extends Component<{ children: ReactNode }, { error?: Error; details?: string }> {
  state: { error?: Error; details?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, details: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="sheet-card m-3 border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
          <h2 className="text-base font-semibold">Load failed</h2>
          <p className="mt-1">The party sheet could not render. The last loaded party state was kept in storage.</p>
          <details className="mt-3">
            <summary className="cursor-pointer font-medium">Details/Diagnostics</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs">{this.state.error.message}{this.state.details ? `\n${this.state.details}` : ""}</pre>
          </details>
          <button className="mt-3 rounded bg-rose-800 px-3 py-2 text-white" onClick={() => this.setState({ error: undefined, details: undefined })} type="button">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PartyShell({ children, partyId, selectedCharacterId }: PartyShellProps) {
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  const party = usePartyStore((state) => state.party);
  const mode = usePartyStore((state) => state.mode);
  const loading = usePartyStore((state) => state.loading);
  const error = usePartyStore((state) => state.error);
  const saveError = usePartyStore((state) => state.saveError);
  const syncError = usePartyStore((state) => state.syncError);
  const connectionStatus = usePartyStore((state) => state.connectionStatus);
  const lastSyncAt = usePartyStore((state) => state.lastSyncAt);
  const lastSaveAt = usePartyStore((state) => state.lastSaveAt);
  const pendingConflict = usePartyStore((state) => state.pendingConflict);
  const lastRemoteUpdate = usePartyStore((state) => state.lastRemoteUpdate);
  const loadParty = usePartyStore((state) => state.loadParty);
  const setMode = usePartyStore((state) => state.setMode);
  const saveParty = usePartyStore((state) => state.saveParty);
  const resolvePendingConflict = usePartyStore((state) => state.resolvePendingConflict);
  const exportParty = usePartyStore((state) => state.exportParty);
  const importCharactersToParty = usePartyStore((state) => state.importCharactersToParty);
  const subscribeToParty = usePartyStore((state) => state.subscribeToParty);
  const characters = useCharacterStore((state) => state.characters);
  const createCharacter = useCharacterStore((state) => state.createCharacter);
  const partyCharacters = useMemo(
    () => buildPartyTiles(party, characters),
    [characters, party],
  );
  const [partyNameDraft, setPartyNameDraft] = useState(party?.partyName ?? "Adventuring Party");
  const [importError, setImportError] = useState<string | undefined>();

  useEffect(() => {
    void loadParty(partyId);
  }, [loadParty, partyId]);

  useEffect(() => {
    const unsubscribe = subscribeToParty(partyId);
    return unsubscribe;
  }, [partyId, subscribeToParty, mode]);

  useEffect(() => {
    if (party?.partyName) {
      setPartyNameDraft(party.partyName);
    }
  }, [party?.partyName]);

  const updatePartyName = () => {
    const current = party ?? createPartyState(partyId);
    void saveParty({ ...current, partyName: partyNameDraft.trim() || "Adventuring Party" });
  };

  const addCharacterToParty = () => {
    const id = createCharacter("New Party Character");
    const current = party ?? createPartyState(partyId);
    const nextParty = {
      ...current,
      characterIds: Array.from(new Set([...current.characterIds, id])),
    };
    void saveParty(nextParty, useCharacterStore.getState().characters);
    navigate(`/party/${partyId}/characters/${id}`);
  };

  const importPayload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { characters?: unknown };
      const charactersToImport = Array.isArray(parsed.characters)
        ? deserializeCharacters(JSON.stringify({ version: 2, characters: parsed.characters }))
        : deserializeCharacters(text);
      await importCharactersToParty(charactersToImport);
      setImportError(undefined);
    } catch {
      setImportError("Import failed: invalid character or party JSON.");
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-4.5rem)] gap-3 lg:h-[calc(100vh-4.5rem)] lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="sheet-card flex min-h-0 flex-col overflow-hidden border-slate-300 bg-white lg:h-full">
        <div className="border-b border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Party</p>
              <h2 className="text-base font-semibold text-slate-900">{party?.partyName ?? "Adventuring Party"}</h2>
            </div>
            <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">{connectionStatus}</span>
          </div>
          <div className="mt-3 grid gap-2">
            <input
              aria-label="Party name"
              className="sheet-no-overflow rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              onChange={(event) => setPartyNameDraft(event.target.value)}
              value={partyNameDraft}
            />
            <button className="sheet-focus-ring rounded bg-slate-800 px-2 py-1.5 text-xs text-white" onClick={updatePartyName} type="button">
              Save Party
            </button>
            <select
              aria-label="Party storage mode"
              className="sheet-no-overflow rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              onChange={(event) => void setMode(event.target.value as PartyStorageMode, partyId)}
              value={mode}
            >
              <option value="local-only">local-only</option>
              <option value="shared-server">shared-server (LAN)</option>
            </select>
          </div>
          <div className="mt-3 grid gap-1 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
            <span>Mode: {mode}</span>
            <span>Party ID: {party?.partyId ?? partyId}</span>
            <span>Server: {serverUrlLabel()}</span>
            <span>Members loaded: {partyCharacters.length}</span>
            <span>Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "never"}</span>
            <span>Last save: {lastSaveAt ? new Date(lastSaveAt).toLocaleTimeString() : "never"}</span>
          </div>
          {error ? <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Load failed: {error}</p> : null}
          {saveError ? <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">Save failed: {saveError}</p> : null}
          {syncError ? <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Sync disconnected: {syncError}</p> : null}
          {(error || syncError) ? (
            <button className="mt-2 rounded bg-slate-800 px-2 py-1.5 text-xs text-white" onClick={() => void loadParty(partyId)} type="button">
              Retry
            </button>
          ) : null}
          {lastRemoteUpdate ? <p className="mt-2 text-xs text-slate-500">Updated from another tab/device: {lastRemoteUpdate.type}</p> : null}
          {pendingConflict ? (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <p className="font-semibold">{pendingConflict.kind === "destructive-save" ? "Destructive save blocked" : "Shared storage needs a choice"}</p>
              <p className="mt-1">{pendingConflict.message}</p>
              <p className="mt-1">Local {pendingConflict.localMemberCount} / Shared {pendingConflict.serverMemberCount} members</p>
              <div className="mt-3 grid gap-2">
                <button className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-800" onClick={() => void resolvePendingConflict("cancel")} type="button">
                  Cancel
                </button>
                <button className="rounded bg-indigo-700 px-2 py-1.5 text-white" onClick={() => void resolvePendingConflict("merge-local")} type="button">
                  Merge local into shared
                </button>
                <button className="rounded bg-rose-700 px-2 py-1.5 text-white" onClick={() => void resolvePendingConflict("replace-shared")} type="button">
                  Replace shared party
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <nav aria-label="Party characters" className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {loading ? <p className="p-2 text-sm text-slate-600">Loading party...</p> : null}
          {partyCharacters.map((tile) => (
            <Link
              aria-current={tile.id === selectedCharacterId ? "page" : undefined}
              className={`sheet-focus-ring block overflow-hidden rounded border text-left transition ${
                tile.id === selectedCharacterId ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-400"
              }`}
              key={tile.id}
              style={tileImageStyle(tile.backgroundSrc, tile.themeColor)}
              to={`/party/${partyId}/characters/${tile.id}`}
            >
              <div className="flex h-24 gap-3 bg-slate-950/30 p-2 text-white">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded border border-white/40 bg-slate-700 text-lg font-semibold">
                  {tile.portraitSrc ? <img alt="" className="h-full w-full object-cover" src={tile.portraitSrc} /> : tile.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{tile.name}</p>
                  <p className="truncate text-xs text-slate-100">{tile.classLevelLabel}</p>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded bg-white/20 px-1.5 py-0.5">HP {tile.hpLabel}</span>
                    {tile.tempHpLabel ? <span className="rounded bg-white/20 px-1.5 py-0.5">{tile.tempHpLabel}</span> : null}
                    {tile.armorClassLabel ? <span className="rounded bg-white/20 px-1.5 py-0.5">{tile.armorClassLabel}</span> : null}
                    {tile.concentrating ? <span className="rounded bg-indigo-300 px-1.5 py-0.5 text-indigo-950">Concentration</span> : null}
                  </div>
                  {tile.conditionLabels.length ? <p className="mt-1 truncate text-[11px] text-slate-100">{tile.conditionLabels.join(", ")}</p> : null}
                </div>
              </div>
            </Link>
          ))}
        </nav>

        <div className="space-y-2 border-t border-slate-200 p-3">
          <button className="sheet-focus-ring w-full rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={addCharacterToParty} type="button">
            New Party Character
          </button>
          <button className="sheet-focus-ring w-full rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => importInputRef.current?.click()} type="button">
            Import Characters
          </button>
          <button className="sheet-focus-ring w-full rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => downloadJson(`${partyId}-party.json`, exportParty())} type="button">
            Export Party JSON
          </button>
          <input
            ref={importInputRef}
            hidden
            accept="application/json"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importPayload(file);
              }
              event.target.value = "";
            }}
          />
          {importError ? <p className="text-xs text-rose-700">{importError}</p> : null}
        </div>
      </aside>
      <div className="min-w-0 overflow-hidden">
        <PartyErrorBoundary>{children}</PartyErrorBoundary>
      </div>
    </div>
  );
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
