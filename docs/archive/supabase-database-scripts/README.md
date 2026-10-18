# Database scripts

SQL applied **once** against a fresh Supabase Postgres database to create the tables and policies that obliq-2 expects.

These scripts are **not** run automatically by Docker or by `npm install`. Apply them after Supabase is healthy (Studio or `psql`).

## Apply order (required)

Run in this order. Later scripts depend on earlier tables.

| Order | File | Purpose |
|------:|------|---------|
| 1 | [`setup.sql`](./setup.sql) | `models` table + RLS + `updated_at` trigger |
| 2 | [`versioning.sql`](./versioning.sql) | `model_versions`, drops `models.data`, adds `latest_version` |
| 3 | [`03-API-tokens.sql`](./03-API-tokens.sql) | Per-user API tokens (`api_tokens`) for Model Builder / automations |
| 4 | [`04-wasm-cache.sql`](./04-wasm-cache.sql) | WASM compile cache metadata + metrics tables |
| 5 | [`05-wasm-storage-bucket.sql`](./05-wasm-storage-bucket.sql) | Storage bucket `wasm-cache` + policies |

Optional reading (no DDL): [`migration-2025-12-01-model-parameters.md`](./migration-2025-12-01-model-parameters.md) — model parameters live in JSONB `model_versions.data`, not extra columns.

## How to apply

### A. Supabase Studio (easiest)

1. Open Studio: `http://localhost:8000` (self-hosted Docker) or your project dashboard.
2. Sign in with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` from the Supabase project `.env`.
3. Open **SQL Editor** → paste each file’s contents in order → **Run**.

### B. `psql` via Docker (self-hosted)

From your Supabase project directory (e.g. `~/src/supabase-project`):

```bash
# Resolve path to this repo’s database-scripts
SCRIPTS="/path/to/obliq-2/database-scripts"

for f in setup.sql versioning.sql 03-API-tokens.sql 04-wasm-cache.sql 05-wasm-storage-bucket.sql; do
  echo "=== Applying $f ==="
  docker compose exec -T db psql -U postgres -d postgres < "$SCRIPTS/$f"
done
```

If the Postgres service is not named `db`, use:

```bash
docker compose ps
# then: docker compose exec -T <service> psql -U postgres -d postgres < ...
```

Direct host port (if exposed through Supavisor/session pooler — see Supabase self-hosting docs):

```bash
export PGPASSWORD='<POSTGRES_PASSWORD from supabase-project .env>'
psql "postgres://postgres.<POOLER_TENANT_ID>@localhost:5432/postgres" \
  -f /path/to/obliq-2/database-scripts/setup.sql
# ... remaining files in order
```

### C. Hosted Supabase

Dashboard → **SQL Editor** → run the five files in order (same as Studio).

## Expected schema after apply

| Table / object | Notes |
|----------------|--------|
| `public.models` | Metadata only: `id`, `user_id`, `name`, `latest_version`, timestamps |
| `public.model_versions` | `model_id`, `version` (0 = auto-save), `data` JSONB |
| `public.api_tokens` | Hashed user API keys |
| `public.wasm_cache_metadata` | Compiled WASM cache index |
| `public.wasm_compilation_metrics` | Compile analytics |
| `public.wasm_simulation_metrics` | Sim performance metrics |
| Storage bucket `wasm-cache` | Binary cache files (private) |

Version numbers: **positive** versions are user saves; **version 0** is auto-save (see app recovery dialog).

## Re-running scripts

Scripts use plain `CREATE TABLE` / `CREATE POLICY` (not fully idempotent). On a dirty database they may error with “already exists”. Prefer:

- Fresh volume / new project, or
- Drop and recreate only the objects you need (careful: data loss).

## Loading sample models

Sample JSON under `docs/sample-models/` is **not** auto-seeded into Postgres. Prefer the app UI: **My Models → Import** (accepts export JSON and Saturn fixtures). See the main [README](../README.md#loading-sample-models-import).