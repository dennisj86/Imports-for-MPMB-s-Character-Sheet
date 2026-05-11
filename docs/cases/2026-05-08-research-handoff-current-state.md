# Research Handoff: Current State of the D&D Character Builder

## 1. Objective
- This handoff gives a research model a **current, implementation-grounded** baseline of the project.
- The goal is to choose the **next high-value phase** without restarting architecture work or drifting into full-parity fantasy planning.
- Expected use: derive one concrete next step, sequence hint for the next 1-3 phases, and a Codex-ready implementation prompt.

## 2. Current Product Direction
- The project is now explicitly `mpmb-core-first`.
- Primary rule basis is the copied MPMB script ecosystems:
  - `docs/Sheet skripte` (2014-oriented core)
  - `docs/Sheet skripte 2024` (2024-oriented core)
  - plus additive overlays (`WotC material`, `WotC 2024`, local additions).
- `provider` and `rulesMode` are intentionally separated:
  - `provider` = data origin (`mpmb`, `open5e`, optionally combined in content browsing)
  - `rulesMode` = interpretation mode (`2014` vs `2024`)
- V2 was introduced to decouple product runtime from legacy adapter-centric flows and to keep business logic in resolvers/engine layers instead of UI components.

## 3. Current Implemented State

### Architecture
- V2 layers are implemented and wired:
  - `mpmbRuntime` (load plans, runtime summaries)
  - `mpmbCore` (provider/rulesMode snapshot selection)
  - `mpmbNormalization` (layered snapshot merge)
  - `characterEngine` (applied rules, derived stats, progression, action/resource output)
  - `wizardV2` + `spellManagement` + `dice` utilities
- Legacy `adapter` still exists as explicit compat/test facade, but no longer as primary UI runtime path.

### Data sources
- MPMB upstream core ingest exists for both modes:
  - `mpmb-upstream-2014`
  - `mpmb-upstream-2024`
- Layer order for `provider=mpmb` is implemented as:
  - mode core -> local overlay -> pdf fallback -> manual/other fragments.
- `open5e` remains a separate provider path and can be combined in browser contexts (`provider=all`).

### V2 UI status (productive path)
- `/builder/:id` uses `useWizardV2State` + `useSpellManagement`.
- `/sheet/:id` uses `useCharacterEngine`.
- `/content` uses `useContentBrowserV2State`.
- Source selection uses V2 `sourceSelectionService` + `sourceStore`.
- Tests explicitly guard that builder/sheet/content paths are not using direct adapter imports.

### Wizard / Sheet / Content / Source-Selection behavior
- Standard builder flow exists with class/species/background/abilities/skills/feats/spells/equipment/review steps.
- Rules-mode conversion behavior is active (e.g., 2024 conversion notes/requirements).
- Structured pending choices are present for feat/spell/skill/equipment contexts (not full rule-depth parity).
- Character sheet renders derived values, progression results, and action/resource summaries from engine output.

### Persistence / migration
- Persisted draft schema is v2 with `provider` + `rulesMode`.
- v1 payload migration is implemented (defaulting old saves into v2 shape).
- Source selection is persisted, currently as global selection (not per-character).

### Tests / regression / guardrails
- Local verification run on **2026-05-08**:
  - `npm run test -- --run`: **29 files, 90 tests, all passing**
  - `npm run typecheck`: passing
  - `npm run build`: passing (with known large-chunk warning)
- Data generation currently reports parse errors at zero in merged/local summaries.
- Guardrail stance is explicit: no `eval`/`removeeval`/`calcChanges` hook execution as hidden runtime engine.

### What is actually usable today
- Single-user local character creation/editing, rules-mode aware content resolution, sheet rendering, source filtering, import/export of draft state.
- Deterministic resolver pipeline for many core 2014/2024 build decisions.
- Enough for meaningful builder/sheet use; not enough for full D&D Beyond-like play/collaboration lifecycle.

## 4. What Is Deliberately Not Done Yet
- No full combat execution engine (turn logic, condition engine, encounter orchestration).
- No full MPMB hook-port parity (`eval`/`removeeval`/`changeeval`/`calcChanges` execution).
- No complete multiclass + full cross-feature interaction coverage.
- No full D&D Beyond feature parity across Quickbuilder/Premades/Campaign platform flows.
- No full audit/event-sourcing and sync conflict model for multi-user collaboration.
- No complete homebrew publishing/moderation/library stack.
- No per-character source-selection scope (global source selection is intentionally retained for now).
- No indefinite architecture/performance polishing before selecting the next product-facing step.

## 5. Gap Assessment Against “D&D Beyond-like”

