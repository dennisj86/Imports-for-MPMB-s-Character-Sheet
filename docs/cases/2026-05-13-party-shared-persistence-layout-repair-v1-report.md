# Party Shared Session Persistence Repair + Full Width Layout V1 Report

Date: 2026-05-13  
Case: `party-shared-persistence-layout-repair-v1`

## Implemented

### Server-Authoritative Shared Mode
- `shared-server` no longer pushes local state when selected.
- Party route defaults toward shared mode when opened under `/party/...`.
- Shared load hydrates from server data first.
- Empty local/default state is not silently written to the server.
- If shared storage is empty while local characters exist, the UI shows a conflict choice instead of pushing.
- If server and local membership differ, server data is loaded and a merge/local choice is shown.

### Destructive Save Protection
- Shared `saveParty` checks the current server party before saving.
- Saves that would remove existing server members are blocked behind a conflict prompt.
- Conflict options:
  - Cancel
  - Merge local into shared
  - Replace shared party
- Default shared saves use `merge`.

### Auto-Save / Reload Reliability
- Character creation in shared mode persists through `saveParty` with merge semantics.
- Character updates continue to auto-save through the active party runtime.
- Auto-save errors are surfaced in Party UI instead of being swallowed silently.

### Server Persistence Hardening
- `scripts/party-server.mjs` now:
  - creates `data/party-sessions` at startup
  - uses temp-file + rename writes
  - keeps a previous `.bak.json` when replacing an existing party file
  - returns API errors for invalid persisted JSON
  - merges party saves by default
  - only replaces shared state when explicitly requested

### Blank Page / Sync Safety
- Added a Party-level render fallback around the sheet content.
- Party UI now shows:
  - load failed
  - save failed
  - sync disconnected
  - retry
  - diagnostics/details for render failures
- SSE disconnects are represented as sync errors.
- Stale party updates and unsafe empty party overwrites are ignored.

### Full Width Party Layout
- Party routes bypass the centered `max-w-7xl` main container.
- Party mode uses:
  - left Party Rail: `280px`
  - center Sheet Main: flexible
  - right Roll Dock: `340px`
- Party Rail, Sheet Main and Roll Dock have independent scroll areas.
- Roll Dock uses full available height in Party mode.

### Party Tile Polish
- Tiles are compact and fixed-height.
- Portrait fallback uses the character initial.
- Active character remains clearly marked via `aria-current` and focus/ring styling.
- Missing portrait/background no longer changes tile dimensions.

## Tests Added

Added `src/tests/party-shared-persistence-layout-repair-v1.test.ts` covering:
1. shared-server loads server data without first pushing local state
2. shared saves default to `strategy=merge`
3. destructive saves are detected
4. merge preserves existing server members
5. stale/empty sync updates are ignored
6. Party routes use full-width layout
7. Party Rail, Sheet Main and Roll Dock are represented as three columns
8. conflict/status UI exists
9. tiles use stable compact sizing
10. server persistence source uses temp writes, backup and merge behavior

## Validation

Full validation listed in final response.

## Non-Goals Kept

- No auth or permissions
- No cloud sync
- No DM, monster or encounter tooling
- No complex conflict merge engine
- No new rule engine
- No MPMB hook execution
