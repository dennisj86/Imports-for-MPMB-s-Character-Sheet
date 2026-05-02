import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { CharacterBuilderPage } from "../pages/CharacterBuilderPage";
import { CharacterSheetPage } from "../pages/CharacterSheetPage";
import { ContentBrowserPage } from "../pages/ContentBrowserPage";
import { HomePage } from "../pages/HomePage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/builder/:id" element={<CharacterBuilderPage />} />
        <Route path="/sheet/:id" element={<CharacterSheetPage />} />
        <Route path="/content" element={<ContentBrowserPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
