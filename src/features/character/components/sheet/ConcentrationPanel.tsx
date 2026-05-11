import { useState } from "react";
import type { ConcentrationState } from "../../../../domain/playState";
import { inputClassName } from "../../../../components/ui/FormField";

interface ConcentrationPanelProps {
  concentration: ConcentrationState | null;
  onStart: (name: string, sourceId?: string, notes?: string) => void;
  onEnd: (reason?: string) => void;
}

export function ConcentrationPanel({ concentration, onStart, onEnd }: ConcentrationPanelProps) {
  const [manualName, setManualName] = useState("");

  return (
    <div className="space-y-3">
      {concentration ? (
        <div className="rounded border border-indigo-300 bg-indigo-50 p-3">
          <p className="text-sm font-medium text-indigo-900">{concentration.name}</p>
          <p className="text-xs text-indigo-800">Started: {new Date(concentration.startedAt).toLocaleTimeString()}</p>
          {concentration.notes ? <p className="text-xs text-indigo-800">{concentration.notes}</p> : null}
          <button className="mt-2 rounded bg-indigo-700 px-3 py-1.5 text-xs text-white" onClick={() => onEnd("manual")} type="button">
            End Concentration
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No active concentration.</p>
      )}

      <div className="flex gap-2">
        <input
          className={inputClassName()}
          onChange={(event) => setManualName(event.target.value)}
          placeholder="Start concentration manually"
          value={manualName}
        />
        <button
          className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
          onClick={() => {
            const trimmed = manualName.trim();
            if (!trimmed) {
              return;
            }
            onStart(trimmed, undefined, "manual");
            setManualName("");
          }}
          type="button"
        >
          Start
        </button>
      </div>
    </div>
  );
}
