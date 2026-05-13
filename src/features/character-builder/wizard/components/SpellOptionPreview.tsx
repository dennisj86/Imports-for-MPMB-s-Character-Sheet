import type { SpellDefinition } from "../../../../domain/content";
import { RuleDetailDrawer, type RuleDetailModel } from "../../../character/components/sheet/RuleDetailDrawer";
import type { RuleAutomationStatus } from "../../../character/components/sheet/ruleAutomationStatus";

export interface SpellPreviewOptions {
  sourceLabel?: string;
  automationStatus?: RuleAutomationStatus | "unknown";
  description?: string;
  manualInstructions?: string;
  knownLimitations?: string;
  heading?: string;
  id?: string;
}

function firstSentence(value: string | undefined): string | undefined {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  const sentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return sentence.length > 220 ? `${sentence.slice(0, 217).trim()}...` : sentence;
}

function spellComponentsFromDescription(description: string | undefined): string | undefined {
  const text = String(description ?? "");
  const explicit = text.match(/(?:^|\n)\s*components?\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) {
    return explicit;
  }
  const materialMention = text.match(/\bmaterial components?\b[^.\n]*/i)?.[0]?.trim();
  return materialMention || undefined;
}

function spellUpcastText(description: string | undefined): string | undefined {
  const text = String(description ?? "");
  const atHigherLevels = text.match(/at higher levels?\.?\s*([\s\S]+)/i);
  if (!atHigherLevels) {
    return undefined;
  }
  return atHigherLevels[1]?.split(/\n{2,}/)[0]?.replace(/\s+/g, " ").trim();
}

export function buildSpellOptionDetailModel(
  spell: SpellDefinition,
  options: SpellPreviewOptions = {},
): RuleDetailModel {
  const levelLabel = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
  return {
    name: spell.name,
    source: options.sourceLabel ?? "Spell",
    timing: spell.castingTime ?? "action",
    rangeOrTarget: spell.range,
    duration: spell.duration,
    cost: spell.level === 0 ? "No slot cost (cantrip)." : `Spell slot level ${spell.level}+`,
    description: options.description ?? spell.description,
    gameplaySummary: firstSentence(options.description ?? spell.description) ?? `${levelLabel}${spell.school ? ` · ${spell.school}` : ""}`,
    automationStatus: options.automationStatus ?? "unknown",
    manualInstructions: options.manualInstructions ?? "Confirm targeting, save/attack handling, and edge-case outcomes manually.",
    knownLimitations: options.knownLimitations ?? "No full spell effect automation engine is implemented.",
    fields: [
      { label: "Spell Level", value: levelLabel },
      { label: "School", value: spell.school },
      { label: "Casting Time", value: spell.castingTime },
      { label: "Range", value: spell.range },
      { label: "Duration", value: spell.duration },
      { label: "Concentration/Ritual", value: `${spell.concentration ? "Concentration" : "No concentration"}${spell.ritual ? " · Ritual" : ""}` },
      { label: "Components", value: spellComponentsFromDescription(spell.description) },
      { label: "At Higher Levels", value: spellUpcastText(spell.description) },
    ],
  };
}

export function spellOptionSummary(spell: SpellDefinition): string {
  const levelLabel = spell.level === 0 ? "Cantrip" : `L${spell.level}`;
  return `${levelLabel} · ${spell.school ?? "School?"}${spell.castingTime ? ` · ${spell.castingTime}` : ""}${spell.range ? ` · ${spell.range}` : ""}${spell.duration ? ` · ${spell.duration}` : ""}`;
}

export function SpellOptionPreview({
  spell,
  sourceLabel,
  automationStatus = "unknown",
  manualInstructions,
  knownLimitations,
  heading = "Spell Preview",
  id,
}: {
  spell: SpellDefinition;
} & SpellPreviewOptions) {
  return (
    <RuleDetailDrawer
      detail={buildSpellOptionDetailModel(spell, {
        sourceLabel,
        automationStatus,
        manualInstructions,
        knownLimitations,
      })}
      heading={heading}
      id={id}
    />
  );
}
