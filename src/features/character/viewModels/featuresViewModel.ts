import type { CharacterEngineState } from "../../../services/characterEngine";

export type FeatureGroupId = "class" | "subclass" | "species" | "background" | "feats" | "items";
export type FeatureAutomationStatus = "automated" | "partial" | "manual" | "unsupported" | "unknown";

export interface FeatureCardViewModel {
  id: string;
  name: string;
  sourceGroup: FeatureGroupId;
  sourceLabel: string;
  level?: number;
  actionType?: string;
  timing?: string;
  usesLabel?: string;
  recoveryLabel?: string;
  resourceCostLabel?: string;
  automationStatus?: FeatureAutomationStatus;
  manualInstructions?: string;
  knownLimitations?: string;
  ruleChoiceLabels: string[];
  appliedSummaryLabels: string[];
  summary: string;
  details?: string;
}

export interface FeatureGroupViewModel {
  id: FeatureGroupId;
  label: string;
  features: FeatureCardViewModel[];
}

const GROUP_LABELS: Record<FeatureGroupId, string> = {
  class: "Class Features",
  subclass: "Subclass Features",
  species: "Species Traits",
  background: "Background",
  feats: "Feats",
  items: "Items",
};

function normalizeText(value: string | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function summarize(value: string | undefined): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "No detail text available.";
  }
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.length > 180 ? `${first.slice(0, 177).trim()}...` : first;
}

function actionTypeFromText(text: string | undefined): string | undefined {
  const lower = normalizeText(text);
  if (/\bbonus action\b/.test(lower)) return "Bonus Action";
  if (/\breaction\b/.test(lower)) return "Reaction";
  if (/\bas an action\b|\byou can use your action\b|\baction\b/.test(lower)) return "Action";
  if (/\bpassive\b|\balways\b/.test(lower)) return "Passive";
  return undefined;
}

function actionTypeFromStructuredData(structuredData: unknown): string | undefined {
  if (!structuredData || typeof structuredData !== "object") {
    return undefined;
  }
  const action = (structuredData as { action?: unknown }).action;
  if (!Array.isArray(action) || action.length === 0) {
    return undefined;
  }
  const first = action[0];
  const firstText = Array.isArray(first) ? String(first[0] ?? "") : String(first ?? "");
  return actionTypeFromText(firstText);
}

function normalizeActionType(
  textDescription: string | undefined,
  structuredData: unknown,
): string | undefined {
  return actionTypeFromStructuredData(structuredData) ?? actionTypeFromText(textDescription);
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value) && value.length > 0) {
    const compact = value
      .map((entry) => (typeof entry === "string" || typeof entry === "number") ? String(entry) : undefined)
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => entry.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (compact.length === 0) {
      return undefined;
    }
    return compact.join(", ");
  }
  return undefined;
}

function valueAtLevel(value: unknown, level: number): unknown {
  if (!Array.isArray(value) || value.length === 0) {
    return value;
  }
  const index = Math.max(0, Math.min(level - 1, value.length - 1));
  return value[index];
}

function usageLabel(
  level: number,
  usages: unknown,
  recovery: unknown,
  structuredData: unknown,
): { usesLabel?: string; recoveryLabel?: string; resourceCostLabel?: string } {
  const structured = structuredData && typeof structuredData === "object" ? structuredData as { additional?: unknown; usages?: unknown; recovery?: unknown } : undefined;
  const usageValue = toText(valueAtLevel(usages ?? structured?.usages ?? structured?.additional, level));
  const recoveryValue = toText(recovery ?? structured?.recovery);
  const usesLabel = usageValue && recoveryValue ? `${usageValue} · ${recoveryValue}` : usageValue ?? recoveryValue;
  return {
    usesLabel,
    recoveryLabel: recoveryValue,
    resourceCostLabel: usageValue,
  };
}

function automationStatusForFeature(input: {
  actionType?: string;
  details?: string;
  ruleChoiceLabels: string[];
  appliedSummaryLabels: string[];
  sourceGroup: FeatureGroupId;
}): FeatureAutomationStatus {
  if (input.sourceGroup === "items") {
    return "partial";
  }
  if (input.ruleChoiceLabels.length > 0 || input.appliedSummaryLabels.length > 0) {
    return "partial";
  }
  if (input.actionType && input.actionType !== "Passive") {
    return "manual";
  }
  if (!input.details) {
    return "unknown";
  }
  return "manual";
}

function manualInstructionsForFeature(status: FeatureAutomationStatus): string {
  if (status === "automated") return "No manual step required.";
  if (status === "partial") return "Sheet handles part of this feature. Apply unresolved effects manually.";
  if (status === "manual") return "Apply this feature manually during play.";
  if (status === "unsupported") return "Known feature, but unsupported by automation.";
  return "No structured automation metadata found. Resolve manually.";
}