| Deep-research category | Current state | Gap class | Priority now |
|---|---|---|---|
| Rule data breadth + mode handling | Strong for mpmb-core-first + 2014/2024 split + source toggles | Partial (edge coverage and fidelity gaps remain) | Keep stable, no redesign |
| Deterministic calculation pipeline | Implemented (applied/derived/progression/action-resource layers) | Partial (not full rules/hook parity) | Incremental extension only |
| Interactive builder/sheet UI | Implemented on V2 path | Partial (no full play loop state) | High |
| Builder modality breadth (Standard/Quickbuilder/Premades) | Standard-like flow only | Large | Medium |
| Spellcasting/inventory/combat runtime operations | Selection + derived output exists; persistent play-state is limited | Large | High |
| Platform/collaboration (campaigns, sharing, permissions) | Largely absent | Very large | Too early now |
| Audit/sync/offline | Basic local persistence only | Very large | Too early now |
| Homebrew lifecycle/library | Source-level support exists, platform lifecycle absent | Large | Later |

Interpretation: the project has crossed the “data plumbing + architectural split” threshold. The biggest remaining gap to a D&D Beyond-like experience is now **stateful play usability**, not another core rewrite.

## 6. Practical Constraints
- Avoid endless optimization passes with little product gain.
- Avoid reopening architecture decisions already stabilized by `mpmb-core-first`.
- Prefer “finished enough to use” over maximal elegance.
- Reuse existing MPMB-core-based layers; do not switch back to PDF/Open5e as structural primary basis for `provider=mpmb`.
- Keep scope bounded to one next phase with clear non-goals.

## 7. Most Likely Next Step Candidates

### Candidate A: Stateful Play Loop V1 (Sheet Runtime)
- Nutzen:
  - Turns current sheet from mostly static output into active play surface.
  - Directly reduces the largest practical gap after builder V2 migration.
- Risiko:
  - State complexity (resource spend, rest reset, concentration/slot interactions).
- Abhängigkeiten:
  - Existing `characterEngine`, `actionResourceResolver`, `spellManagement`, `dice` layer, persistence schema extension.
- Warum jetzt:
  - High user-visible gain without replacing current core architecture.
- Warum ggf. noch nicht:
  - If product wants pure builder-depth first.

### Candidate B: Level-Up + Multiclass Phase 1
- Nutzen:
  - Strong rules-depth gain for advanced characters/campaign longevity.
- Risiko:
  - High edge-case surface; can consume multiple iterations quickly.
- Abhängigkeiten:
  - Progression resolver expansion, feature-choice modeling, spell-slot combinatorics.
- Warum jetzt:
  - Important for parity trajectory.
- Warum ggf. noch nicht:
  - Lower immediate usability gain than stateful play loop for level-1 to early-level sessions.

### Candidate C: Quickbuilder + Premade Flow
- Nutzen:
  - Faster onboarding and closer parity with D&D Beyond creation modes.
- Risiko:
  - Can hide unresolved depth gaps if built too early.
- Abhängigkeiten:
  - Stable defaults/templates, deterministic preselection rules.
- Warum jetzt:
  - Product/UX gain for new users.
- Warum ggf. noch nicht:
  - Does not solve runtime play gap.

### Candidate D: V2 Guardrails Hardening (CI + import guards)
- Nutzen:
  - Prevents fallback into legacy adapter paths; protects recent migration value.
- Risiko:
  - Mostly technical gain; little direct end-user value.
- Abhängigkeiten:
  - Existing V2 integration tests and simple static import checks.
- Warum jetzt:
  - Useful as a bounded prerequisite.
- Warum ggf. noch nicht:
  - Should not replace a product-facing phase.

### Candidate E: Collaboration Foundation (accounts/campaign/revisions)
- Nutzen:
  - Opens long-term parity axis (sharing, permissions, audit).
- Risiko:
  - Large product/backend scope jump from current local-first app.
- Abhängigkeiten:
  - Auth, backend model, sync protocol, permission system.
- Warum jetzt:
  - Strategically relevant later.
- Warum ggf. noch nicht:
  - Too large for next single phase; high derailment risk.

## 8. Question for the Research Model
Given the current implementation (V2 core in production paths, deterministic resolver stack, still no full play-state runtime), which next phase is strategically strongest **now** to maximize product value while avoiding another architecture loop?

Please decide:
1. Which single next step should be executed first.
2. In which order the next 1-3 phases should follow.
3. Which areas should be explicit non-goals for that first phase.

## 9. Requested Output From the Research Model
Please return:
- A clear recommendation for the **single next phase**.
- Short rationale tied to current-state constraints (not idealized full parity).
- Risks and non-goals for that phase.
- A concrete **Codex prompt** for implementing exactly that phase in this repository, including:
  - objective,
  - scope boundaries,
  - files/modules likely touched,
  - validation checklist/tests,
  - explicit “do not do” list to prevent scope creep.

Suggested baseline direction to challenge/confirm: prioritize **Candidate A (Stateful Play Loop V1)**, optionally preceded by a small bounded subset of Candidate D guardrails.
