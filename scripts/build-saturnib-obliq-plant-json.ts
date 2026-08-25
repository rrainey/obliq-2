/**
 * Emit nested Saturn IB Obliq plant JSON (Simulink-mirrored hierarchy).
 *
 * Usage:
 *   npx tsx scripts/build-saturnib-obliq-plant-json.ts \
 *     [--out ~/src/viper/lib_SaturnIBObliq/plant/saturn-ib-obliq-plant.json]
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { buildSaturnIbObliqPlantDocument } from '../../viper/lib_SaturnIBObliq/ts/saturnIbObliqPlant'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

const defaultOut = path.join(
  os.homedir(),
  'src/viper/lib_SaturnIBObliq/plant/saturn-ib-obliq-plant.json'
)
const outPath = path.resolve(arg('--out') || defaultOut)
const doc = buildSaturnIbObliqPlantDocument()
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n')
const nBlocks = doc.data.sheets[0].blocks.length
console.log(`wrote ${outPath} (root blocks: ${nBlocks})`)
