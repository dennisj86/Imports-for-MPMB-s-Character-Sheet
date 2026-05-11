import { toSlug } from "../../lib/slug";
import type { CharacterDraft } from "../../domain/character";
import type {
  CanonicalChoiceOrigin,
  CanonicalChoiceStatus,
  CanonicalRuleChoice,
  HiddenRuleChoiceDuplicate,
  RuleChoice,
  RuleChoiceSurfaceState,
  RuleSourceDescriptor,
} from "../../domain/rules";
import { applyChoiceState } from "./choicePipeline";

type ResolvedChoiceEntry = {
  choice: RuleChoice;
  source: RuleSourceDescriptor;
  canonicalKey: string;
  origin: CanonicalChoiceOrigin;
  priority: number;
};

function normalizeSurfaceToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^rule-source-/, "")
    .replace(/^feature-/, "")
    .replace(/^feat-/, "")
    .replace(/^spell-/, "")
    .replace(/^item-/, "")
    .replace(/-2014$/, "")
    .replace(/-2024$/, "");
}

function sourceToken(source: RuleSourceDescriptor): string {
  return normalizeSurfaceToken(source.sourceId ?? source.sourceName);
}

function canonicalKeyFor(source: RuleSourceDescriptor, choice: RuleChoice): string {
  return [
    source.sourceType,
    sourceToken(source),
    choice.choiceType,
    String(choice.appliesAtLevel ?? source.level ?? "any"),
    source.rulesMode,
    source.provider,
  ].join(":");
}

function originFor(choice: RuleChoice, source: RuleSourceDescriptor, persisted: CharacterDraft["ruleChoices"] = {}): CanonicalChoiceOrigin {
  const state = persisted?.[choice.id];
  if (state?.status === "complete") {
    return "level-up-state";
  }
  const diagnostics = choice.diagnostics.join(" ").toLowerCase();
  if (diagnostics.includes("rule mapping") || (source.mappingRefs?.length ?? 0) > 0 && choice.id.includes(":feature:")) {
    return "rule-mapping";
  }
  if (diagnostics.includes("fallback") || diagnostics.includes("choice language detected")) {
    return "legacy-detection";
  }
  if (choice.status === "unsupported") {
    return "diagnostic";
  }
  return "structured-progression";
}

function priorityFor(choice: RuleChoice, origin: CanonicalChoiceOrigin, persisted: CharacterDraft["ruleChoices"] = {}): number {
  if (persisted?.[choice.id]?.status === "complete" && choice.status === "complete") return 100;
  if (choice.status === "complete") return 90;
  if (origin === "structured-progression") return 80;
  if (origin === "rule-mapping" && choice.status !== "unsupported") return 70;
  if (origin === "level-up-state") return 60;
  if (origin === "diagnostic") return 40;
  if (origin === "legacy-detection") return 20;
  return 10;
}

function canonicalStatus(choice: RuleChoice): CanonicalChoiceStatus {
  if (choice.isAvailable === false) {
    return "blocked";
  }
  if (choice.requiredCount === 0 && choice.options.length === 0 && choice.status === "complete") {
    return "informational";
  }
  return choice.status;
}

