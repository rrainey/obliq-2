# Migrating off Supabase: SQLite + flat-file storage

Status: all phases are done on branch `sqlite-storage`. Decisions recorded 2026-10-18.

## Decisions

| Topic | Decision |
|---|---|
| Auth model | Single local user. The app runs on `127.0.0.1` as the OS user. There is no login page. Hashed API tokens stay in SQLite for MCP, automations and scripts. |
| Model files | Managed models live at `~/.config/obliq-2/models/<id>/model.json`. A model can also be **linked** to an external path; the DB records the path, hash and mtime. |
| Versioning | `model.json` is always current. An explicit Save also writes `versions/vNNNN.json` and a DB row. Autosave is written to `autosave.json`. There is no version 0. |
| API/MCP mutations | Mutations write `model.json` in place (atomically). A snapshot is taken only on Save or when the call passes `checkpoint: true`. |
| File format | Wrapper `{ "name": ..., "data": { ...ModelData } }`, written as 2-space JSON with a trailing newline. A linked file that is bare ModelData keeps its bare shape. |
| Conflicts | When the file changes on disk: reload silently if there are no unsaved edits. Otherwise show a banner with Reload / Keep mine / Save mine as new version. Save sends `baseHash`, and the server returns 409 on a mismatch. |
| Supabase | Removed entirely. The only Supabase code left is a one-time export script. |
| External edits | When an external change is detected, it is recorded as a version with `note = 'external'`. |
| Retention | Keep all snapshots. Pruning is manual. |

## Layout

```
~/.config/obliq-2/                 # $OBLIQ_HOME overrides; honors $XDG_CONFIG_HOME
  obliq.db                         # SQLite (WAL)
  local-secret                     # 0600, signs the browser session cookie
  models/<uuid>/
    model.json                     # managed models only
    autosave.json
    versions/v0001.json ...
  cache/wasm/<cacheKey>/{module.wasm, module.js}
```

## Schema (see `src/lib/server/storage/db.ts`)

- `models(id, name, storage_kind, file_path, file_format, file_hash, file_mtime_ms, latest_version, autosave_at, created_at, updated_at)`
- `model_versions(model_id, version, content_hash, size_bytes, note, created_at)`
- `api_tokens(id, name, token_hash, created_at, expires_at, last_used_at)`
- `wasm_cache`, `wasm_compilation_metrics`, `wasm_simulation_metrics`
- Migrations are tracked with `PRAGMA user_version`.

## Phases

1. **Storage core** (done): `src/lib/server/storage/` holds paths, db, fileIO, ModelRepository and TokenRepository; `FileCacheManager` replaces `SupabaseCacheManager`. Unit tests run against a temporary `OBLIQ_HOME`.
2. **Server consumers** (done): model-builder handlers (`ctx.storage`), generate-code, compile-wasm(-stream), automations, ServerWasmExecutor, tokens, cache-maintenance.
3. **`/api/models` REST layer** (done): `src/lib/modelApi.ts` replaces every browser-side `supabase.from(...)` in modelStore, `models/page.tsx` and `models/[id]/page.tsx`.
4. **Auth replacement** (done): local session cookie, Host-header check, `AuthProvider` shim, removal of the login page, bind to 127.0.0.1.
5. **Linked files and change detection** (done): `src/lib/server/modelWatcher.ts` watches directories, not files, so atomic renames are seen. `GET /api/models/:id/events` streams the file status over SSE, and the client hook `useModelFileStatus` also re-checks on window focus. In the editor (`ExternalChangeBanner`), a clean editor reloads silently; a dirty one gets Reload / Keep mine / Save as new. The editor compares the disk hash with the hash it loaded, so edits made through the Model Builder API or MCP are also caught. My Models has Link File, Copy into Obliq storage, and a "missing" badge; the command-line equivalent is `npm run obliq:link`.
6. **Migration script** (done): `scripts/migrate-from-supabase.ts` (`--dry-run`, idempotent).
7. **Removal** (done; `@supabase/supabase-js` stays as a devDependency for the migration script only): `@supabase/*` packages, env vars, `database-scripts/` moved to `docs/archive`, README updates.
