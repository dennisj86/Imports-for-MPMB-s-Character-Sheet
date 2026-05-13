import { Link, Navigate, useParams } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { PartyShell } from "../features/party/PartyShell";
import { useCharacterStore } from "../store/characterStore";
import { usePartyStore } from "../store/partyStore";

export function PartyPage() {
  const { partyId = "default" } = useParams<{ partyId: string }>();
  const party = usePartyStore((state) => state.party);
  const characters = useCharacterStore((state) => state.characters);
  const firstCharacterId = party?.characterIds.find((id) => characters.some((entry) => entry.id === id));

  return (
    <PartyShell partyId={partyId}>
      {firstCharacterId ? <Navigate replace to={`/party/${partyId}/characters/${firstCharacterId}`} /> : (
        <Panel title="Party Ready">
          <p className="text-sm text-slate-600">Create or import a party character to open a sheet.</p>
          <Link className="mt-3 inline-block rounded bg-slate-800 px-3 py-2 text-sm text-white" to="/">
            Local Characters
          </Link>
        </Panel>
      )}
    </PartyShell>
  );
}

