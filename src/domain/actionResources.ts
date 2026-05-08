import type { CharacterDraft } from "./character";
import type { RulesMode } from "./content";
import type { DerivedDataStatus } from "./derivedStats";

export type CharacterActionActivationType = "action" | "bonus-action" | "reaction" | "free" | "utility" | "special";
export type CharacterActionSourceType = "class" | "subclass" | "species" | "background" | "feat" | "spell" | "item" | "core";
export type CharacterResourceSourceType = "class" | "subclass" | "species" | "background" | "feat" | "spell" | "item" | "system";
export type ResourceRechargeType = "at-will" | "short-rest" | "long-rest" | "special" | "manual" | "none";

export interface ActionSourceRef {
  sourceType: CharacterActionSourceType;
  sourceId?: string;
  sourceName?: string;
}

export interface ActionPrerequisite {
  kind: "level" | "resource" | "selection" | "context";
  description: string;
  satisfied: boolean;
}

export interface RechargeRule {
  type: ResourceRechargeType;
  label: string;
  notes: string[];
}

export interface CharacterAction {
  id: string;
  name: string;
  activationType: CharacterActionActivationType;
  source: ActionSourceRef;
  sourceType: CharacterActionSourceType;
  sourceId?: string;
  levelRequirement?: number;
  description?: string;
  requiresResourceIds: string[];
  prerequisites: ActionPrerequisite[];
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface CharacterActionSet {
  actions: CharacterAction[];
  bonusActions: CharacterAction[];
  reactions: CharacterAction[];
  freeActions: CharacterAction[];
  utilityActions: CharacterAction[];
}

export interface CharacterResource {
  id: string;
  name: string;
  sourceType: CharacterResourceSourceType;
  sourceId?: string;
  sourceName?: string;
  levelRequirement?: number;
  usesMax?: number;
  usesRemaining?: number;
  recharge: RechargeRule;
  formula?: string;
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface LimitedUseFeature {
  featureId: string;
  featureName: string;
  sourceType: CharacterResourceSourceType;
  sourceId?: string;
  levelRequirement?: number;
  resourceId: string;
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface SpellcastingResourceState {
  available: boolean;
  spellcastingAbility?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  spellSaveDC?: number;
  spellAttackModifier?: number;
  slotResources: CharacterResource[];
  cantripActions: CharacterAction[];
  spellActions: CharacterAction[];
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface CharacterResourceSet {
  resources: CharacterResource[];
  limitedUseFeatures: LimitedUseFeature[];
  spellcasting: SpellcastingResourceState;
}

export interface CharacterActionResourceState {
  provider: CharacterDraft["provider"];
  rulesMode: RulesMode;
  level: number;
  actionSet: CharacterActionSet;
  resourceSet: CharacterResourceSet;
  pending: Array<{
    id: string;
    type: "action" | "resource";
    description: string;
    severity: "info" | "warning";
  }>;
  notes: string[];
  dataStatus: DerivedDataStatus;
}
