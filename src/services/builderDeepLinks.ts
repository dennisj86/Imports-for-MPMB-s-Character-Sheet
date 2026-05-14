import type { WizardStepId } from "../domain/builderWizard";

export interface BuilderDeepLinkTarget {
  stepId: WizardStepId;
  focusId?: string;
  levelUpTarget?: number;
  mode?: "level-up-preview";
  pendingChoiceId?: string;
}

function sanitizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trimKnownPrefixes(value: string): string {
  let current = value;
  while (current.startsWith("progression:progression:")) {
    current = current.slice("progression:".length);
  }
  return current;
}

export function buildBuilderDeepLinkHref(characterId: string, target: BuilderDeepLinkTarget): string {
  const params = new URLSearchParams();
  params.set("step", target.stepId);
  if (target.focusId) {
    params.set("focus", target.focusId);
  }
  if (typeof target.levelUpTarget === "number" && Number.isFinite(target.levelUpTarget)) {
    params.set("levelUpTarget", String(Math.max(1, Math.min(20, Math.floor(target.levelUpTarget)))));
  }
  if (target.mode) {
    params.set("mode", target.mode);
  }
  if (target.pendingChoiceId) {
    params.set("pendingChoiceId", target.pendingChoiceId);
  }
  return `/builder/${characterId}?${params.toString()}`;
}

export function buildRuleChoiceFocusId(choiceId: string): string {
  return `builder-rule-choice-${sanitizeToken(choiceId)}`;
}

export function buildSpellContextFocusId(contextId: string): string {
  return `builder-spell-context-${sanitizeToken(trimKnownPrefixes(contextId))}`;
}

export function buildFeatContextFocusId(contextId: string): string {
  return `builder-feat-context-${sanitizeToken(contextId)}`;
}

export function buildAsiChoiceFocusId(choiceId: string): string {
  return `builder-asi-choice-${sanitizeToken(choiceId)}`;
}

export function buildHpGainFocusId(level: number): string {
  return `builder-hp-gain-level-${level}`;
}

export function buildSkillChoiceFocusId(choiceId: string): string {
  return `builder-skill-choice-${sanitizeToken(choiceId)}`;
}

export function buildSubclassFocusId(): string {
  return "builder-subclass-choice";
}

export function resolveBuilderDeepLinkTarget(input: {
  id: string;
  label: string;
  detail?: string;
  source?: string;
  kind?: string;
}): BuilderDeepLinkTarget | undefined {
  const id = trimKnownPrefixes(input.id);
  const label = input.label.toLowerCase();
  const detail = (input.detail ?? "").toLowerCase();
  const source = (input.source ?? "").toLowerCase();
  const kind = (input.kind ?? "").toLowerCase();
  const combined = `${id} ${label} ${detail} ${source} ${kind}`;

  if (kind === "subclass-selection" || /subclass/.test(combined)) {
    return {
      stepId: "class",
      focusId: buildSubclassFocusId(),
    };
  }

  if (kind === "spell-selection" || /cantrip|spell/.test(combined)) {
    const focusKey = id.startsWith("spell-context:") || id.startsWith("progression:spell-selection:")
      ? id
      : input.id;
    return {
      stepId: "spells",
      focusId: buildSpellContextFocusId(focusKey),
    };
  }

  if (kind === "asi-or-feat" || /asi-or-feat|ability score improvement|feat choice/.test(combined)) {
    return {
      stepId: "feats",
      focusId: buildAsiChoiceFocusId(id),
    };
  }

  if (/hp gain|hit point gain|rolled\/manual hit point gain/.test(combined)) {
    const levelMatch = combined.match(/level\s*([0-9]+)/);
    const level = levelMatch ? Number(levelMatch[1]) : undefined;
    return {
      stepId: "feats",
      focusId: typeof level === "number" && Number.isFinite(level) ? buildHpGainFocusId(level) : undefined,
    };
  }

  if (kind === "skill-choice" || /skill/.test(combined)) {
    const focusKey = id === "applied:skill-class" || id === "skill-class"
      ? "skill-choice:class"
      : id === "applied:skill-species" || id === "skill-species"
        ? "skill-choice:species"
        : id.startsWith("applied:skill-")
          ? `skill-choice:${id.slice("applied:skill-".length)}`
          : id.startsWith("skill-")
            ? `skill-choice:${id.slice("skill-".length)}`
            : id.startsWith("applied:")
              ? id.slice("applied:".length)
              : id;
    return {
      stepId: "skills",
      focusId: buildSkillChoiceFocusId(focusKey),
    };
  }

  if (kind === "origin-feat") {
    return {
      stepId: "feats",
      focusId: buildFeatContextFocusId("feat-choice:origin"),
    };
  }

  if (id.startsWith("rule-choice:") || /fighting style|weapon mastery|feature choice|class feature|divine sense|lay on hands/.test(combined)) {
    return {
      stepId: "feats",
      focusId: buildRuleChoiceFocusId(input.id),
    };
  }

  if (source === "background") {
    return { stepId: "background" };
  }

  if (source === "species") {
    return { stepId: "species" };
  }

  if (source === "class") {
    return { stepId: "class" };
  }

  return undefined;
}
