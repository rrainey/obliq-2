#!/usr/bin/env bash
# Delegate to lib_SaturnIBObliq full-stack regen (segregated_atomic LVDA_LVDC).
exec "$HOME/src/viper/lib_SaturnIBObliq/scripts/regen-fullstack.sh" "$@"
