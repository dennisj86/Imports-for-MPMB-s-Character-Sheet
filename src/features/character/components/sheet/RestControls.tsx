interface RestControlsProps {
  onShortRest: () => void;
  onLongRest: () => void;
  notes: string[];
}

export function RestControls({ onShortRest, onLongRest, notes }: RestControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={onShortRest} type="button">
          Apply Short Rest
        </button>
        <button className="rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={onLongRest} type="button">
          Apply Long Rest
        </button>
      </div>
      {notes.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
