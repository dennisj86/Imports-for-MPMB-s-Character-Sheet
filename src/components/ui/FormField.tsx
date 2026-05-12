import type { PropsWithChildren, ReactNode } from "react";

type FormFieldProps = PropsWithChildren<{
  label: string;
  hint?: ReactNode;
}>;

export function FormField({ label, hint, children }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function inputClassName() {
  return "sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300";
}
