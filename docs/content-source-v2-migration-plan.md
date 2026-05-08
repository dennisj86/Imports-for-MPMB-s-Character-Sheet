# Content/Source V2 Migration Plan (`mpmb-core-first`)

Stand: 2026-05-07

## 1) Scope dieser Phase

Ziel: verbleibende UI-/Store-Pfade außerhalb von Builder/Sheet auf V2-Core umstellen.

Betroffen:
- `src/store/sourceStore.ts`
- `src/features/content/components/SourceSelectionPanel.tsx`
- `src/pages/ContentBrowserPage.tsx`

## 2) Altpfad -> Zielpfad Mapping

| Bereich | Altpfad | Zielpfad | Status |
|---|---|---|---|
| Source-Katalog + Presets | `services/data/adapter` in `sourceStore` | `features/content/sourceSelectionService` + `mpmbCore` | umgesetzt |
| Source-Regeneration | `regenerateContentForSelectedSources` (Adapter) | `resolveSourceSelectionRuntime` (V2 Service mit `createMpmbCoreRegistry`) | umgesetzt |
| SourceSelectionPanel Datenbasis | `getAvailableSources` (Adapter) | `sourceStore.availableSources` (V2) | umgesetzt |
| Content Browser Datenzugriff | `getClasses/getSpells/...` (Adapter) | `useContentBrowserV2State` (`mpmbCore` + `rulesModeResolver`) | umgesetzt |
| Content Browser Subclass-Auflösung | `getSubclassesForClass` (Adapter) | `resolveSubclassesForClassFromSnapshot` via V2 content state | umgesetzt |

## 3) Migrationsreihenfolge

1. V2 Source-Selection-Service eingeführt (`sourceSelectionService.ts`).
2. `sourceStore` auf V2 Service umgestellt (Persistenz/Presets/Regenerate).
3. `SourceSelectionPanel` von Adapter auf Store-V2-Daten umgehängt.
4. `ContentBrowserPage` auf `useContentBrowserV2State` umgehängt.
5. Legacy-Panels (`SpellSelectionPanel`, `FeatSelectionPanel`) in `features/character/legacy/` gekapselt.
6. Regressions-Tests für V2 Content-/Source-Pfad ergänzt.

## 4) Risiken / Regressionen

1. Adapter und V2 könnten semantisch driften, wenn Compat-Layer nicht mehr durch Tests beobachtet wird.
2. Source-Preset-Heuristiken basieren weiterhin auf Source-Metadaten (`group`, key patterns); fehlerhafte Metadaten wirken direkt auf Presets.
3. Content Browser nutzt jetzt expliziten `provider`/`rulesMode`-Kontext; bei späteren UI-Änderungen muss Default (`all` + `2024`) erhalten bleiben.
4. Source-Selection bleibt global (nicht pro Charakter); das ist bestehendes Verhalten und weiterhin bewusst.

## 5) Compat-Layer nach dieser Phase

Bleibt bestehen:
- `src/services/data/adapter.ts` als **Compat-/Test-Fassade** (explizit markiert).
- bestehende Adapter-basierte Regressionstests.

Nicht mehr regulärer UI-Hauptpfad:
- `sourceStore`
- `SourceSelectionPanel`
- `ContentBrowserPage`

## 6) Ergebnisbild Standardpfad

Standardpfad der App:
- Builder -> V2 (`wizardV2Engine`, `spellManagementService`)
- Sheet -> V2 (`characterEngine`)
- Content Browser -> V2 (`useContentBrowserV2State`)
- Source Selection -> V2 (`sourceSelectionService` + `sourceStore`)

Damit ist der Adapter im normalen Produktivfluss nicht mehr inhaltlicher Laufzeitanker.
