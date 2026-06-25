#!/usr/bin/env bash
# Bash orchestrator: renders every hero, one isolated `render-one` process per
# image, each hard-bounded by `timeout` (SIGTERM at 300s, SIGKILL 10s later).
# A single hung image can't wedge the run, and a bash loop survives any node
# crash that kept killing the previous node-based driver. render-one skips PNGs
# that already exist, so this is safe to re-run and never re-spends.
set +e
BACKEND="C:/Users/jovan/Downloads/wildlands agents platform/backend"
TSX="../node_modules/tsx/dist/cli.mjs"
LOG="C:/Users/jovan/Downloads/heroes/_bashdriver.log"
cd "$BACKEND" || exit 1

IDS=$(node "$TSX" scripts/print-ids.ts)
n=$(echo "$IDS" | wc -w)
ok=0; fail=0; failed_ids=""
echo "=== bash driver START $(date +%H:%M:%S) — $n ids ===" | tee -a "$LOG"

for id in $IDS; do
  printf "#%s %s … " "$id" "$(date +%H:%M:%S)" | tee -a "$LOG"
  timeout -k 10 300 node "$TSX" scripts/render-one.ts "$id" >> "$LOG" 2>&1
  rc=$?
  if [ $rc -eq 0 ]; then
    ok=$((ok+1)); echo "ok" | tee -a "$LOG"
  elif [ $rc -eq 124 ]; then
    fail=$((fail+1)); failed_ids="$failed_ids $id(timeout)"; echo "TIMEOUT" | tee -a "$LOG"
  else
    fail=$((fail+1)); failed_ids="$failed_ids $id(rc=$rc)"; echo "ERR rc=$rc" | tee -a "$LOG"
  fi
done

echo "=== bash driver DONE $(date +%H:%M:%S) — processed=$ok failed=$fail ===" | tee -a "$LOG"
echo "failed:$failed_ids" | tee -a "$LOG"
total=$(ls -1 "C:/Users/jovan/Downloads/heroes/"*.png 2>/dev/null | wc -l)
echo "total PNGs now: $total" | tee -a "$LOG"
