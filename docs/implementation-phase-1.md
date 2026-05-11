# Implementation Phase 1: MVP Foundation

## 1. Implemented in Phase 1
### App scaffold
- React + TypeScript + Vite app at repository root (`src/*`, `index.html`, `vite.config.ts`).
- Tailwind configured (`tailwind.config.ts`, `postcss.config.cjs`, `src/index.css`).
- Zustand + Zod + Vitest integrated.
- Existing MPMB minify scripts kept intact.

### Data ingestion + adapter layer
- Added ingestion script: `scripts/generate-mpmb-data.cjs`.
- Script executes source files in a controlled VM sandbox and extracts declarative data into:
  - `src/services/data/generated/mpmb-content.json`
- Adapter API implemented in `src/services/data/adapter.ts`:
  - `getClasses()`
  - `getClassById(id)`
  - `getSubclassesForClass(classId)`
  - `getSpecies()`
  - `getBackgrounds()`
  - `getFeats()`
  - `getSpells(filters)`
  - `getSpellById(id)`
  - `getEquipmentCatalog(filters)`
  - plus `getFeaturesForClassLevel(classId, subclassId, level)` for UI usage

### Domain model + derived state
- MVP domain types added:
  - `CharacterDraft`, `AbilityScores`, `ClassSelection`, `SubclassSelection`,
    `SpeciesSelection`, `BackgroundSelection`, `SpellSelection`, `FeatureChoice`,
    `InventoryState`, `DerivedSummary`
- Derived logic added:
  - ability modifier
  - total level
  - passive summary (`Perception/Insight/Investigation`)
  - declarative feature collection by level
  - spellcasting availability hint (declarative signal only)

### Persistence
- localStorage persistence with versioned payload (`version: 1`) in:
  - `src/services/persistence/characterPersistence.ts`
- JSON export/import on character list page.

### UI (wireframe, functional)
- `HomePage`: create/list/delete characters, JSON import/export.
- `CharacterBuilderPage`: name, level, class, subclass, species, background, ability scores, feats, spells, inventory.
- `CharacterSheetPage`: derived summary + chosen data display.
- `ContentBrowserPage`: tabs for classes/subclasses/species/backgrounds/feats/spells/equipment with search/filter.
- `Data Sources` panel (inside Content Browser):
  - Presets (`All Sources`, `Official Handbooks`, `Official Books`, `Adventure Books`, `Unearthed Arcana`)
  - Manual single-source selection
  - `Regenerate` button to rebuild the active in-app catalog from selected sources
  - Local persistence of selected sources

## 2. Data sources used in this phase
- `WotC material/pub_*.js`
- `WotC material/ua_*.js`
- `WotC 2024/*.js`
- `Homebrew/*.js`

Ingestion currently loads many sources successfully and tolerates partial-file runtime errors by continuing with the next file.

## 3. Explicitly ignored in Phase 1
- MPMB imperative hooks are not ported or executed as rules logic:
  - `eval`, `removeeval`, `changeeval`, `calcChanges`
  - similar callback-driven side effects
- No string-formula interpreter was added.
- No full AC/HP/Saves/Skills automation.
- No multiclassing engine.

## 4. Current known gaps
- Parse warnings remain during ingestion (`meta.parseErrors` in generated JSON); these come from missing MPMB runtime context and cross-file assumptions.
- Content is usable but incomplete for strict rule automation.
- Class coverage is limited to class definitions present in this repository’s import files (the repo is subclass/content-heavy, not full core class engine data).
- Large generated JSON currently inflates a single frontend bundle chunk.
- Source filtering is entity-source-ref based; it is intentionally pragmatic and not yet a full cross-source dependency resolver.

## 5. Validation executed
- `npm install`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- Dev server startup verified via `npm run dev` at `http://127.0.0.1:5173/`

## 6. Recommended next phase
1. Improve ingestion compatibility layer (reduce parse errors, add deterministic fallbacks per registry type).
2. Add source-mode selection (2014 vs 2024) and conflict policy.
3. Add adapter-level validation diagnostics (report dropped/partial entities per source file).
4. Implement first bounded rule engine slice:
   - proficiency bonus
   - class-level spell slot table resolution where declarative data exists
   - starter save/skill proficiency mapping
5. Introduce lazy-loading/code-splitting for large content payloads.