function labelFor(source: RuleSourceDescriptor, choice: RuleChoice): string {
  const choiceLabel = choice.choiceType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${choiceLabel} - ${source.sourceName}`;
}

function selectedCount(choice: RuleChoice): number {
  return choice.selectedOptionIds.length;
}

function isEditable(choice: RuleChoice): boolean {
  return choice.status !== "unsupported" && choice.options.length > 0 && choice.maxCount > 0;
}

function compareEntries(left: ResolvedChoiceEntry, right: ResolvedChoiceEntry): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  const leftStatusWeight = statusWeight(left.choice.status);
  const rightStatusWeight = statusWeight(right.choice.status);
  if (leftStatusWeight !== rightStatusWeight) return rightStatusWeight - leftStatusWeight;
  if (left.choice.options.length !== right.choice.options.length) return right.choice.options.length - left.choice.options.length;
  if (selectedCount(left.choice) !== selectedCount(right.choice)) return selectedCount(right.choice) - selectedCount(left.choice);
  return left.choice.id.localeCompare(right.choice.id);
}

function statusWeight(status: RuleChoice["status"]): number {
  if (status === "complete") return 4;
  if (status === "pending") return 3;
  if (status === "needs-builder") return 2;
  return 1;
}

function toCanonical(entry: ResolvedChoiceEntry, mergedFrom: string[], diagnostics: string[]): CanonicalRuleChoice {
  const status = canonicalStatus(entry.choice);
  return {
    id: entry.choice.id,
    canonicalKey: entry.canonicalKey,
    label: labelFor(entry.source, entry.choice),
    sourceType: entry.source.sourceType,
    sourceId: entry.source.sourceId,
    sourceName: entry.source.sourceName,
    sourceLevel: entry.source.level,
    choiceType: entry.choice.choiceType,
    requiredCount: entry.choice.requiredCount,
    selectedCount: selectedCount(entry.choice),
    options: entry.choice.options,
    selectedOptionIds: entry.choice.selectedOptionIds,
    status,
    priority: entry.priority,
    origin: entry.origin,
    mergedFrom,
    diagnostics: [...entry.choice.diagnostics, ...diagnostics],
    playerVisible: status !== "informational",
    builderEditable: isEditable(entry.choice),
    choice: entry.choice,
    parentChoiceId: entry.choice.parentChoiceId,
    dependsOn: entry.choice.dependsOn,
    selectedPath: entry.choice.selectedPath,
    optionScope: entry.choice.optionScope,
    generatedByOptionId: entry.choice.generatedByOptionId,
    choiceStage: entry.choice.choiceStage,
  };
}

function hiddenDuplicate(entry: ResolvedChoiceEntry, winner: ResolvedChoiceEntry): HiddenRuleChoiceDuplicate {
  return {
    id: entry.choice.id,
    canonicalKey: entry.canonicalKey,
    label: labelFor(entry.source, entry.choice),
    choiceType: entry.choice.choiceType,
    sourceDescriptorId: entry.choice.sourceDescriptorId,
    sourceType: entry.source.sourceType,
    sourceName: entry.source.sourceName,
    origin: entry.origin,
    status: canonicalStatus(entry.choice),
    hiddenBy: winner.choice.id,
    reason: `Hidden by higher-priority ${winner.origin} choice for the same source and choice type.`,
    diagnostics: entry.choice.diagnostics,
  };
}

function withChildCompletionStatus(choices: CanonicalRuleChoice[]): CanonicalRuleChoice[] {
  const childrenByParent = new Map<string, CanonicalRuleChoice[]>();
  for (const choice of choices) {
    if (!choice.parentChoiceId || choice.requiredCount === 0) {
      continue;
    }
    childrenByParent.set(choice.parentChoiceId, [...(childrenByParent.get(choice.parentChoiceId) ?? []), choice]);
  }
  return choices.map((choice) => {
    const children = (childrenByParent.get(choice.id) ?? []).filter((child) => {
      const requiredOption = child.dependsOn?.requiredSelectedOptionId;
      return !requiredOption || choice.selectedOptionIds.includes(requiredOption);
    });
    if (children.length === 0) {
      return choice;
    }
    const blockingChildren = children.filter((child) => child.status !== "complete" && child.status !== "informational");
    if (blockingChildren.length === 0) {
      return choice;
    }
    const hasUnsupported = blockingChildren.some((child) => child.status === "unsupported");
    const nextStatus: CanonicalChoiceStatus = hasUnsupported ? "unsupported" : "pending";
    const diagnostics = [
      ...choice.diagnostics,
      `Parent choice remains ${nextStatus} because ${blockingChildren.length} required child choice(s) are incomplete.`,
      ...blockingChildren.map((child) => `Required child incomplete: ${child.choiceType} (${child.selectedCount}/${child.requiredCount}).`),
    ];
    return {
      ...choice,
      status: nextStatus,
      diagnostics,
      choice: {
        ...choice.choice,
        status: nextStatus === "unsupported" ? "unsupported" : "pending",
        diagnostics,
      },
    };
  });
}

export function buildRuleChoiceSurface(
  sources: RuleSourceDescriptor[],
  persisted: CharacterDraft["ruleChoices"] = {},
): RuleChoiceSurfaceState {
  const entries: ResolvedChoiceEntry[] = [];
  for (const source of sources) {
    for (const rawChoice of source.choices) {
      const choice = applyChoiceState(rawChoice, persisted?.[rawChoice.id]);
      const origin = originFor(choice, source, persisted);
      entries.push({
        choice,
        source,
        canonicalKey: canonicalKeyFor(source, choice),
        origin,
        priority: priorityFor(choice, origin, persisted),
      });
    }
  }

  const groups = new Map<string, ResolvedChoiceEntry[]>();
  for (const entry of entries) {
    groups.set(entry.canonicalKey, [...(groups.get(entry.canonicalKey) ?? []), entry]);
  }

  const choices: CanonicalRuleChoice[] = [];
  const hiddenDuplicates: HiddenRuleChoiceDuplicate[] = [];
  const diagnostics: string[] = [];

  for (const [canonicalKey, grouped] of Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    const sorted = [...grouped].sort(compareEntries);
    const winner = sorted[0];
    const hidden = sorted.slice(1);
    if (!winner) continue;
    hiddenDuplicates.push(...hidden.map((entry) => hiddenDuplicate(entry, winner)));
    if (hidden.length > 0) {
      diagnostics.push(`${hidden.length} duplicate choice source(s) hidden for ${canonicalKey}; canonical choice is ${winner.choice.id}.`);
    }
    choices.push(toCanonical(winner, sorted.map((entry) => entry.choice.id), hidden.map((entry) => `Merged duplicate ${entry.choice.id} from ${entry.origin}.`)));
  }

  const adjustedChoices = withChildCompletionStatus(choices);

  return {
    rawChoiceCount: entries.length,
    choices: adjustedChoices.sort((left, right) => {
      const statusOrder: Record<CanonicalChoiceStatus, number> = {
        pending: 0,
        blocked: 1,
        "needs-builder": 1,
        unsupported: 2,
        complete: 3,
        informational: 4,
      };
      const statusDiff = statusOrder[left.status] - statusOrder[right.status];
      if (statusDiff !== 0) return statusDiff;
      return left.label.localeCompare(right.label);
    }),
    hiddenDuplicates,
    diagnostics,
  };
}
