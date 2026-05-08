import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { CharacterBuilderPage } from "../pages/CharacterBuilderPage";
import { CharacterSheetPage } from "../pages/CharacterSheetPage";
import { HomePage } from "../pages/HomePage";

const ContentBrowserPage = lazy(async () => {
  const module = await import("../pages/ContentBrowserPage");
  return { default: module.ContentBrowserPage };
});

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/builder/:id" element={<CharacterBuilderPage />} />
        <Route path="/sheet/:id" element={<CharacterSheetPage />} />
        <Route
          path="/content"
          element={
            <Suspense fallback={<p className="text-sm text-slate-600">Loading content browser...</p>}>
              <ContentBrowserPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