function knownLimitationsForFeature(status: FeatureAutomationStatus, details: string | undefined): string | undefined {
  if (!details && status !== "automated") {
    return "No local description found for this feature.";
  }
  if (status === "partial") {
    return "Resource usage, targeting, and conditional riders may require manual handling.";
  }
  if (status === "unsupported") {
    return "Feature is recognized, but no automation path is implemented.";
  }
  return undefined;
}

function pushUnique(target: FeatureCardViewModel[], seen: Set<string>, feature: FeatureCardViewModel) {
  const key = `${feature.id}:${normalizeText(feature.details)}`;
  const textKey = `${feature.sourceGroup}:${normalizeText(feature.name)}:${normalizeText(feature.details)}`;
  if (seen.has(key) || seen.has(textKey)) {
    return;
  }
  seen.add(key);
  seen.add(textKey);
  target.push(feature);
}

function ruleChoiceLabelsForSource(engine: CharacterEngineState, sourceId: string | undefined): string[] {
  if (!sourceId) {
    return [];
  }
  return (engine.ruleEngine?.choices ?? [])
    .filter((choice) => {
      const source = engine.ruleEngine?.sources.find((entry) => entry.id === choice.sourceDescriptorId);
      return source?.sourceId === sourceId;
    })
    .map((choice) => {
      const selectedLabels = choice.options
        .filter((option) => choice.selectedOptionIds.includes(option.id))
        .map((option) => option.label);
      if (selectedLabels.length) {
        return `${choice.choiceType}: ${selectedLabels.join(", ")}`;
      }
      return `${choice.choiceType}: ${choice.status}`;
    });
}

function appliedSummariesForSource(engine: CharacterEngineState, sourceId: string | undefined): string[] {
  if (!sourceId) {
    return [];
  }
  const sourceDescriptorIds = new Set(
    (engine.ruleEngine?.sources ?? [])
      .filter((entry) => entry.sourceId === sourceId)
      .map((entry) => entry.id),
  );
  if (sourceDescriptorIds.size === 0) {
    return [];
  }
  return Array.from(
    new Set(
      (engine.ruleEngine?.optionScoped.appliedEntries ?? [])
        .filter((entry) => sourceDescriptorIds.has(entry.sourceDescriptorId))
        .flatMap((entry) => entry.summaries),
    ),
  );
}

