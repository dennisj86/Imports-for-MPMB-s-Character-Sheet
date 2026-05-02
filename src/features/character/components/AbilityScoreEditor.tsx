import { abilityModifier } from "../../../domain/derived";
import type { AbilityScores } from "../../../domain/character";
import { FormField, inputClassName } from "../../../components/ui/FormField";

type AbilityScoreEditorProps = {
  value: AbilityScores;
  onChange: (next: AbilityScores) => void;
};

const labels: Array<keyof AbilityScores> = ["str", "dex", "con", "int", "wis", "cha"];

export function AbilityScoreEditor({ value, onChange }: AbilityScoreEditorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {labels.map((key) => (
        <FormField key={key} label={key.toUpperCase()} hint={`Modifier ${formatModifier(abilityModifier(value[key]))}`}>
          <input
            className={inputClassName()}
            min={1}
            max={30}
            type="number"
            value={value[key]}
            onChange={(event) => {
              const nextValue = clampNumber(Number(event.target.value));
              onChange({
                ...value,
                [key]: nextValue,
              });
            }}
          />
        </FormField>
      ))}
    </div>
  );
}

function clampNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 10;
  }
  return Math.min(30, Math.max(1, Math.round(value)));
}

function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
