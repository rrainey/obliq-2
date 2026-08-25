#!/usr/bin/env npx tsx
/** Deprecated location — delegates to peer package ~/src/mdl2obliq. */
import { spawnSync } from "child_process"
import path from "path"

const peer = path.resolve(__dirname, "../../mdl2obliq/scripts/mdl-ir.ts")
const r = spawnSync("npx", ["--yes", "tsx", peer, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, "../../mdl2obliq"),
})
process.exit(r.status ?? 1)
