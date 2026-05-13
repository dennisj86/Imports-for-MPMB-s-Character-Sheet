import { useState } from "react";
import type { ConcentrationState } from "../../../../domain/playState";
import { inputClassName } from "../../../../components/ui/FormField";
import { EmptyState, InfoPopover, StatusBadge } from "./SheetDesignSystem";
import { ruleInfo } from "./rulesInfo";

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
        <div className="sheet-card border-indigo-300 bg-indigo-50 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-indigo-900">{concentration.name}</p>
              <InfoPopover title="Concentration" description={ruleInfo("concentration")} />
            </div>
            <div className="flex items-center gap-1">
              <StatusBadge label="concentrating" status="complete" />
              <InfoPopover title="Concentrating" description={ruleInfo("concentration-duration")} />
            </div>
          </div>
          <p className="text-xs text-indigo-800">Started: {new Date(concentration.startedAt).toLocaleTimeString()}</p>
          {concentration.notes ? <p className="text-xs text-indigo-800">{concentration.notes}</p> : null}
          <button
            aria-label={`End concentration on ${concentration.name}`}
            className="sheet-focus-ring mt-2 rounded bg-indigo-700 px-3 py-1.5 text-xs text-white"
            onClick={() => onEnd("manual")}
            type="button"
          >
            End Concentration
          </button>
        </div>
      ) : (
        <EmptyState title="Concentration" description="No active concentration." />
      )}

      <div className="flex gap-2">
        <input
          aria-label="Manual concentration name"
          className={inputClassName()}
          onChange={(event) => setManualName(event.target.value)}
          placeholder="Start concentration manually"
          value={manualName}
        />
        <button
          aria-label="Start manual concentration"
          className="sheet-focus-ring rounded bg-slate-700 px-3 py-2 text-sm text-white"
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
