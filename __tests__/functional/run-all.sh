#!/usr/bin/env bash
# __tests__/functional/run-all.sh
#
# Phase G functional test runner — invokes every g*-*.sh in order and
# aggregates pass/fail. Designed for `pnpm test:functional` from repo root.
#
# Per-slice scripts handle their own SETUP / CLEANUP. This wrapper just
# orchestrates and prints a summary. Functional tests are NOT in CI (they
# require real Clerk + real cloud); this runner is the manual pre-ship gate.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONAL_DIR="$REPO_ROOT/functional"

# Slices in execution order. Each script is independent — running G.5
# before G.4 should still work, but the canonical order matches the
# implementation slice order.
SCRIPTS=(
  "g1-token-store.sh"
  "g2-cli-login-page.sh"
  "g3-cli-login.sh"
  "g4-cli-logout.sh"
  "g5-team-join.sh"
  "g6-mcp-auth.sh"
  "g7-bridge-auth.sh"
  "g8-web-unified.sh"
  "g9-multitenancy.sh"
  "g10-org-switch.sh"
)

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
FAILED_SCRIPTS=()

for script in "${SCRIPTS[@]}"; do
  path="$FUNCTIONAL_DIR/$script"
  if [ ! -f "$path" ]; then
    echo ""
    printf "\033[1;33m=== SKIP %s (not yet implemented) ===\033[0m\n" "$script"
    TOTAL_SKIP=$((TOTAL_SKIP + 1))
    continue
  fi
  echo ""
  printf "\033[1;36m###############################################################\033[0m\n"
  printf "\033[1;36m# Running %s\033[0m\n" "$script"
  printf "\033[1;36m###############################################################\033[0m\n"
  if bash "$path"; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
  else
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_SCRIPTS+=("$script")
  fi
done

echo ""
printf "\033[1;36m###############################################################\033[0m\n"
printf "\033[1;36m# Phase G functional test summary\033[0m\n"
printf "\033[1;36m###############################################################\033[0m\n"
echo "PASS scripts: $TOTAL_PASS"
echo "FAIL scripts: $TOTAL_FAIL"
echo "SKIP (not implemented): $TOTAL_SKIP"

if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo ""
  printf "\033[1;31mFailed scripts:\033[0m\n"
  for s in "${FAILED_SCRIPTS[@]}"; do
    echo "  - $s"
  done
  exit 1
fi

# Overall integrated test only runs after every slice green.
INTEGRATED="$FUNCTIONAL_DIR/00-full-flow.sh"
if [ "$TOTAL_FAIL" -eq 0 ] && [ -f "$INTEGRATED" ]; then
  echo ""
  printf "\033[1;36m###############################################################\033[0m\n"
  printf "\033[1;36m# Running 00-full-flow.sh (integrated walkthrough)\033[0m\n"
  printf "\033[1;36m###############################################################\033[0m\n"
  if bash "$INTEGRATED"; then
    echo ""
    printf "\033[1;32mAll Phase G functional checks PASS.\033[0m\n"
    exit 0
  else
    echo ""
    printf "\033[1;31m00-full-flow.sh FAILED — Phase G is NOT ready to ship.\033[0m\n"
    exit 1
  fi
fi

echo ""
printf "\033[1;33mAll implemented slices PASS. (00-full-flow.sh not yet present.)\033[0m\n"
exit 0
