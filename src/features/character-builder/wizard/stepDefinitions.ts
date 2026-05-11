import type { WizardStepId, WizardStepValidation } from "../../../domain/builderWizard";

export interface WizardDefinitionContext {
  validations: Partial<Record<WizardStepId, WizardStepValidation>>;
  hasFeatChoices: boolean;
  hasSpellChoices: boolean;
}

export interface WizardSubstepDefinition {
  id: string;
  title: string;
}

export interface WizardStepDefinition {
  id: WizardStepId;
  title: string;
  order: number;
  imageRefs: string[];
  substeps: WizardSubstepDefinition[];
  requiredChoices: Array<"class" | "subclass" | "species" | "background" | "abilities" | "feat" | "skill" | "spell" | "review">;
  reviewRelevance: "high" | "medium";
  validationHook: WizardStepId;
  isVisible: (context: WizardDefinitionContext) => boolean;
  isCompleted: (context: WizardDefinitionContext) => boolean;
}

function fromValidation(context: WizardDefinitionContext, stepId: WizardStepId): WizardStepValidation | undefined {
  return context.validations[stepId];
}

export const BUILDER_WIZARD_STEPS: WizardStepDefinition[] = [
  {
    id: "class",
    title: "Class",
    order: 1,
    imageRefs: ["creation1.png", "creation2.png", "creation2b.png", "creation2c.png"],
    substeps: [
      { id: "class-catalog", title: "Class Catalog" },
      { id: "class-pending-choices", title: "Class Pending Choices" },
    ],
    requiredChoices: ["class", "subclass"],
    reviewRelevance: "high",
    validationHook: "class",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "class")?.completed),
  },
  {
    id: "species",
    title: "Species",
    order: 2,
    imageRefs: ["creation3.png", "creation4.png"],
    substeps: [
      { id: "species-catalog", title: "Species Catalog" },
      { id: "species-traits", title: "Species Traits" },
    ],
    requiredChoices: ["species"],
    reviewRelevance: "high",
    validationHook: "species",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "species")?.completed),
  },
  {
    id: "background",
    title: "Background",
    order: 3,
    imageRefs: ["creation5.png", "creation6.png"],
    substeps: [
      { id: "background-catalog", title: "Background Catalog" },
      { id: "background-features", title: "Background Features" },
    ],
    requiredChoices: ["background"],
    reviewRelevance: "high",
    validationHook: "background",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "background")?.completed),
  },
  {
    id: "abilities",
    title: "Ability Scores",
    order: 4,
    imageRefs: ["creation7.png", "creation7_alternative.png", "creation7_manual.png", "creation7_pointbuy.png", "creation7_roll.png"],
    substeps: [
      { id: "ability-method", title: "Generation Method" },
      { id: "ability-origin-override", title: "Origin Override" },
    ],
    requiredChoices: ["abilities"],
    reviewRelevance: "high",
    validationHook: "abilities",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "abilities")?.completed),
  },
  {
    id: "feats",
    title: "Feats",
    order: 5,
    imageRefs: ["creation8.png", "creation9_featselect.png", "creation9_afterselect.png"],
    substeps: [
      { id: "feat-choice-cards", title: "Feat Choice Cards" },
      { id: "feat-selection-list", title: "Feat Selection" },
    ],
    requiredChoices: ["feat"],
    reviewRelevance: "high",
    validationHook: "feats",
    isVisible: (context) => context.hasFeatChoices,
    isCompleted: (context) => Boolean(fromValidation(context, "feats")?.completed),
  },
  {
    id: "skills",
    title: "Skills",
    order: 6,
    imageRefs: ["creation10.png"],
    substeps: [
      { id: "skill-choice-panels", title: "Skill Choices" },
      { id: "skill-summary", title: "Skill Summary" },
    ],
    requiredChoices: ["skill"],
    reviewRelevance: "high",
    validationHook: "skills",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "skills")?.completed),
  },
  {
    id: "spells",
    title: "Spells",
    order: 7,
    imageRefs: ["creation11.png", "creation11_selection.png", "creation11_selectionb.png", "creation11_afterselect.png"],
    substeps: [
      { id: "spell-choice-cards", title: "Spell Choice Cards" },
      { id: "spell-selection-list", title: "Spell Selection" },
    ],
    requiredChoices: ["spell"],
    reviewRelevance: "high",
    validationHook: "spells",
    isVisible: (context) => context.hasSpellChoices,
    isCompleted: (context) => Boolean(fromValidation(context, "spells")?.completed),
  },
  {
    id: "equipment",
    title: "Equipment",
    order: 8,
    imageRefs: ["creation12.png"],
    substeps: [
      { id: "equipment-choice", title: "Equipment Choice" },
      { id: "equipment-inventory", title: "Starting Inventory" },
    ],
    requiredChoices: ["review"],
    reviewRelevance: "medium",
    validationHook: "equipment",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "equipment")?.completed),
  },
  {
    id: "review",
    title: "About & Review",
    order: 9,
    imageRefs: ["creation13a.png", "creation13b.png"],
    substeps: [
      { id: "about-profile", title: "About" },
      { id: "review-summary", title: "Review" },
    ],
    requiredChoices: ["review"],
    reviewRelevance: "high",
    validationHook: "review",
    isVisible: () => true,
    isCompleted: (context) => Boolean(fromValidation(context, "review")?.completed),
  },
];

export function getVisibleWizardSteps(context: WizardDefinitionContext): WizardStepDefinition[] {
  return BUILDER_WIZARD_STEPS.filter((step) => step.isVisible(context)).sort((left, right) => left.order - right.order);
}
