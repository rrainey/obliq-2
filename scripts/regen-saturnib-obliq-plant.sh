#!/usr/bin/env bash
# Regenerate lib_SaturnIBObliq plant JSON + C sources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLANT_DIR="${HOME}/src/viper/lib_SaturnIBObliq/plant"
cd "$ROOT"
npx --yes tsx scripts/build-saturnib-obliq-plant-json.ts --out "${PLANT_DIR}/saturn-ib-obliq-plant.json"
npx --yes tsx scripts/obliq-cgen.ts "${PLANT_DIR}/saturn-ib-obliq-plant.json" \
  --out "${PLANT_DIR}/generated" \
  --name saturn_ib_obliq_plant \
  --compile
echo "Plant regenerated under ${PLANT_DIR}/generated"
