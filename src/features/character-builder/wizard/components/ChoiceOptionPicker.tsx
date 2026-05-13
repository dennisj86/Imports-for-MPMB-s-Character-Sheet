import { useMemo, useState } from "react";
import { inputClassName } from "../../../../components/ui/FormField";
import type { RuleChoiceOption } from "../../../../domain/rules";
import { RuleDetailDrawer, type RuleDetailModel } from "../../../character/components/sheet/RuleDetailDrawer";

interface ChoiceOptionPickerProps {
  choiceId: string;
  choiceLabel: string;
  options: RuleChoiceOption[];
  selectedOptionIds: string[];
  requiredCount: number;
  maxCount: number;
  onChange: (nextOptionIds: string[]) => void;
  buildDetail: (option: RuleChoiceOption) => RuleDetailModel | undefined;
  optionSummary?: (option: RuleChoiceOption) => string | undefined;
  searchPlaceholder?: string;
}

function optionSearchBlob(option: RuleChoiceOption, summary: string | undefined): string {
  const metadata = Object.values(option.metadata ?? {}).map((entry) => String(entry));
  const diagnostics = option.diagnostics ?? [];
  return `${option.label} ${option.tags?.join(" ") ?? ""} ${metadata.join(" ")} ${diagnostics.join(" ")} ${summary ?? ""}`.toLowerCase();
}

export function ChoiceOptionPicker({
  choiceId,
  choiceLabel,
  options,
  selectedOptionIds,
  requiredCount,
  maxCount,
  onChange,
  buildDetail,
  optionSummary,
  searchPlaceholder = "Search options",
}: ChoiceOptionPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [previewOptionId, setPreviewOptionId] = useState<string | undefined>();
  const [detailsOpenByOptionId, setDetailsOpenByOptionId] = useState<Record<string, boolean>>({});
  const isSingleChoice = maxCount <= 1;
  const selectedSet = useMemo(() => new Set(selectedOptionIds), [selectedOptionIds]);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleOptions = useMemo(
    () =>
      normalizedQuery.length === 0
        ? options
        : options.filter((option) => optionSearchBlob(option, optionSummary?.(option)).includes(normalizedQuery)),
    [normalizedQuery, optionSummary, options],
  );
  const previewOption = useMemo(() => {
    const byPreviewId = previewOptionId ? options.find((option) => option.id === previewOptionId) : undefined;
    if (byPreviewId) {
      return byPreviewId;
    }
    const firstSelected = selectedOptionIds[0];
    if (firstSelected) {
      return options.find((option) => option.id === firstSelected);
    }
    return visibleOptions[0];
  }, [options, previewOptionId, selectedOptionIds, visibleOptions]);

  const previewDetail = previewOption ? buildDetail(previewOption) : undefined;

  return (
    <div className="space-y-2">
      {(options.length > 20 || !isSingleChoice) ? (
        <input
          aria-label={`Search options for ${choiceLabel}`}
          className={inputClassName()}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={searchPlaceholder}
          type="search"
          value={searchQuery}
        />
      ) : null}
      {previewDetail ? (
        <RuleDetailDrawer
          detail={previewDetail}
          heading="Choice Preview"
          id={`choice-preview-${choiceId}`}
        />
      ) : null}
      <p className="text-xs text-slate-600">
        {selectedOptionIds.length}/{requiredCount} selected
        {!isSingleChoice ? ` · max ${maxCount}` : ""}
      </p>
      <div className="max-h-80 space-y-1 overflow-auto rounded border border-slate-200 p-1">
        {visibleOptions.length === 0 ? (
          <p className="p-2 text-xs text-slate-500">No options match this search.</p>
        ) : (
          visibleOptions.map((option) => {
            const selected = selectedSet.has(option.id);
            const blockedByMax = !selected && !isSingleChoice && selectedOptionIds.length >= maxCount;
            const summary = optionSummary?.(option);
            const detailOpen = detailsOpenByOptionId[option.id] ?? false;
            const detailModel = buildDetail(option);
            return (
              <div key={option.id} className="rounded border border-slate-200 px-2 py-1 text-xs">
                <div
                  className="flex items-start gap-2"
                  onMouseEnter={() => setPreviewOptionId(option.id)}
                >
                  {isSingleChoice ? (
                    <button
                      aria-label={`Select ${option.label}`}
                      className={`sheet-focus-ring flex-1 rounded px-2 py-1 text-left ${
                        selected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                      }`}
                      onClick={() => onChange(selected ? [] : [option.id])}
                      onFocus={() => setPreviewOptionId(option.id)}
                      type="button"
                    >
                      <span className="font-medium">{option.label}</span>
                      {summary ? <span className={`mt-0.5 block ${selected ? "text-slate-100" : "text-slate-600"}`}>{summary}</span> : null}
                    </button>
                  ) : (
                    <label className={`flex flex-1 items-start gap-2 rounded px-2 py-1 ${blockedByMax ? "opacity-60" : ""}`}>
                      <input
                        checked={selected}
                        className="mt-0.5"
                        disabled={blockedByMax}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...selectedOptionIds, option.id]
                            : selectedOptionIds.filter((entry) => entry !== option.id);
                          onChange(next);
                        }}
                        onFocus={() => setPreviewOptionId(option.id)}
                        type="checkbox"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-slate-900">{option.label}</span>
                        {summary ? <span className="mt-0.5 block text-slate-600">{summary}</span> : null}
                      </span>
                    </label>
                  )}
                  <button
                    aria-controls={`choice-detail-${choiceId}-${option.id}`}
                    aria-expanded={detailOpen}
                    className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                    disabled={!detailModel}
                    onClick={() =>
                      setDetailsOpenByOptionId((current) => ({
                        ...current,
                        [option.id]: !(current[option.id] ?? false),
                      }))
                    }
                    onFocus={() => setPreviewOptionId(option.id)}
                    type="button"
                  >
                    Details
                  </button>
                </div>
                {detailOpen && detailModel ? (
                  <RuleDetailDrawer
                    className="mt-2"
                    detail={detailModel}
                    heading="Option Details"
                    id={`choice-detail-${choiceId}-${option.id}`}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-slate-500">Hover, focus, or tap an option to update preview.</p>
    </div>
  );
}
