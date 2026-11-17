#!/usr/bin/env bash
# Gate for Discretion phase 0. Prints PASS <n>, FAIL <n> <reason> or SKIP <n> human per
# gate bullet; exits 0 only if no bullet failed.
#
#   1. CI is green on both architectures.
#   2. The harness drives a two-node fixture workflow through the runner with a fake capture.
#   3. `discretion doctor` on the laptop confirms Tailscale and reports the unencrypted
#      root only as a warning.
#
# Bullet 1 is checked here as the workflow that runs both architectures plus the same
# commands it runs, executed on this machine. GATE_CHECKS and GATE_HARNESS replace the
# commands of bullets 1 and 2; the tests of this script use them.
set -u
cd "$(dirname "$0")/.." || exit 1

checks=${GATE_CHECKS:-'pnpm vitest run test/ci.test.ts &&
  pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm schemas:check'}
harness=${GATE_HARNESS:-'pnpm vitest run test/phase0.test.ts test/harness/harness.test.ts'}

failed=0

# check <n> <command>: runs the command, prints PASS or FAIL with the last line it printed.
check() {
  local n=$1 output
  if output=$(bash -c "$2" 2>&1); then
    echo "PASS $n"
  else
    failed=1
    local reason
    reason=$(printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | tail -n 1 | tr -d '\r')
    echo "FAIL $n ${reason:-the command failed}"
  fi
}

check 1 "$checks"
check 2 "$harness"
echo "SKIP 3 human"

exit "$failed"
