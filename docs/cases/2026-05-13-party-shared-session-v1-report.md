# Party Shared Session V1 Report

Date: 2026-05-13  
Case: `party-shared-session-v1`

## Implemented

### Scope A: Party Shell UI
- Added Party routes:
  - `/party/:partyId`
  - `/party/:partyId/characters/:characterId`
- Added `PartyShell` with a party sidebar and character tiles.
- Tiles show:
  - portrait/background when configured
  - name
  - class + level
  - HP/temp HP
  - AC
  - conditions
  - concentration status
- Clicking a tile opens the corresponding character sheet route.

### Scope B: Character Portrait / Background
- Extended `CharacterDraft` with optional:
  - `portraitUrl`
  - `portraitData`
  - `backgroundImageUrl`
  - `backgroundImageData`
  - `themeColor`
- Added sheet UI controls for URL, upload, color, and clearing images.
- Persisted all fields through the existing character JSON format.

### Scope C: Shared Party State
- Added `PartyState` and `PartyBundle` domain models.
- Added party metadata:
  - `partyId`
  - `partyName`
  - `characterIds`
  - `version`
  - `updatedAt`
- Existing character store remains the integration point for Builder/Sheet compatibility.

### Scope D: Local Network Shared Storage
- Added `PartyStorageAdapter` with:
  - `local-only`
  - `shared-server`
- Implemented storage methods:
  - load/save party
  - list/load/save character
  - update character playState
  - subscribe to sync events
- Added local-only fallback via localStorage.
- Added shared-server API in `scripts/party-server.mjs`.
- Server persists party JSON files in `data/party-sessions` by default.

### Scope E/F: Live Sync and Multi-Tab Safety
- Implemented SSE sync for shared-server mode.
- Implemented local BroadcastChannel/custom event sync for local tabs.
- Character updates bump `syncVersion` and `updatedAt`.
- Last-write-wins is used.
- Remote updates upsert only the affected character, so Character A updates do not replace Character B.

### Scope G: Party Buff Targeting
- Extended Active Buff targeting UI with `self` and party allies.
- In shared-server mode, ally buffs are written directly to the target character playState.
- In local-only mode, ally targeting shows a manual fallback note.

### Scope H: LAN Usage
- Added `npm run serve`.
- It builds the app and starts the local party server.
- Server prints localhost and LAN URLs.
- Players open the LAN URL and use `/party/default`.
- No auth, no cloud, no Git writes.

### Scope I: Import / Export
- Party Shell supports importing character/party JSON.
- Party Shell supports exporting Party JSON.
- Existing local characters seed a new party when no party file exists yet.

## LAN Start

Run:

```bash
npm run serve
```

The server prints URLs like:

```text
Party server listening on http://localhost:4173
LAN: http://192.168.x.y:4173
```

Open:

```text
http://192.168.x.y:4173/party/default
```

Set storage mode to `shared-server` in the Party panel. Other clients on the LAN use the same URL.

## Tests

Added `src/tests/party-shared-session-v1.test.ts` covering:
1. Party Shell routes and tile source wiring
2. Character tile HP/class data
3. local/server storage interface modes
4. party load/save in local mode
5. character update version/updatedAt behavior
6. scoped character update behavior
7. local tab sync listener
8. playState-only update path
9. portrait/background UI source wiring
10. ally buff targeting source wiring
11. import/export UI source wiring

## Validation

- `node --check scripts/party-server.mjs` ✅
- `npm run test -- --run src/tests/party-shared-session-v1.test.ts` ✅
- Full validation listed in final response.

## Non-Goals Kept

- No DM tool
- No monster/encounter/enemy targeting
- No auth/permissions
- No cloud sync
- No complex conflict merge
- No Git writes from browser
- No new rule engine
- No MPMB hook execution
