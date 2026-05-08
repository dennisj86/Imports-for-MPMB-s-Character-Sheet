import type { CharacterPlayEvent } from "../../../../domain/playState";

interface PlayLogPanelProps {
  events: CharacterPlayEvent[];
}

export function PlayLogPanel({ events }: PlayLogPanelProps) {
  const rows = events.slice(-25).reverse();
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No local play actions yet.</p>;
  }
  return (
    <ul className="max-h-80 space-y-1 overflow-auto text-sm">
      {rows.map((event) => (
        <li key={event.id} className="rounded border border-slate-200 p-2">
          <p className="font-medium">{event.shortLabel}</p>
          <p className="text-xs text-slate-600">{new Date(event.timestamp).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}
