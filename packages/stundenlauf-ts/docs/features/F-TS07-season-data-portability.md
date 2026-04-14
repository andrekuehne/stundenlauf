# F-TS07: Season Data Portability (JSON/ZIP Export and Import)

## Overview

- Feature ID: F-TS07
- Feature name: Season data portability — export and import of season archives
- Owner: —
- Status: Done
- Related requirement(s): R7 (portable data with browser-local storage and file-based import/export)
- Related milestone(s): M-TS6
- Python predecessor(s): F12 (season import/export), `backend/ui_api/workspace.py` (`export_series_year`, `import_series_year`)

## Problem Statement

Season data lives in IndexedDB — invisible to the user and tied to the browser profile. Without explicit export/import, users cannot:

- **Back up** a season before risky operations (bulk import, corrections).
- **Transfer** a season to a different machine or browser.
- **Archive** completed seasons outside the browser's storage.
- **Restore** a season after clearing browser data or switching browsers.

The Python version solves this by exporting the `session_project.json` snapshot into a ZIP alongside a manifest. The TS port stores an event log rather than a snapshot, so the archive format and validation logic must be designed from scratch around the event-sourced data model defined in F-TS01.

Additionally, the TS port runs entirely in the browser — there are no filesystem dialogs. Export produces a browser download; import accepts a file upload via the File API.

## Scope

### In Scope

- Define the **season archive format** (ZIP containing manifest + event log JSON).
- **Export** a season from IndexedDB to a downloadable `.stundenlauf-season.zip` file.
- **Import** a season archive via browser file upload, with validation and conflict handling.
- **Manifest** with integrity metadata: format version, schema version, checksum, event count, season identity, timestamps.
- **SHA-256 integrity check** of the event log payload on import.
- **Conflict resolution** when importing into a workspace that already contains a season with the same `season_id` or `label`.
- **Atomic import** — import either fully succeeds or leaves existing data unchanged.
- **Client-side ZIP creation and reading** using a browser-compatible library (JSZip).
- Framework-agnostic export/import functions (pure TS + browser APIs).

### Out of Scope

- Multi-season bundle export/import in a single file.
- Cloud sync, remote sharing, or merge of divergent event logs.
- Cross-format migration: importing a Python-format `.stundenlauf-season.zip` (different data model; a migration utility could be a future feature).
- PDF/CSV standings export (F-TS08).
- IndexedDB storage internals (F-TS01 covers the storage adapter).
- UI components for the export/import workflow (F-TS06 covers the season entry screen where these actions are triggered).
- Snapshot export — the archive always contains the event log, not a projected snapshot. Snapshots are ephemeral caches that can be rebuilt.
- PWA offline caching of archives (F-TS09).

## Acceptance Criteria

- [x] `exportSeason(seasonId)` produces a valid `.stundenlauf-season.zip` containing exactly `manifest.json` and `eventlog.json`, triggering a browser download.
- [x] The exported `eventlog.json` matches the JSON format defined in F-TS01 Section 7 (`format`, `format_version`, `season_id`, `label`, `events`).
- [x] The manifest contains: `format_version`, `exported_at`, `app_version`, `eventlog_format_version`, `season_id`, `label`, `events_total`, `last_event_seq`, `sha256_eventlog`.
- [x] `importSeason(file)` validates: ZIP structure (exactly two expected files), manifest schema, `format_version` compatibility, `eventlog_format_version` compatibility, SHA-256 integrity, event log JSON parsability, and `season_id` / `label` presence.
- [x] Import with no conflicting season in the workspace succeeds and the season appears in the workspace registry immediately.
- [x] Import where the `season_id` already exists in the workspace is rejected by default, with a clear error indicating the conflict.
- [x] Import with `replace_existing: true` and `confirm_season_id` matching the target replaces the existing season's event log atomically.
- [x] Import into a different season slot (new `season_id` + custom `label`) is supported via an override option.
- [x] Failed import never leaves partial data — the existing season (if any) is unchanged, and no orphaned IndexedDB entries are created.
- [x] A round-trip test (export → import into empty workspace → replay → compare projected state) produces identical `SeasonState` for all tested scenarios.
- [x] Unknown `format_version` or `eventlog_format_version` in the manifest produces an explicit, actionable error (not a silent failure).
- [x] All export/import functions are framework-agnostic (pure TS, no React/Zustand imports).
- [x] ZIP entries at non-root paths or unexpected filenames are rejected (zip-slip / path-traversal mitigation).

