#!/usr/bin/env bash
# Fails if any package.json dependency version is not pinned (no ^ ~ * >= ranges).
# Allows workspace:, file:, npm:, and http(s): specifiers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

is_pinned() {
  local version="$1"
  [[ -z "$version" ]] && return 1
  [[ "$version" =~ ^(workspace:|file:|npm:) ]] && return 0
  [[ "$version" =~ ^https?:// ]] && return 0
  [[ "$version" =~ [\^~*] ]] && return 1
  [[ "$version" == *">="* ]] && return 1
  [[ "$version" == *"<="* ]] && return 1
  return 0
}

check_dep_block() {
  local pkg="$1"
  local block="$2"
  local entry name version

  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    name="${entry%%$'\t'*}"
    version="${entry#*$'\t'}"
    if ! is_pinned "$version"; then
      echo "Unpinned dependency in ${pkg} ${block}: ${name} -> ${version}" >&2
      return 1
    fi
  done < <(jq -r --arg b "$block" '.[$b] // {} | to_entries[] | "\(.key)\t\(.value)"' "$pkg" 2>/dev/null || true)
}

failed=0
while IFS= read -r -d '' pkg; do
  for block in dependencies devDependencies optionalDependencies peerDependencies overrides; do
    if ! check_dep_block "$pkg" "$block"; then
      failed=1
    fi
  done
done < <(find "$REPO_ROOT" -name package.json -not -path '*/node_modules/*' -print0)

exit "$failed"
