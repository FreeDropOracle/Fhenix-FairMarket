#!/usr/bin/env bash
set -e

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <circuit.wasm> <input.json> <output.wtns>"
  exit 1
fi

corepack pnpm exec -- snarkjs wtns calculate "$1" "$2" "$3"