---

## Technical Plan

### 1. Archive Format

The season archive is a ZIP file (`.stundenlauf-season.zip`) containing exactly two entries at the archive root:

```
manifest.json
eventlog.json
```

No subdirectories. No additional files. Import rejects any ZIP whose entry set does not exactly match `{"manifest.json", "eventlog.json"}`.

#### `eventlog.json`

The event log in the format defined by F-TS01 Section 7:

```json
{
  "format": "stundenlauf-ts-eventlog",
  "format_version": 1,
  "season_id": "550e8400-e29b-41d4-a716-446655440000",
  "label": "Stundenlauf 2025",
  "events": [
    { "event_id": "...", "seq": 0, ... },
    ...
  ]
}
```

This is the serialized event log as it exists in IndexedDB — every event, in `seq` order, with full payloads and metadata. No snapshots, no derived state. The importing app rebuilds `SeasonState` by replaying the log.

#### `manifest.json`

```json
{
  "format": "stundenlauf-ts-season-archive",
  "format_version": 1,
  "exported_at": "2025-09-15T14:30:00Z",
  "app_version": "1.2.0",
  "eventlog_format_version": 1,
  "season_id": "550e8400-e29b-41d4-a716-446655440000",
  "label": "Stundenlauf 2025",
  "events_total": 347,
  "last_event_seq": 346,
  "sha256_eventlog": "a1b2c3d4e5f6..."
}
```

| Field | Type | Purpose |
|---|---|---|
| `format` | `string` | Archive format discriminator. Always `"stundenlauf-ts-season-archive"`. |
| `format_version` | `number` | Version of the archive format itself (manifest schema, ZIP layout). Currently `1`. |
| `exported_at` | `string` | ISO 8601 UTC timestamp of export. Informational. |
| `app_version` | `string` | Version of the app that produced this archive. Informational, aids debugging. |
| `eventlog_format_version` | `number` | Version of the event log format inside `eventlog.json`. Must match the `format_version` field within `eventlog.json`. |
| `season_id` | `string` | UUID of the exported season. |
| `label` | `string` | Human-readable season label at time of export. |
| `events_total` | `number` | Count of events in the log. Quick sanity check without parsing the full log. |
| `last_event_seq` | `number` | Highest `seq` value in the log, or `-1` for an empty log. |
| `sha256_eventlog` | `string` | Lowercase hex SHA-256 of the raw `eventlog.json` bytes in the ZIP. |

**Differences from Python manifest:**

| Python field | TS field | Change |
|---|---|---|
| `schema_version` (of ProjectDocument) | `eventlog_format_version` | Different data model; refers to event log format, not snapshot schema. |
| `series_year` | `season_id` + `label` | Seasons are uuid + label, not year-keyed (F-TS01 Section 3). |
| `sha256_session_project` | `sha256_eventlog` | Checksums the event log, not the snapshot document. |
| — | `format` | Added: explicit archive format discriminator for forward compatibility. |
| — | `last_event_seq` | Added: enables quick staleness checks without parsing the full log. |

### 2. Export Workflow

```
exportSeason(seasonId: string): Promise<void>
```

1. **Load event log** from IndexedDB via the F-TS01 storage adapter.
2. **Serialize** the event log to JSON bytes using the F-TS01 JSON format.
3. **Compute SHA-256** of the serialized bytes using `crypto.subtle.digest`.
4. **Build manifest** from season metadata + event count + checksum.
5. **Create ZIP** using JSZip: add `manifest.json` (UTF-8 JSON, formatted) and `eventlog.json` (UTF-8 JSON, compact) as root entries with deflate compression.
6. **Generate blob** from JSZip's `generateAsync({ type: "blob" })`.
7. **Trigger download** via `URL.createObjectURL(blob)` + programmatic `<a download="...">` click.

**Filename convention:** `stundenlauf-{sanitized_label}.stundenlauf-season.zip`. The label is sanitized for filesystem safety (replace non-alphanumeric/non-hyphen characters with hyphens, collapse runs, trim).

**JSON formatting:** `manifest.json` is pretty-printed (`JSON.stringify(manifest, null, 2)`) for human inspectability. `eventlog.json` is compact (`JSON.stringify(eventlog)`) to minimize file size — the event log can be large.

