import type { PropsWithChildren } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm ${isActive ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-800 hover:bg-slate-300"}`;

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const partyMode = location.pathname.startsWith("/party/");
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-300 bg-white">
        <div className={`${partyMode ? "w-full" : "mx-auto max-w-7xl"} flex items-center justify-between px-4 py-3`}>
          <Link to="/" className="text-base font-semibold text-slate-800">
            D&D Character Builder MVP
          </Link>
          <nav className="flex gap-2">
            <NavLink className={navClass} to="/">
              Characters
            </NavLink>
            <NavLink className={navClass} to="/party/default">
              Party
            </NavLink>
            <NavLink className={navClass} to="/content">
              Content
            </NavLink>
          </nav>
        </div>
      </header>
      <main className={partyMode ? "w-full px-2 py-2 lg:px-3" : "mx-auto max-w-7xl px-4 py-4"}>{children}</main>
    </div>
  );
}
