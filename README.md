# Imports for MPMB's Character Sheet
This git repository holds different fan-created materials that can be used with **MorePurpleMoreBetter's D&D 5e Character Record Sheet**. The repository for the sheet is [found on MPMB's GitHub](https://github.com/morepurplemorebetter/MPMBs-Character-Record-Sheet).

You can get the sheet for free on [MPMB's website](https://www.flapkan.com/#download).

&nbsp;

## Join the discussion
Questions or remarks are best made on the MPMB [Discord server](https://discord.gg/P6drkuk9bt) or the [subreddit](https://www.reddit.com/r/mpmb/).

&nbsp;

## How to use
To get all the non-duplicate WotC content, all you need is the **all_WotC** files from a [release](../../releases). Be aware that the files above might be for a version of MPMB's that is still under development.

1. Download the latest version of the PDF from [MPMB's website](https://www.flapkan.com/#download).
2. [Click here](https://github.com/safety-orange/Imports-for-MPMB-s-Character-Sheet/releases/latest/download/all_WotC_pub+UA.min.js) to download the latest all_WotC_pub+UA.min.js release, and save it somewhere on your machine.
3. Open the PDF and click on the bookmark **Functions** >> **Add Extra Materials**.
4. From the menu that appears, select the option **Import a file with additional material**.
5. In the dialog that opens, click **Add file**, and open the file you saved in step 1.
6. Click **Apply changes** in the Import Files dialog and the sheet will process the file you added. You will get a pop-up message if it was successful or not.

MPMB has a more flashy explanation, along with a video, on how to do this in [this how-to guide on his website](https://www.flapkan.com/how-to/add-more-content).

&nbsp;

## Local Character Builder MVP (Phase 1)

This repository now also contains a local React/TypeScript MVP app for a D&D character builder that reads normalized declarative data from the existing import scripts.

### Start
```sh
npm install
npm run dev
```

The app runs via Vite (default: http://localhost:5173).

### Validation
```sh
npm run typecheck
npm run test
npm run build
```

### Data Ingestion
The app does not import MPMB scripts directly in the browser. Instead, a local ingestion script executes selected source files in a controlled sandbox and writes:

`src/services/data/generated/mpmb-content.json`

Run manually if needed:
```sh
npm run data:generate
```

The ingestion step intentionally ignores imperative MPMB hooks and keeps only declarative fields for the MVP.

Runtime diagnostics for the local MPMB generation are written to:
- `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
- `data/imports/mpmb-local/manifests/latest-runtime-summary.json`

These include parse/runtime errors, shim usage, registry fallback usage, load-order buckets, and regression checks.

### Open5e API V2 Ingestion (Additive)
Open5e is integrated as an additive ingestion source. The pipeline uses Open5e API V2 only (no HTML scraping).

Commands:
```sh
npm run import:open5e:2014
npm run import:open5e:2024
npm run import:open5e:both
```

Each import run fetches, normalizes, and stores artifacts in:
- `data/imports/open5e/raw/`
- `data/imports/open5e/normalized/`
- `data/imports/open5e/manifests/`

The importer also updates the merged app snapshot:
- `src/services/data/generated/mpmb-content.json`

Local generation stays available:
```sh
npm run data:generate
```
If a normalized Open5e artifact exists, `data:generate` merges it additively with local MPMB-normalized data.

### MPMB PDF Ingestion (Additive, Reproducible)
The project can ingest base declarative registries from `docs/DnD.pdf` (no OCR, no HTML scraping) as a second provider (`mpmb`).

Commands:
```sh
npm run import:mpmb-pdf:raw
npm run import:mpmb-pdf:normalize
npm run import:mpmb-pdf
```

What these do:
- `raw`: extract JavaScript sections from the PDF and write raw manifests/scripts
- `normalize`: execute capture sandbox, normalize registries into app schema, refresh merged snapshot
- `import:mpmb-pdf`: run `raw + normalize` in one step

Artifacts:
- `data/imports/mpmb-pdf/raw/`
- `data/imports/mpmb-pdf/normalized/`
- `data/imports/mpmb-pdf/manifests/`

The merged app snapshot remains:
- `src/services/data/generated/mpmb-content.json`

### MPMB Upstream Core Ingestion (Local Repos)
`mpmb` now supports local upstream core imports from two local repositories:

- 2014 upstream (copied in-repo core): `docs/Sheet skripte`
- 2024 upstream (copied in-repo core): `docs/Sheet skripte 2024`

Commands:
```sh
npm run import:mpmb:upstream:2014
npm run import:mpmb:upstream:2024
npm run import:mpmb:upstream:all
```

Artifacts:
- `data/imports/mpmb-upstream-2014/raw/`
- `data/imports/mpmb-upstream-2014/normalized/`
- `data/imports/mpmb-upstream-2014/manifests/`
- `data/imports/mpmb-upstream-2024/raw/`
- `data/imports/mpmb-upstream-2024/normalized/`
- `data/imports/mpmb-upstream-2024/manifests/`

Each run writes:
- raw file manifest (ordered core variable files)
- normalized snapshot in project schema
- import manifest with registry and entity counts
- `comparison-report.json` against legacy `mpmb-local + mpmb-pdf` baseline

Environment overrides (optional):
```sh
MPMB_UPSTREAM_2014_PATH=/path/to/2014/repo npm run import:mpmb:upstream:2014
MPMB_UPSTREAM_2024_PATH=/path/to/2024/repo npm run import:mpmb:upstream:2024
```

### MPMB Core V2 Architecture (mpmb-core-first)
The V2 path now introduces a dedicated core stack that separates rules modes at snapshot level and keeps old MVP paths parallel:

- `src/services/mpmbRuntime/`
  - load plan for `_variables/*`, `_functions/*`, additional content, WotC overlays
- `src/services/mpmbCore/`
  - provider/rulesMode-aware core snapshot registry
- `src/services/mpmbNormalization/`
  - deterministic mode/layer snapshot merge
- `src/services/characterEngine/`
  - applied/derived/progression/action/wizard state from selected core snapshot
- `src/features/wizardV2/`
  - Wizard V2 state preparation from the new engine
- `src/features/spellManagement/`
  - spell choice management service on top of V2 engine
- `src/features/dice/`
  - shared dice utility for upcoming sheet tools

### V2 UI Standard Path
The app routes now use the V2 services as default runtime path:

- `/builder/:id`
  - `useWizardV2State(...)` for wizard steps/validations/completion
  - `useSpellManagement(...)` + `applySpellSelectionToDraft(...)` for spell choice handling
- `/sheet/:id`
  - `useCharacterEngine(...)` for applied rules, derived stats, progression, and action/resources

This removes direct adapter usage from the main Builder/Sheet component tree.

Remaining adapter usage is currently a compatibility scope for:
- legacy regression tests
- explicit compatibility calls in `services/data/adapter.ts`
- source-selection/content-browser no longer use adapter in normal runtime

### Internal MPMB Source Tiers
Within provider `mpmb`, sources are merged additively with tiered precedence:

- `rulesMode=2014`:
  1. `mpmb-upstream-2014` (core)
  2. `mpmb-local` (overlay/addons)
  3. `mpmb-pdf` (fallback)

- `rulesMode=2024`:
  1. `mpmb-upstream-2024` (core)
  2. `mpmb-local` (overlay/addons)
  3. `mpmb-pdf` (fallback)

Open5e remains a separate provider and is not merged into `mpmb` semantics.

### Source Selection in UI
- Open `Content` in the app.
- Use the **Data Sources** panel to pick presets (e.g. Official Handbooks) or individual books/sources.
- You can now scope by provider via presets (`Provider: MPMB` / `Provider: Open5e`).
- Presets include Open5e source sets (`Open5e 2014`, `Open5e 2024`, `Open5e 2014+2024`) once imported.
- Presets include `MPMB Upstream 2014 Core` and `MPMB Upstream 2024 Core`.
- Presets include `MPMB PDF Core` for the PDF-derived source keys.
- Click **Regenerate** to reload the active in-app catalog from the selected sources.
- The selection is persisted locally for the next app start.
- The source-selection flow is V2-driven via:
  - `src/features/content/sourceSelectionService.ts`
  - `src/store/sourceStore.ts`
- `Outlander / Wanderer` is primarily expected from native imported/generated data; manual fallback is only injected when no native Outlander/Wanderer entry exists.

### Content Browser Runtime Path
`/content` now resolves data through the V2 core stack (not adapter getters):

- `src/features/content/useContentBrowserV2State.ts`
  - builds mode/provider-aware snapshot via `mpmbCore`
  - resolves classes/subclasses/species/backgrounds/feats/spells/equipment
- `src/pages/ContentBrowserPage.tsx`
  - consumes V2 content state and service-level filters

The route is lazy-loaded in `src/app/App.tsx` as initial step for bundle isolation.

### Provider vs Rules Mode
The builder now separates data origin from rules interpretation:

- `provider`: `mpmb | open5e`
- `rulesMode`: `2014 | 2024`

These are independent fields on each character draft.

Behavior summary:
- In `rulesMode=2024`, 2024 entries replace 2014 core equivalents when both exist.
- Legacy species remain selectable in 2024 mode, but their legacy species ASI is not applied automatically.
- Legacy backgrounds remain selectable in 2024 mode, use 2024 background ASI handling, and require/select an Origin Feat if no feat is present.
- Legacy subclasses can still be used with 2024 classes when no direct 2024 replacement exists; unlock level follows 2024 class progression.
- In `rulesMode=2014`, no automatic 2024 override is applied.

Resolver/adapter logic for this lives in:
- `src/services/data/rulesModeResolver.ts`
- `src/services/data/adapter.ts`

### Applied Rules Output
The builder and sheet now consume a deterministic applied rules layer derived from the draft:

- `src/services/data/appliedRulesResolver.ts`
- `src/domain/appliedRules.ts`

What this layer materializes:
- species/background conversion results (not only notes)
- applied and pending ability-score adjustments
- class baseline output (proficiency bonus, saving throw proficiencies, class skill-choice requirements)
- background feat grants / origin-feat requirements
- pending choices for the current build

Determinism rules:
- explicit mapping tables are used first (`src/services/data/mappings/*`)
- text-based fallback parsing is secondary and marked in notes/data status
- `CharacterDraft` remains the persisted source of truth; applied output is recalculated at runtime

### Derived Stats Output
A second deterministic layer computes concrete character values from:
- `CharacterDraft`
- resolved/apply-converted rules output

Implemented via:
- `src/services/data/derivedStatsResolver.ts`
- `src/domain/derivedStats.ts`

Current derived coverage:
- ability modifiers and proficiency bonus
- saving throws and skill modifiers
- passive perception/investigation/insight
- initiative and speed baseline
- AC baseline and HP max baseline
- spell save DC / spell attack modifier
- spellcasting basis status (with pending table cases clearly marked)

The sheet and builder consume this output directly.  
Complex temporary effects and full slot/preparation table engines remain intentionally out of scope for this phase.

### Level Progression Output
The builder/sheet now also consume a dedicated progression layer for level-up state:

- `src/services/data/progressionResolver.ts`
- `src/domain/progression.ts`

What it currently covers:
- level-based class/subclass feature unlocks
- subclass requirement at unlock level (pending until selected)
- ASI/Feat opportunities as structured level choices
- first spellcasting progression state (slots/known/prepared/cantrips where safely derivable)
- unified pending choice list for progression + applied-rules requirements

Adapter entrypoint:
- `getCharacterProgression(draft, context?)`

Notes:
- `CharacterDraft` remains the persisted source of truth.
- Progression output is recalculated deterministically at runtime.
- Complex feature/hook automation remains out of scope in this phase.

### Action/Resource Output
The app now has a central Action/Resource layer:

- `src/services/data/actionResourceResolver.ts`
- `src/domain/actionResources.ts`

What it currently materializes:
- actions / bonus actions / reactions / utility actions
- limited-use resources from class/subclass features (`usages`/`recovery` + deterministic fallbacks)
- spellcasting resources (slot pools) and spell actions (selected spells)
- declarative item/weapon action entries where safely derivable

Adapter entrypoint:
- `getCharacterActionResources(draft, context?)`

Scope note:
- This is not a full combat/condition engine.
- Persistent encounter-time resource consumption tracking is not yet part of this phase.

### Builder Wizard Flow (creationX-based)
The previous one-page builder has been restructured into a step wizard derived from `docs/ui images/creationX...`:

1. Class
2. Species
3. Background
4. Ability Scores
5. Feats (dynamic)
6. Skills
7. Spells (dynamic)
8. Equipment
9. About & Review

Primary mapping/decisions are documented in:
- `docs/builder-wizard-plan.md`

Central wizard/eligibility logic (no rule logic in JSX):
- `src/features/character-builder/wizard/stepDefinitions.ts`
- `src/services/data/builderWizardResolver.ts`
- adapter entrypoints in `src/services/data/adapter.ts`:
  - `resolveFeatEligibilityForBuilder`
  - `resolveSpellEligibilityForBuilder`
  - `getEligibleFeatsForChoice`
  - `getEligibleSpellsForChoice`
  - `getClassSkillChoiceStateForBuilder`
  - `getRequiredBuilderChoices`
  - `validateBuilderStep`
  - `getBuilderStepValidations`
  - `isCharacterCreationComplete`

Implemented behavior:
- Step visibility is pending-choice driven (feat/spell steps appear only when relevant).
- Feat selections are context-bound and restricted to legal pools for the active choice context.
- Spell selections are context-bound and restricted to legal pools by class/feat context and spell level bounds.
- Class skill choices are now captured through `featureChoices` and affect applied/derived proficiencies.
- Review step surfaces unresolved requirements by step.

Known partial scope:
- The full "About/Profile" persistence from reference images is not yet in the persisted draft schema.
- Complex feat sub-choice trees and advanced spell-feature interactions are still partial where source data is not fully declarative.

&nbsp;

## Different Versions
The code above is under development, [see releases](../../releases) for the latest stable build. It is updated along with the development of MPMB's Character Record Sheet and thus might be ahead of the latest stable version of MPMB's.

In [releases](../../releases) you can find the files for the latest version of MPMB's Character Record Sheet as well as for older versions (v13.1.13 or later).

If you are looking for versions before v13.1.13, see [tags](../../releases).

Be aware that this content is for the 5th edition of Dungeon & Dragons (2014).

&nbsp;

## Concatenation and Minification

### Setup
Ensure you have `node` and `npm` installed, then:
```sh
npm install
```

### Use
To minify run one of these three commands:
```sh
# For all (stable and beta)
npm run minify
# Just stable
npm run minifyStable
# Just beta
npm run minifyBeta
```