### 3. Import Workflow

```
importSeason(
  file: File,
  options?: {
    targetSeasonId?: string;
    targetLabel?: string;
    replaceExisting?: boolean;
    confirmSeasonId?: string;
  }
): Promise<ImportSeasonResult>
```

**Phase 1 — Structural validation:**

1. Read the file as `ArrayBuffer` via `file.arrayBuffer()`.
2. Open with JSZip. Reject if not a valid ZIP.
3. Verify entry set is exactly `{"manifest.json", "eventlog.json"}`. Reject entries with path separators or unexpected names (zip-slip mitigation).
4. Extract both entries as UTF-8 strings.

**Phase 2 — Manifest validation:**

1. Parse `manifest.json` as JSON. Must be an object.
2. Validate `format` === `"stundenlauf-ts-season-archive"`. Reject unknown formats.
3. Validate `format_version` === `1`. Reject unsupported versions with actionable error ("update the app" or "export from a compatible version").
4. Validate required fields: `season_id` (non-empty string), `label` (non-empty string), `eventlog_format_version` (number), `events_total` (non-negative integer), `last_event_seq` (integer ≥ -1), `sha256_eventlog` (non-empty hex string).

**Phase 3 — Integrity check:**

1. Compute SHA-256 of the raw `eventlog.json` bytes (before JSON parsing).
2. Compare case-insensitively with `manifest.sha256_eventlog`. Reject on mismatch.

**Phase 4 — Event log validation:**

1. Parse `eventlog.json` as JSON. Must be an object.
2. Validate `format` === `"stundenlauf-ts-eventlog"`.
3. Validate `format_version` matches `manifest.eventlog_format_version`.
4. Validate `season_id` matches `manifest.season_id`.
5. Validate `events` is an array with length === `manifest.events_total`.
6. If the event log is non-empty, validate `events[events.length - 1].seq` === `manifest.last_event_seq`.
7. **Do not replay the full event log at import time** — projection is deferred to when the season is opened. This keeps import fast for large logs. (Exception: if validation strictness is configured, an optional full-replay validation pass can be added later.)

**Phase 5 — Conflict resolution:**

Determine the target season identity:

- If `targetSeasonId` and `targetLabel` are provided, use those (import as a new/different season slot).
- Otherwise, use `manifest.season_id` and `manifest.label`.

Check the workspace registry for a season with the target `season_id`:

- **No conflict:** proceed to write.
- **Conflict, `replaceExisting` is false or absent:** reject with error: "Season '{label}' already exists. Use replace mode or import as a new season."
- **Conflict, `replaceExisting` is true:** require `confirmSeasonId === targetSeasonId`. If mismatch or absent, reject. If confirmed, proceed to replace.

**Phase 6 — Atomic write:**

1. Open an IndexedDB transaction spanning both the workspace registry store and the season event store.
2. If replacing, delete the existing season's event log entries.
3. Write the imported event log entries to the season's event store.
4. Upsert the season descriptor in the workspace registry (update label and `created_at` for replace; insert for new).
5. Commit the transaction. If any step fails, the transaction rolls back automatically (IndexedDB transaction atomicity).

**Return value:**

```typescript
interface ImportSeasonResult {
  season_id: string;
  label: string;
  events_imported: number;
  replaced_existing: boolean;
}
```

### 4. Differences from Python Import/Export

| Aspect | Python | TS Port |
|---|---|---|
| Archive payload | `session_project.json` (ProjectDocument snapshot) | `eventlog.json` (event log) |
| Season identity | `series_year` (integer) | `season_id` (uuid) + `label` (string) |
| Manifest discriminator | None (implicit from file extension) | `format: "stundenlauf-ts-season-archive"` |
| Manifest schema ref | `schema_version` (of ProjectDocument, currently 2) | `eventlog_format_version` (of event log format) |
| Checksum target | SHA-256 of `session_project.json` bytes | SHA-256 of `eventlog.json` bytes |
| File I/O | Filesystem paths, `pick_file` / `pick_save_file` dialogs | Browser File API upload, blob download |
| Atomic write | Temp file + rename + `.bak` recovery | IndexedDB transaction atomicity |
| Conflict key | `series_year` (integer equality) | `season_id` (uuid equality) |
| Replay on import | Implicit: `JsonProjectRepository.load()` deserializes + migrates | Deferred: event log stored as-is, replayed when season is opened |
| Migration on import | Rejects if `schema_version ≠ 2` (no migration) | Rejects if `eventlog_format_version` is unsupported |
| Replace confirmation | `confirm_replace_series_year` (typed integer) | `confirmSeasonId` (typed uuid) |
| Import-as-different | `target_series_year` override | `targetSeasonId` + `targetLabel` override |

