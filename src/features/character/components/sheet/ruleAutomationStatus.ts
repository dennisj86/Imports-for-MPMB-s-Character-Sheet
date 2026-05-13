import type { ActionAutomationStatus } from "../../../../domain/rolls";
import type { StatusTone } from "./SheetDesignSystem";

export type RuleAutomationStatus = "automated" | "partial" | "manual" | "unsupported" | "unknown";

export function normalizeRuleAutomationStatus(
  status: string | undefined,
  fallback: RuleAutomationStatus = "unknown",
): RuleAutomationStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "automated" || normalized === "partial" || normalized === "manual" || normalized === "unsupported" || normalized === "unknown") {
    return normalized;
  }
  if (normalized === "complete") {
    return "automated";
  }
  if (normalized === "pending") {
    return "partial";
  }
  return fallback;
}

export function ruleAutomationFromActionStatus(status: ActionAutomationStatus | undefined): RuleAutomationStatus {
  return normalizeRuleAutomationStatus(status, "unknown");
}

export function ruleAutomationTone(status: RuleAutomationStatus): StatusTone {
  if (status === "automated") return "complete";
  if (status === "partial") return "pending";
  if (status === "manual") return "blocked";
  if (status === "unsupported") return "unsupported";
  return "info";
}

export function ruleAutomationExplanation(status: RuleAutomationStatus): string {
  if (status === "automated") return "Sheet handles this.";
  if (status === "partial") return "Sheet handles part of this.";
  if (status === "manual") return "Read and apply manually.";
  if (status === "unsupported") return "Known, but not implemented.";
  return "No structured automation data found.";
}

export function defaultManualInstructionForStatus(status: RuleAutomationStatus): string {
  if (status === "automated") {
    return "No manual step required unless a table ruling changes this.";
  }
  if (status === "partial") {
    return "Confirm targets, triggers, and edge cases manually.";
  }
  if (status === "manual") {
    return "Apply this rule manually at the table.";
  }
  if (status === "unsupported") {
    return "Track and resolve this rule manually.";
  }
  return "No structured automation path was found; resolve manually.";
}
