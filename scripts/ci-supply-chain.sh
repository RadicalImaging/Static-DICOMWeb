#!/usr/bin/env bash
# CI supply-chain checks: pinned versions, frozen lockfile sync, audit only when bun.lock changed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

lockfile_changed_in_range() {
  local range="$1"
  [[ -z "$range" ]] && return 1
  git diff --name-only "$range" -- bun.lock | grep -q .
}

should_run_bun_audit() {
  if [[ "${FORCE_BUN_AUDIT:-}" == "1" ]]; then
    return 0
  fi

  if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" && -n "${GITHUB_BASE_REF:-}" ]]; then
    git fetch --no-tags --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null || true
    lockfile_changed_in_range "origin/${GITHUB_BASE_REF}...HEAD"
    return $?
  fi

  if [[ "${GITHUB_EVENT_NAME:-}" == "push" ]]; then
    if git rev-parse HEAD~1 >/dev/null 2>&1; then
      lockfile_changed_in_range 'HEAD~1..HEAD'
      return $?
    fi
    return 0
  fi

  lockfile_changed_in_range HEAD && return 0
  lockfile_changed_in_range --cached && return 0
  return 1
}

echo 'Checking pinned dependency versions...'
bash "$SCRIPT_DIR/check-pinned-versions.sh"

echo 'Installing with frozen lockfile...'
bun install --frozen-lockfile

echo 'Verifying bun.lock matches package.json (no drift after install)...'
if ! git diff --exit-code bun.lock; then
  echo 'bun.lock is out of sync. Run: bun run install:update-lockfile' >&2
  exit 1
fi

if should_run_bun_audit; then
  echo 'bun.lock changed in this change set; running bun audit (high/critical)...'
  bun audit --audit-level=high
else
  echo 'bun.lock unchanged; skipping bun audit.'
fi