### 5. Client-Side ZIP Library

**JSZip** is the standard client-side ZIP library. It supports:

- Creating ZIPs with deflate compression.
- Reading ZIPs from `ArrayBuffer`.
- Extracting individual entries as strings, `ArrayBuffer`, or `Uint8Array`.
- No Node.js dependencies; works in all target browsers.

Alternative: `fflate` (lighter, faster, no legacy code). Either works; JSZip has more community adoption and documentation.

The choice is deferred to implementation, but the feature design is library-agnostic — only two ZIP operations are needed (create with two entries; read and extract two entries).

### 6. SHA-256 in the Browser

Use the Web Crypto API:

```typescript
async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
```

Available in all target browsers. No polyfill needed.

### 7. Download Trigger

Export triggers a browser download without a filesystem dialog:

```typescript
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

This is the only DOM-touching code in the feature. All other logic is pure.

### 8. Module Structure

```
src/
  portability/
    types.ts                # SeasonArchiveManifest, ImportSeasonOptions, ImportSeasonResult
    export-season.ts        # exportSeason(): load → serialize → checksum → zip → download
    import-season.ts        # importSeason(): upload → unzip → validate → conflict-check → write
    manifest.ts             # buildManifest(), validateManifest()
    integrity.ts            # sha256Hex(), verifyChecksum()
    sanitize.ts             # sanitizeFilename()
    constants.ts            # ARCHIVE_FORMAT, ARCHIVE_FORMAT_VERSION, etc.
