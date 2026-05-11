import type { PropsWithChildren, ReactNode } from "react";

type PanelProps = PropsWithChildren<{
  title?: string;
  rightSlot?: ReactNode;
  className?: string;
}>;

export function Panel({ title, rightSlot, className, children }: PanelProps) {
  return (
    <section className={`rounded border border-slate-300 bg-white p-4 shadow-sm ${className ?? ""}`}>
      {(title || rightSlot) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
          {rightSlot}
        </header>
      )}
      {children}
    </section>
  );
}
