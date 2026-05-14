import { useParams } from "react-router-dom";
import { PartySessionDashboard } from "../features/party/PartySessionDashboard";
import { PartyShell } from "../features/party/PartyShell";

export function PartyPage() {
  const { partyId = "default" } = useParams<{ partyId: string }>();

  return (
    <PartyShell partyId={partyId}>
      <PartySessionDashboard partyId={partyId} />
    </PartyShell>
  );
}
