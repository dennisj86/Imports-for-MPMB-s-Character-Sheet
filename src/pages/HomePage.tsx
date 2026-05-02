import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { inputClassName } from "../components/ui/FormField";
import { useCharacterStore } from "../store/characterStore";

export function HomePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const characters = useCharacterStore((state) => state.characters);
  const createCharacter = useCharacterStore((state) => state.createCharacter);
  const deleteCharacter = useCharacterStore((state) => state.deleteCharacter);
  const importCharacters = useCharacterStore((state) => state.importCharacters);
  const exportCharacters = useCharacterStore((state) => state.exportCharacters);

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [characters],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="Create Character">
        <div className="space-y-2">
          <input className={inputClassName()} placeholder="Character name" value={newName} onChange={(event) => setNewName(event.target.value)} />
          <button
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              const id = createCharacter(newName);
              setNewName("");
              navigate(`/builder/${id}`);
            }}
            type="button"
          >
            New Character
          </button>
        </div>
      </Panel>

      <Panel
        title="Character List"
        rightSlot={
          <div className="flex gap-2">
            <button
              className="rounded bg-slate-200 px-2 py-1 text-xs"
              onClick={() => downloadJson("characters-export.json", exportCharacters())}
              type="button"
            >
              Export JSON
            </button>
            <button className="rounded bg-slate-200 px-2 py-1 text-xs" onClick={() => fileInputRef.current?.click()} type="button">
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              hidden
              accept="application/json"
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                try {
                  const text = await file.text();
                  importCharacters(text);
                  setImportError(null);
                } catch {
                  setImportError("Import failed: invalid or incompatible JSON payload.");
                } finally {
                  event.target.value = "";
                }
              }}
            />
          </div>
        }
      >
        {importError ? <p className="mb-2 text-sm text-red-700">{importError}</p> : null}
        {sortedCharacters.length === 0 ? (
          <p className="text-sm text-slate-500">No characters yet.</p>
        ) : (
          <ul className="space-y-2">
            {sortedCharacters.map((character) => (
              <li key={character.id} className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium">{character.name}</p>
                  <p className="text-xs text-slate-500">Updated: {new Date(character.updatedAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="rounded bg-slate-800 px-2 py-1 text-xs text-white" to={`/builder/${character.id}`}>
                    Builder
                  </Link>
                  <Link className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" to={`/sheet/${character.id}`}>
                    Sheet
                  </Link>
                  <button className="rounded bg-red-100 px-2 py-1 text-xs text-red-700" onClick={() => deleteCharacter(character.id)} type="button">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
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
