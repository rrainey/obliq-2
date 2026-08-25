#!/usr/bin/env npx tsx
/**
 * Deprecated location — delegates to peer package ~/src/mdl2obliq.
 * Prefer: npm run mdl:emit (from either repo) or npm --prefix ../mdl2obliq run mdl:emit
 */
import { spawnSync } from "child_process"
import path from "path"

const peer = path.resolve(__dirname, "../../mdl2obliq/scripts/mdl-emit.ts")
const r = spawnSync("npx", ["--yes", "tsx", peer, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, "../../mdl2obliq"),
})
process.exit(r.status ?? 1)
