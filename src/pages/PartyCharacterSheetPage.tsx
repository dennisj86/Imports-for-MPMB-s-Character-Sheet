import { useParams } from "react-router-dom";
import { PartyShell } from "../features/party/PartyShell";
import { CharacterSheetPage } from "./CharacterSheetPage";

export function PartyCharacterSheetPage() {
  const { partyId = "default", characterId } = useParams<{ partyId: string; characterId: string }>();
  return (
    <PartyShell partyId={partyId} selectedCharacterId={characterId}>
      <CharacterSheetPage />
    </PartyShell>
  );
}

