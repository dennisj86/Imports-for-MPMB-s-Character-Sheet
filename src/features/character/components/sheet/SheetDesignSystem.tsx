import { useId, useState, type FocusEvent, type PropsWithChildren, type ReactNode } from "react";
import type { RollResult } from "../../../../domain/rolls";
import { ruleInfo } from "./rulesInfo";

function joinClassNames(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export type StatusTone = "complete" | "pending" | "unsupported" | "blocked" | "info";

const STATUS_STYLE_BY_TONE: Record<StatusTone, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  unsupported: "border-slate-300 bg-slate-100 text-slate-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

interface CharacterHeroHeaderProps {
  name: string;
  characterLine: string;
  originLine: string;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function CharacterHeroHeader({ name, characterLine, originLine, actions, footer }: CharacterHeroHeaderProps) {
  return (
    <header className="sheet-card sheet-elevation-2 space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-950">{name}</h1>
          <p className="text-sm text-slate-700">{characterLine}</p>
          <p className="text-sm text-slate-600">{originLine}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {footer}
    </header>
  );
}

interface CoreStatCardProps {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
}

export function CoreStatCard({ label, value, sublabel, highlight = false }: CoreStatCardProps) {
  return (
    <article
      className={joinClassNames(
        "sheet-card p-3",
        highlight ? "border-indigo-200 bg-indigo-50/70" : "bg-white",
      )}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-tight text-slate-950">{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-slate-600">{sublabel}</p> : null}
    </article>
  );
}

interface StatPillProps {
  label: string;
  value: string;
}

export function StatPill({ label, value }: StatPillProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700">
      <span className="font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

interface ResourceBadgeProps {
  label: string;
  remaining: number;
  max: number;
  rechargeLabel?: string;
  source?: string;
  quietInfo?: boolean;
}

export function ResourceBadge({ label, remaining, max, rechargeLabel, source, quietInfo = false }: ResourceBadgeProps) {
  const depleted = remaining <= 0;
  return (
    <article className={joinClassNames("sheet-card p-2", depleted ? "border-amber-200 bg-amber-50" : "bg-white")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <StatusBadge status={depleted ? "pending" : "complete"} label={depleted ? "depleted" : "ready"} />
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-slate-700">
        <span>
          {remaining}/{max}
        </span>
        {rechargeLabel ? (
          <>
            <span>· {rechargeLabel}</span>
            {!quietInfo ? <InfoPopover title={`${label} Recharge`} description={ruleInfo(rechargeLabel)} /> : null}
          </>
        ) : null}
      </p>
      {source ? <p className="text-xs text-slate-500">{source}</p> : null}
    </article>
  );
}

interface ActionCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ActionCard({ title, subtitle, badges, actions, className, children }: ActionCardProps) {
  return (
    <article className={joinClassNames("sheet-card p-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-600">{subtitle}</p> : null}
          {badges ? <div className="flex flex-wrap gap-1">{badges}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-1">{actions}</div> : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </article>
  );
}

interface SpellCardShellProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  tags?: ReactNode;
  controls?: ReactNode;
}

export function SpellCardShell({ title, subtitle, tags, controls, children }: SpellCardShellProps) {
  return (
    <article className="sheet-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-600">{subtitle}</p> : null}
          {tags ? <div className="flex flex-wrap gap-1">{tags}</div> : null}
        </div>
        {controls ? <div className="w-full min-w-0 space-y-2 sm:min-w-44 sm:w-auto">{controls}</div> : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </article>
  );
}

interface FeatureCardShellProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
}

export function FeatureCardShell({ title, subtitle, badges, children }: FeatureCardShellProps) {
  return (
    <article className="sheet-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        {badges ? <div className="flex flex-wrap gap-1">{badges}</div> : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </article>
  );
}

interface InventoryItemCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
}

export function InventoryItemCard({ title, subtitle, badges, actions, children }: InventoryItemCardProps) {
  return (
    <article className="sheet-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        {badges ? <div className="flex flex-wrap gap-1">{badges}</div> : null}
      </div>
      {children ? <div className="mt-2 space-y-2">{children}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

interface StatusBadgeProps {
  status: StatusTone;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={joinClassNames("inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_STYLE_BY_TONE[status], className)}>
      {label ?? status}
    </span>
  );
}

interface InfoPopoverProps {
  title: string;
  description?: string;
  className?: string;
}

export function InfoPopover({ title, description, className }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const resolvedDescription = description?.trim() || "Details unavailable.";

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) {
      setOpen(false);
    }
  };

  return (
    <span
      className={joinClassNames("relative inline-flex items-center", className)}
      onBlur={handleBlur}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-controls={tooltipId}
        aria-expanded={open}
        aria-label={`Info for ${title}`}
        className="sheet-focus-ring inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-700"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        i
      </button>
      {open ? (
        <span
          className="absolute left-1/2 top-full z-30 mt-1 w-52 -translate-x-1/2 rounded border border-slate-300 bg-white p-2 text-left text-[11px] leading-snug text-slate-700 shadow-lg"
          id={tooltipId}
          role="tooltip"
        >
          <span className="block font-medium text-slate-900">{title}</span>
          <span className="mt-0.5 block">{resolvedDescription}</span>
        </span>
      ) : null}
    </span>
  );
}

interface RollResultCardProps {
  result?: RollResult;
  title?: string;
}

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function modeLabel(mode: RollResult["rollMode"]): string {
  if (mode === "advantage") return "Advantage";
  if (mode === "disadvantage") return "Disadvantage";
  return "Normal";
}

export function RollResultCard({ result, title = "Last Roll" }: RollResultCardProps) {
  if (!result) {
    return <EmptyState title={title} description="No rolls yet." />;
  }
  const baseRoll = result.dice.keptRoll ?? result.dice.rawRolls[0] ?? 0;
  const bonusDice = result.bonusDice?.map((entry) => `${entry.sourceName ? `${entry.sourceName} ` : ""}${entry.expression}=${entry.total}`).join(", ");
  const permanentModifiers = result.permanentModifierBreakdown?.filter((entry) => entry.applied) ?? [];
  const temporaryModifiers = result.temporaryModifierBreakdown?.filter((entry) => entry.applied) ?? [];
  const rawRolls = result.dice.rawRolls.join(", ");
  return (
    <article aria-live="polite" className="sheet-card sheet-elevation-2 border-indigo-200 bg-indigo-50 p-3">
      <p className="text-xs uppercase tracking-wide text-indigo-700">{title}</p>
      <p className="text-sm font-semibold text-slate-900">{result.label}</p>
      <p className="text-xs text-slate-700">
        {modeLabel(result.rollMode)} · {result.diceExpression}
      </p>
      <div className="mt-2 space-y-1 text-xs text-slate-700">
        <p>Base Roll {baseRoll} · Modifier {modifierLabel(result.baseModifier ?? result.modifier)}</p>
        {result.activeEffects?.length ? <p>Effects: {result.activeEffects.map((entry) => entry.label).join(", ")}</p> : null}
        {permanentModifiers.length ? <p>Permanent: {permanentModifiers.map((entry) => `${entry.sourceName} ${entry.value}`).join(", ")}</p> : null}
        {temporaryModifiers.length ? <p>Temporary: {temporaryModifiers.map((entry) => `${entry.sourceName} ${entry.value}`).join(", ")}</p> : null}
        {bonusDice ? <p>Bonus Dice: {bonusDice}</p> : null}
        {rawRolls ? <p>Dice Rolled: {rawRolls}{result.dice.keptRoll ? ` · kept ${result.dice.keptRoll}` : ""}</p> : null}
      </div>
      <p className="mt-2 text-base font-semibold text-slate-950">Total {result.total}</p>
      {result.outcomeLabel && result.outcomeLabel !== "normal" ? <p className="text-xs text-amber-700">{result.outcomeLabel}</p> : null}
    </article>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="sheet-no-overflow rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="mt-1 text-xs text-slate-600">{description}</p> : null}
    </div>
  );
}

interface DiagnosticsDrawerProps extends PropsWithChildren {
  open: boolean;
  onToggle: () => void;
  title?: string;
  closedDescription?: string;
  showLabel?: string;
  hideLabel?: string;
}

export function DiagnosticsDrawer({
  open,
  onToggle,
  title = "Diagnostics",
  closedDescription = "Diagnostics are hidden for regular play.",
  showLabel = "Show Diagnostics",
  hideLabel = "Hide Diagnostics",
  children,
}: DiagnosticsDrawerProps) {
  const contentId = useId();
  return (
    <section className="sheet-card p-3">
      <SectionHeader
        actions={
          <button
            aria-controls={contentId}
            aria-expanded={open}
            className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-800"
            onClick={onToggle}
            type="button"
          >
            {open ? hideLabel : showLabel}
          </button>
        }
        title={title}
      />
      <div className="mt-3" id={contentId}>{open ? children : <p className="text-sm text-slate-600">{closedDescription}</p>}</div>
    </section>
  );
}