```

All exports are pure async functions (except `triggerDownload` which touches the DOM). No framework dependencies.

### 9. Interaction with Other Features

| Feature | Interaction |
|---|---|
| **F-TS01** (event architecture) | Export reads the event log via `getEventLog(seasonId)` (F-TS01 Section 7 storage adapter). Import writes events via `writeEventLog(seasonId, label, events)`. The event log JSON format is defined by F-TS01. |
| **F-TS01** (workspace operations) | Import calls workspace-level "create season" or "replace season" operations. Export reads the workspace registry to resolve `season_id` → event log. |
| **F-TS06** (UI shell) | The season entry screen provides the export button (per season row) and the import button + conflict resolution dialog. This feature provides the domain functions; F-TS06 provides the UI. |
| **F-TS09** (PWA) | A PWA service worker does not cache exported archives. Export/import require an active page. |

---

## Mapping from Python Implementation

### Python approach

- `workspace.py` (`export_series_year`): reads `session_project.json` as raw bytes, computes SHA-256, builds manifest, writes both into a ZIP using Python's `zipfile` module. Destination is a filesystem path (default: `workspace_dir/data/exports/`).
- `workspace.py` (`import_series_year`): opens ZIP, validates exact two-file entry set, parses manifest, checks `format_version` (1) and `schema_version` (2), verifies SHA-256, resolves target year with conflict handling (`replace_existing` + `confirm_replace_series_year`), writes atomically via temp file + rename with `.bak` recovery.
- Season identity is `series_year` (integer). Conflict resolution is year-based.
- No migration on import — `schema_version` must be exactly 2.
- The archive payload (`session_project.json`) is a full ProjectDocument snapshot with `people`, `couples`, `events`, `matching_decisions`, `standings`, `ranking_exclusions`.

### TS port differences

- **Payload is an event log, not a snapshot.** The archive contains the append-only event stream. The importing app replays it to rebuild state. This is fundamentally different: a snapshot captures one moment; an event log captures the full history.
- **Season identity is uuid + label, not year.** Conflict detection uses `season_id` (uuid), not an integer year.
- **No filesystem dialogs.** Export triggers a browser download; import accepts a File API upload.
- **No `.bak` recovery.** IndexedDB transactions provide atomicity natively — if the write fails, the transaction rolls back and nothing is changed.
- **Manifest is richer.** Includes `format` discriminator, `app_version`, `eventlog_format_version`, and `last_event_seq`. Python's `schema_version` maps to `eventlog_format_version`.
- **No `matching_decisions` in the archive.** The Python export includes `matching_decisions` as part of the ProjectDocument. In the TS port, matching decisions are not domain state — they are ephemeral workflow artifacts (F-TS01 design principle). Resolution provenance rides on `ResolutionInfo` within `race.registered` event entries.
- **No `standings` in the archive.** Python exports include a `StandingsSnapshot`. In the TS port, standings are always computed on demand from the event log (F-TS04).
- **Replay validation is deferred.** Python's import calls `JsonProjectRepository.load()` which deserializes and migrates. The TS import stores the raw event log and defers replay to when the season is opened. This keeps import fast for large logs.

### Reusable logic

- **ZIP structure validation** — exact entry set check, path-traversal rejection. Same approach, different library.
- **SHA-256 integrity check** — same algorithm, different API (`crypto.subtle` vs Python `hashlib`).
- **Conflict resolution flow** — same three-branch UX: cancel / import-as-different / replace-with-confirmation. The confirmation token changes from `series_year` (integer) to `season_id` (uuid).
- **Atomic write pattern** — same principle (all-or-nothing), different mechanism (IndexedDB transaction vs temp-file-rename).
- **Manifest structure** — similar fields with adaptations for the event-sourced model.

### Not ported

- `inspect_season_export` — the Python F12 doc mentions this as optional; it was never implemented. The TS port can add a manifest preview step if needed, but it is not in v1 scope.
- `session_project.json` format — entirely replaced by `eventlog.json`.
- Filesystem path handling, temp file cleanup, `.bak` recovery — replaced by browser-native mechanisms.

---

## Risks and Assumptions

- **Assumption:** JSZip (or fflate) can handle the expected archive sizes in the browser without memory issues. A typical season has ≤800 events (F-TS01 estimate); the JSON representation is well under 1 MB. Even a worst-case 5 000-event season would produce a JSON file under 5 MB — trivially handled.
- **Assumption:** `crypto.subtle` is available in all target browsers (it is; it's a baseline Web API since 2015).
- **Assumption:** The F-TS01 storage adapter exposes methods to read the full event log for a season and to write a complete event log atomically.
- **Risk:** A user opens an archive in a newer app version that introduced new event types, then imports it into an older app version.
  - Mitigation: The importing app checks `eventlog_format_version`. If the format version is higher than what the app supports, import is rejected with a "please update the app" message. Individual event `schema_version` handling is F-TS01's responsibility during replay.
- **Risk:** IndexedDB storage quota exhaustion during import of a large season.
  - Mitigation: Check available storage via `navigator.storage.estimate()` before import. Warn if remaining space is low. This is a UI-layer concern; the import function can expose a pre-check.
- **Risk:** Browser tab closes during import, leaving IndexedDB in a partial state.
  - Mitigation: IndexedDB transactions are atomic. If the tab closes mid-write, the transaction is aborted and nothing is committed.
- **Risk:** The checksum is computed over the serialized JSON bytes, which could differ between serializations of the same data (key order, whitespace).
  - Mitigation: The checksum is always computed over the **exact bytes stored in the ZIP**, not re-serialized data. On import, the raw bytes are extracted, checksummed, and only then parsed. On export, the bytes are serialized once, checksummed, and stored. No re-serialization ambiguity.
- **Risk:** Users may attempt to import Python-format `.stundenlauf-season.zip` archives.
  - Mitigation: The manifest `format` field distinguishes the two. Python archives lack `format: "stundenlauf-ts-season-archive"` and will be rejected with a clear error. A cross-format migration tool is a future feature, not part of v1.
- **Assumption:** The UI layer (F-TS06) handles the conflict resolution dialog. This feature provides the domain logic; the UI wires it up.

## Implementation Steps

1. **Define types** — `SeasonArchiveManifest`, `ImportSeasonOptions`, `ImportSeasonResult`, archive format constants in `types.ts` and `constants.ts`.
2. **Implement `integrity.ts`** — `sha256Hex(data: ArrayBuffer)` using Web Crypto API.
3. **Implement `sanitize.ts`** — `sanitizeFilename(label: string)` for export filename generation.
4. **Implement `manifest.ts`** — `buildManifest(...)` to construct manifest from season metadata + checksum; `validateManifest(raw: unknown)` with structural + type + version checks.
5. **Implement `export-season.ts`** — `exportSeason(seasonId)`: load events from storage → serialize → checksum → build manifest → create ZIP → trigger download.
6. **Implement `import-season.ts`** — `importSeason(file, options?)`: unzip → validate structure → validate manifest → verify checksum → parse event log → validate event log header → check conflicts → write to IndexedDB.
7. **Add JSZip dependency** — `npm install jszip` (or `fflate` if bundle size is a concern).
8. **Write unit tests** for manifest building and validation.
9. **Write unit tests** for SHA-256 computation and verification.
10. **Write unit tests** for filename sanitization.
11. **Write integration tests** for export: create season with known events → export → inspect ZIP contents → verify manifest fields and checksum.
12. **Write integration tests** for import: valid archive → import into empty workspace → verify season appears in registry and events are readable.
13. **Write import rejection tests**: bad ZIP, missing manifest, bad format version, checksum mismatch, invalid event log format, conflict without replace flag.
14. **Write round-trip test**: export → import → replay → compare projected state.
15. **Write replace-mode tests**: import over existing season with confirmation.

## Test Plan

- **Unit (integrity.ts):**
  - `sha256Hex` of a known byte string matches expected hex digest.
  - Comparison is case-insensitive.

- **Unit (sanitize.ts):**
  - Label `"Stundenlauf 2025"` → `"stundenlauf-2025"`.
  - Label with special characters → cleaned to safe filename.
  - Empty or whitespace-only label → fallback to `"season"`.

- **Unit (manifest.ts):**
  - `buildManifest` produces all required fields with correct types.
  - `validateManifest` accepts a well-formed manifest.
  - `validateManifest` rejects: missing `format`, wrong `format`, unsupported `format_version`, missing `sha256_eventlog`, `events_total` < 0, `last_event_seq` < -1, missing `season_id`, missing `label`.

- **Integration (export):**
  - Export a season with 0 events → ZIP contains manifest with `events_total: 0`, `last_event_seq: -1`, and an empty events array in `eventlog.json`.
  - Export a season with N events → ZIP contains both files, checksum matches, manifest counts are correct.
  - Downloaded filename follows the sanitized label convention.

- **Integration (import — success cases):**
  - Import into empty workspace → season appears in registry with correct `season_id` and `label`.
  - Import with `targetSeasonId` + `targetLabel` override → season stored under the override identity.
  - Import with `replaceExisting: true` + `confirmSeasonId` → existing season's events are replaced.

- **Integration (import — rejection cases):**
  - File is not a valid ZIP → error.
  - ZIP has extra files beyond manifest + eventlog → rejected.
  - ZIP has files in subdirectories → rejected.
  - `manifest.format` is wrong → rejected.
  - `manifest.format_version` is 2 (unsupported) → rejected with "update app" message.
  - SHA-256 mismatch → rejected.
  - `eventlog.json` is not valid JSON → rejected.
  - `eventlog.format` is wrong → rejected.
  - `eventlog.format_version` does not match manifest → rejected.
  - `season_id` mismatch between manifest and eventlog → rejected.
  - Conflicting `season_id` in workspace without `replaceExisting` → rejected.
  - `replaceExisting: true` but `confirmSeasonId` missing or wrong → rejected.

- **Round-trip:**
  - Create season → import several races (via F-TS05 mock or direct event append) → export → import into fresh workspace → replay both event logs → compare `SeasonState` equality.

- **Edge cases:**
  - Import a season whose events use a future `schema_version` on individual events — import succeeds (events stored as-is), but replay fails when the season is opened. Verify the error is clear and actionable.
  - Export a season, modify one byte of `eventlog.json` inside the ZIP, attempt import → checksum rejection.

## Definition of Done

- [x] Code implemented in TypeScript
- [x] Tests added/updated and passing (Vitest)
- [x] Types are strict (no `any` escapes without justification)
- [x] Docs updated
- [x] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/ui_api/workspace.py` — `export_series_year`, `import_series_year`, `list_series_years`
  - `backend/storage/repository.py` — `JsonProjectRepository` (atomic write patterns)
  - `backend/storage/schema_v2.py` — Python season document serialization (replaced by event log format)
  - `docs/features/F12-season-import-export.md` — Python feature plan
  - `tests/test_f08_ui_api.py` — Python export/import tests
- Depends on: F-TS01 (event log format, storage adapter, workspace operations)
- Depended on by: F-TS06 (season entry screen provides the UI for export/import actions)
