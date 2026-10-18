#!/usr/bin/env tsx
/**
 * Register external model files with the local Obliq store, without the app running.
 *
 * Usage:
 *   npm run obliq:link -- <model.json> [--name "Display name"]   link a file in place
 *   npm run obliq:link -- --list                                 list models
 *   npm run obliq:link -- --unlink <modelId>                     copy a linked model into Obliq storage
 *
 * A linked file stays where it is. The app reads and saves it in place, in the
 * shape it already has ({name, data} or bare ModelData), and keeps versions
 * and autosave under ~/.config/obliq-2/models/<id>/. Linking the same path
 * twice returns the existing model. Honors $OBLIQ_HOME.
 */

import { openStorage } from '../src/lib/server/storage'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined
}

function usage(): never {
  console.error('Usage: npm run obliq:link -- <model.json> [--name <name>] | --list | --unlink <modelId>')
  process.exit(1)
}

const appUrl = process.env.OBLIQ_APP_URL || 'http://localhost:3000'
const storage = openStorage()

try {
  if (process.argv.includes('--list')) {
    for (const m of storage.models.list()) {
      const where = m.storage_kind === 'linked' ? m.file_path : storage.paths.managedModelFile(m.id)
      console.log(`${m.id}  ${m.storage_kind.padEnd(7)}  v${String(m.latest_version).padEnd(3)}  ${m.name}\n    ${where}`)
    }
  } else if (arg('--unlink')) {
    const record = storage.models.unlink(arg('--unlink')!)
    console.log(`"${record.name}" is now stored at ${storage.paths.managedModelFile(record.id)}`)
  } else {
    const args = process.argv.slice(2)
    const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--name')
    if (!file) usage()
    const existing = storage.models.findByFilePath(file)
    const record = storage.models.link(file, { name: arg('--name') })
    console.log(`${existing ? 'Already linked' : 'Linked'}: "${record.name}" (${record.id})`)
    console.log(`  file:   ${record.file_path} [${record.file_format}]`)
    console.log(`  editor: ${appUrl}/models/${record.id}`)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  storage.db.close()
}
