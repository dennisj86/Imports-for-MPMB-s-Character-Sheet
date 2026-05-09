import type { CharacterEngineState } from "../../../services/characterEngine";

export type FeatureGroupId = "class" | "subclass" | "species" | "background" | "feats" | "items";

export interface FeatureCardViewModel {
  id: string;
  name: string;
  sourceGroup: FeatureGroupId;
  sourceLabel: string;
  level?: number;
  actionType?: string;
  usesLabel?: string;
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

export function buildFeatureGroupsViewModel(engine: CharacterEngineState): FeatureGroupViewModel[] {
  const cards: FeatureCardViewModel[] = [];
  const seen = new Set<string>();

  for (const feature of engine.progression.unlockedClassFeatures) {
    pushUnique(cards, seen, {
      id: feature.id,
      name: feature.name,
      sourceGroup: "class",
      sourceLabel: engine.classDef?.name ?? "Class",
      level: feature.minLevel,
      actionType: actionTypeFromText(feature.description),
      summary: summarize(feature.description),
      details: feature.description,
    });
  }

  for (const feature of engine.progression.unlockedSubclassFeatures) {
    pushUnique(cards, seen, {
      id: feature.id,
      name: feature.name,
      sourceGroup: "subclass",
      sourceLabel: engine.subclassDef?.name ?? "Subclass",
      level: feature.minLevel,
      actionType: actionTypeFromText(feature.description),
      summary: summarize(feature.description),
      details: feature.description,
    });
  }

  engine.appliedRules.speciesResult.traits.forEach((trait, index) => {
    pushUnique(cards, seen, {
      id: `species-trait:${engine.speciesDef?.id ?? "species"}:${index}`,
      name: `${engine.speciesDef?.name ?? "Species"} Trait`,
      sourceGroup: "species",
      sourceLabel: engine.speciesDef?.name ?? "Species",
      actionType: actionTypeFromText(trait),
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
      pushUnique(cards, seen, {
        id: `background:${engine.backgroundDef?.id}:${index}`,
        name: engine.backgroundDef?.name ?? "Background",
        sourceGroup: "background",
        sourceLabel: "Background",
        summary: summarize(detail),
        details: detail,
      });
    });
  }

  for (const feat of engine.selectedFeats) {
    pushUnique(cards, seen, {
      id: feat.id,
      name: feat.name,
      sourceGroup: "feats",
      sourceLabel: "Feat",
      actionType: actionTypeFromText(feat.description),
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
