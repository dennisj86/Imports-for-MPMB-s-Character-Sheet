import type { CharacterDraft } from "./character";
import type { ClassDefinition, FeatDefinition, SpellDefinition } from "./content";
import type { DerivedDataStatus } from "./derivedStats";

export type WizardStepId =
  | "class"
  | "species"
  | "background"
  | "abilities"
  | "feats"
  | "skills"
  | "spells"
  | "equipment"
  | "review";

export type WizardStepStatus = "current" | "completed" | "blocked" | "pending";

export interface WizardStepValidation {
  stepId: WizardStepId;
  completed: boolean;
  blocked: boolean;
  pending: boolean;
  errors: string[];
  warnings: string[];
}

export interface ClassSkillChoiceState {
  id: string;
  source: "class" | "species" | "background";
  title: string;
  requiredCount: number;
  missingCount: number;
  options: string[];
  selectedOptions: string[];
  choiceKeyPrefix: string;
  reason?: string;
  dataStatus: DerivedDataStatus;
}

export type SkillChoiceState = ClassSkillChoiceState;

export type FeatChoiceContextKind = "origin-feat" | "asi-feat";

export interface FeatSubchoiceOption {
  id: string;
  label: string;
}

export interface FeatSubchoice {
  id: string;
  title: string;
  description: string;
  required: boolean;
  selectedOptionId?: string;
  options: FeatSubchoiceOption[];
  satisfied: boolean;
  notes: string[];
}

export interface FeatChoiceContext {
  id: string;
  kind: FeatChoiceContextKind;
  title: string;
  description: string;
  requiredCount: number;
  selectedFeatId?: string;
  selectedFeatName?: string;
  eligibleFeats: FeatDefinition[];
  subchoices: FeatSubchoice[];
  notes: string[];
  satisfied: boolean;
  dataStatus: DerivedDataStatus;
}

export type SpellChoiceContextKind =
  | "class-cantrip"
  | "class-leveled"
  | "class-prepared-pool"
  | "feat-cantrip"
  | "feat-leveled";

export interface SpellChoiceContext {
  id: string;
  kind: SpellChoiceContextKind;
  title: string;
  description: string;
  source: "class" | "feat";
  sourceId?: string;
  classKeys: string[];
  requiredCount: number;
  maxSelections?: number;
  minSpellLevel: number;
  maxSpellLevel: number;
  eligibleSpells: SpellDefinition[];
  selectedSpellIds: string[];
  selectedSpellNames: string[];
  satisfied: boolean;
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface StartingEquipmentChoiceOption {
  id: string;
  label: string;
  itemNames: string[];
  itemEntries?: Array<{
    name: string;
    quantity: number;
  }>;
  gpAmount?: number;
  notes: string[];
}

export interface StartingEquipmentChoiceContext {
  id: string;
  title: string;
  description: string;
  source: "class" | "background";
  options: StartingEquipmentChoiceOption[];
  selectedOptionId?: string;
  satisfied: boolean;
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface WizardCompletionState {
  complete: boolean;
  blockingSteps: WizardStepId[];
  pendingSteps: WizardStepId[];
  notes: string[];
}

export interface WizardStepState {
  id: WizardStepId;
  title: string;
  order: number;
  visible: boolean;
  status: WizardStepStatus;
  substeps: Array<{
    id: string;
    title: string;
  }>;
  imageRefs: string[];
  validation: WizardStepValidation;
}

export interface EligibleFeatSelection {
  contextId: string;
  featId: string;
}

export interface WizardEligibilitySnapshot {
  draftRef: Pick<CharacterDraft, "id" | "provider" | "rulesMode">;
  classDef?: Pick<ClassDefinition, "id" | "key" | "name">;
  skillChoices: SkillChoiceState[];
  featChoices: FeatChoiceContext[];
  spellChoices: SpellChoiceContext[];
  equipmentChoices: StartingEquipmentChoiceContext[];
}
