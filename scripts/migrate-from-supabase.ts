#!/usr/bin/env npx tsx
/**
 * One-time export of models (all versions + autosave) and API token hashes
 * from Supabase into the local Obliq store (~/.config/obliq-2 or $OBLIQ_HOME).
 *
 * Usage:
 *   npx tsx scripts/migrate-from-supabase.ts [--user <email|uuid>] [--dry-run] [--home <dir>]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Idempotent: models whose id already exists locally, and tokens whose hash
 * already exists, are skipped. Version 0 (old autosave) becomes autosave.json.
 * Token hashes carry over unchanged, so existing MCP/automation tokens keep working.
 * WASM cache and metrics are not migrated (they rebuild on demand).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { openStorage } from '../src/lib/server/storage'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined
}

const dryRun = process.argv.includes('--dry-run')
const userArg = arg('--user')
const home = arg('--home')
const PAGE = 1000

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message || String(error))
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

async function resolveUserId(supabase: SupabaseClient): Promise<string | null> {
  const owners = new Set(
    (await fetchAll<{ user_id: string }>((a, b) => supabase.from('models').select('user_id').range(a, b))).map(r => r.user_id)
  )
  if (userArg && /^[0-9a-f-]{36}$/i.test(userArg)) return userArg
  if (userArg) {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (error) throw error
    const match = data.users.find(u => u.email?.toLowerCase() === userArg.toLowerCase())
    if (!match) throw new Error(`No Supabase user with email ${userArg}`)
    return match.id
  }
  if (owners.size > 1) {
    throw new Error(`Models belong to ${owners.size} users; pass --user <email|uuid> to choose one.`)
  }
  return [...owners][0] ?? null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const userId = await resolveUserId(supabase)
  if (!userId) {
    console.log('No models found in Supabase; nothing to migrate.')
    return
  }

  const storage = openStorage(home ?? undefined)
  console.log(`${dryRun ? '[dry run] ' : ''}Migrating Supabase user ${userId} → ${storage.paths.home}`)

  const models = await fetchAll<any>((a, b) =>
    supabase.from('models').select('*').eq('user_id', userId).order('created_at').range(a, b)
  )

  let imported = 0
  let skipped = 0
  for (const model of models) {
    if (storage.models.get(model.id)) {
      console.log(`  skip  ${model.name} (${model.id}) — already present`)
      skipped++
      continue
    }
    const rows = await fetchAll<any>((a, b) =>
      supabase.from('model_versions').select('version, data, created_at').eq('model_id', model.id).order('version').range(a, b)
    )
    const autosaveRow = rows.find(r => r.version === 0)
    let versions = rows
      .filter(r => r.version > 0)
      .map(r => ({ version: r.version as number, data: r.data, createdAt: r.created_at as string }))
    let autosave = autosaveRow ? { data: autosaveRow.data, savedAt: autosaveRow.created_at as string } : null

    if (versions.length === 0) {
      if (!autosave) {
        console.warn(`  WARN  ${model.name} (${model.id}) has no versions; skipped`)
        skipped++
        continue
      }
      // Never explicitly saved: promote the autosave to version 1.
      versions = [{ version: 1, data: autosave.data, createdAt: autosave.savedAt }]
      autosave = null
    }

    const sizeKb = Math.round(JSON.stringify(versions).length / 1024)
    console.log(
      `  ${dryRun ? 'would import' : 'import'}  ${model.name} (${model.id}): ` +
        `${versions.length} version(s)${autosave ? ' + autosave' : ''}, ~${sizeKb} KB`
    )
    if (!dryRun) {
      storage.models.importModel({
        id: model.id,
        name: model.name,
        createdAt: model.created_at,
        updatedAt: model.updated_at,
        versions,
        autosave,
      })
    }
    imported++
  }

  let tokensImported = 0
  const { data: tokenRows, error: tokenError } = await supabase
    .from('api_tokens')
    .select('name, token_hash, expires_at')
    .eq('user_id', userId)
  if (tokenError) {
    console.warn(`  WARN  could not read api_tokens: ${tokenError.message}`)
  }
  for (const t of tokenRows ?? []) {
    if (storage.tokens.findByHash(t.token_hash)) continue
    const taken = storage.tokens.list().some(existing => existing.name === t.name)
    const name = taken ? `${t.name} (migrated)` : t.name
    console.log(`  ${dryRun ? 'would import' : 'import'}  token "${name}"`)
    if (!dryRun) storage.tokens.create({ name, tokenHash: t.token_hash, expiresAt: t.expires_at })
    tokensImported++
  }

  storage.db.close()
  console.log(
    `${dryRun ? '[dry run] ' : ''}Done: ${imported} model(s) ${dryRun ? 'to import' : 'imported'}, ` +
      `${skipped} skipped, ${tokensImported} token(s).`
  )
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
