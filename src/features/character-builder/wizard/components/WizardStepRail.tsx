import type { WizardStepState } from "../../../../domain/builderWizard";

type WizardStepRailProps = {
  steps: WizardStepState[];
  onSelectStep: (stepId: WizardStepState["id"]) => void;
};

function stepClassName(step: WizardStepState): string {
  if (step.status === "current") {
    return "border-slate-900 bg-slate-900 text-white";
  }
  if (step.status === "blocked") {
    return "border-red-400 bg-red-50 text-red-700";
  }
  if (step.status === "pending") {
    return "border-amber-400 bg-amber-50 text-amber-700";
  }
  return "border-emerald-500 bg-emerald-50 text-emerald-700";
}

function badge(step: WizardStepState): string {
  if (step.status === "current") {
    return "Current";
  }
  if (step.status === "blocked") {
    return "Blocked";
  }
  if (step.status === "pending") {
    return "Pending";
  }
  return "Done";
}

export function WizardStepRail({ steps, onSelectStep }: WizardStepRailProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Creation Steps</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => (
          <button
            key={step.id}
            className={`rounded border px-3 py-2 text-left text-sm ${stepClassName(step)}`}
            onClick={() => onSelectStep(step.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {step.order}. {step.title}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide">{badge(step)}</span>
            </div>
            {step.validation.errors.length > 0 ? (
              <p className="mt-1 text-xs">{step.validation.errors[0]}</p>
            ) : null}
            {step.validation.errors.length === 0 && step.validation.warnings.length > 0 ? (
              <p className="mt-1 text-xs">{step.validation.warnings[0]}</p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