export function buildFeatureGroupsViewModel(engine: CharacterEngineState): FeatureGroupViewModel[] {
  const cards: FeatureCardViewModel[] = [];
  const seen = new Set<string>();
  const level = Math.max(1, engine.draft?.classSelection?.level ?? 1);
  const classFeatureById = new Map((engine.classDef?.features ?? []).map((feature) => [feature.id, feature]));
  const subclassFeatureById = new Map((engine.subclassDef?.features ?? []).map((feature) => [feature.id, feature]));

  for (const feature of engine.progression.unlockedClassFeatures) {
    const fullFeature = classFeatureById.get(feature.id);
    const featureExtras = feature as unknown as { usages?: unknown; recovery?: unknown; structuredData?: unknown };
    const details = feature.description ?? fullFeature?.description;
    const structuredData = fullFeature?.structuredData ?? featureExtras.structuredData;
    const actionType = normalizeActionType(details, structuredData);
    const usage = usageLabel(level, fullFeature?.usages ?? featureExtras.usages, fullFeature?.recovery ?? featureExtras.recovery, structuredData);
    const ruleChoiceLabels = ruleChoiceLabelsForSource(engine, feature.id);
    const appliedSummaryLabels = appliedSummariesForSource(engine, feature.id);
    const automationStatus = automationStatusForFeature({
      actionType,
      details,
      ruleChoiceLabels,
      appliedSummaryLabels,
      sourceGroup: "class",
    });
    pushUnique(cards, seen, {
      id: feature.id,
      name: feature.name,
      sourceGroup: "class",
      sourceLabel: engine.classDef?.name ?? "Class",
      level: feature.minLevel,
      actionType,
      timing: actionType ? actionType.toLowerCase() : "passive",
      usesLabel: usage.usesLabel,
      recoveryLabel: usage.recoveryLabel,
      resourceCostLabel: usage.resourceCostLabel,
      automationStatus,
      manualInstructions: manualInstructionsForFeature(automationStatus),
      knownLimitations: knownLimitationsForFeature(automationStatus, details),
      ruleChoiceLabels,
      appliedSummaryLabels,
      summary: summarize(details),
      details,
    });
  }

  for (const feature of engine.progression.unlockedSubclassFeatures) {
    const fullFeature = subclassFeatureById.get(feature.id);
    const featureExtras = feature as unknown as { usages?: unknown; recovery?: unknown; structuredData?: unknown };
    const details = feature.description ?? fullFeature?.description;
    const structuredData = fullFeature?.structuredData ?? featureExtras.structuredData;
    const actionType = normalizeActionType(details, structuredData);
    const usage = usageLabel(level, fullFeature?.usages ?? featureExtras.usages, fullFeature?.recovery ?? featureExtras.recovery, structuredData);
    const ruleChoiceLabels = ruleChoiceLabelsForSource(engine, feature.id);
    const appliedSummaryLabels = appliedSummariesForSource(engine, feature.id);
    const automationStatus = automationStatusForFeature({
      actionType,
      details,
      ruleChoiceLabels,
      appliedSummaryLabels,
      sourceGroup: "subclass",
    });
    pushUnique(cards, seen, {
      id: feature.id,
      name: feature.name,
      sourceGroup: "subclass",
      sourceLabel: engine.subclassDef?.name ?? "Subclass",
      level: feature.minLevel,
      actionType,
      timing: actionType ? actionType.toLowerCase() : "passive",
      usesLabel: usage.usesLabel,
      recoveryLabel: usage.recoveryLabel,
      resourceCostLabel: usage.resourceCostLabel,
      automationStatus,
      manualInstructions: manualInstructionsForFeature(automationStatus),
      knownLimitations: knownLimitationsForFeature(automationStatus, details),
      ruleChoiceLabels,
      appliedSummaryLabels,
      summary: summarize(details),
      details,
    });
  }

  engine.appliedRules.speciesResult.traits.forEach((trait, index) => {
    const actionType = actionTypeFromText(trait);
    const automationStatus = automationStatusForFeature({
      actionType,
      details: trait,
      ruleChoiceLabels: [],
      appliedSummaryLabels: [],
      sourceGroup: "species",
    });
    pushUnique(cards, seen, {
      id: `species-trait:${engine.speciesDef?.id ?? "species"}:${index}`,
      name: `${engine.speciesDef?.name ?? "Species"} Trait`,
      sourceGroup: "species",
      sourceLabel: engine.speciesDef?.name ?? "Species",
      actionType,
      timing: actionType ? actionType.toLowerCase() : "passive",
      automationStatus,
      manualInstructions: manualInstructionsForFeature(automationStatus),
      knownLimitations: knownLimitationsForFeature(automationStatus, trait),
      ruleChoiceLabels: [],
      appliedSummaryLabels: [],
      summary: summarize(trait),
      details: trait,
    });
  });

  if (engine.backgroundDef) {
    const backgroundDetails = [
      engine.backgroundDef.traitText,
      engine.backgroundDef.skillText ? `Skills: ${engine.backgroundDef.skillText}` : undefined,
      engine.backgroundDef.toolText ? `Tools: ${engine.backgroundDef.toolText}` : undefined,
      engine.backgroundDef.equipmentText ? `Equipment: ${engine.backgroundDef.equipmentText}` : undefined,
    ].filter((entry): entry is string => Boolean(entry));
    backgroundDetails.forEach((detail, index) => {
      const actionType = actionTypeFromText(detail);
      const ruleChoiceLabels = ruleChoiceLabelsForSource(engine, engine.backgroundDef?.id);
      const appliedSummaryLabels = appliedSummariesForSource(engine, engine.backgroundDef?.id);
      const automationStatus = automationStatusForFeature({
        actionType,
        details: detail,
        ruleChoiceLabels,
        appliedSummaryLabels,
        sourceGroup: "background",
      });
      pushUnique(cards, seen, {
        id: `background:${engine.backgroundDef?.id}:${index}`,
        name: engine.backgroundDef?.name ?? "Background",
        sourceGroup: "background",
        sourceLabel: "Background",
        actionType,
        timing: actionType ? actionType.toLowerCase() : "passive",
        automationStatus,
        manualInstructions: manualInstructionsForFeature(automationStatus),
        knownLimitations: knownLimitationsForFeature(automationStatus, detail),
        summary: summarize(detail),
        ruleChoiceLabels,
        appliedSummaryLabels,
        details: detail,
      });
    });
  }

  for (const feat of engine.selectedFeats) {
    const actionType = actionTypeFromText(feat.description);
    const ruleChoiceLabels = ruleChoiceLabelsForSource(engine, feat.id);
    const appliedSummaryLabels = appliedSummariesForSource(engine, feat.id);
    const automationStatus = automationStatusForFeature({
      actionType,
      details: feat.description,
      ruleChoiceLabels,
      appliedSummaryLabels,
      sourceGroup: "feats",
    });
    pushUnique(cards, seen, {
      id: feat.id,
      name: feat.name,
      sourceGroup: "feats",
      sourceLabel: "Feat",
      actionType,
      timing: actionType ? actionType.toLowerCase() : "passive",
      automationStatus,
      manualInstructions: manualInstructionsForFeature(automationStatus),
      knownLimitations: knownLimitationsForFeature(automationStatus, feat.description),
      ruleChoiceLabels,
      appliedSummaryLabels,
      summary: summarize(feat.description ?? feat.prerequisite),
      details: feat.description,
    });
  }

  return (Object.keys(GROUP_LABELS) as FeatureGroupId[])
    .map((groupId) => ({
      id: groupId,
      label: GROUP_LABELS[groupId],
      features: cards
        .filter((card) => card.sourceGroup === groupId)
        .sort((left, right) => (left.level ?? 0) - (right.level ?? 0) || left.name.localeCompare(right.name)),
    }))
    .filter((group) => group.features.length > 0);
}
