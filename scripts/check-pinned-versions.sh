#!/usr/bin/env bash
# Fails if any package.json dependency version is not pinned (no ^ ~ * >= ranges).
# Allows workspace:, file:, npm:, and http(s): specifiers.
# Allows >=X.Y.Z when X.Y.Z matches a monorepo workspace package version.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

declare -A WORKSPACE_VERSIONS=()

load_workspace_versions() {
  local pkg name version
  while IFS= read -r -d '' pkg; do
    name="$(jq -r '.name // empty' "$pkg" 2>/dev/null || true)"
    version="$(jq -r '.version // empty' "$pkg" 2>/dev/null || true)"
    [[ -z "$name" || -z "$version" ]] && continue
    WORKSPACE_VERSIONS["$name"]="$version"
  done < <(find "$REPO_ROOT/packages" -mindepth 2 -maxdepth 2 -name package.json -print0 2>/dev/null || true)
}

is_workspace_gte() {
  local dep_name="$1"
  local version="$2"
  local ws_version min_version

  ws_version="${WORKSPACE_VERSIONS[$dep_name]:-}"
  [[ -z "$ws_version" ]] && return 1
  [[ "$version" =~ ^\>=([0-9]+\.[0-9]+\.[0-9]+(-[[:alnum:].-]+)?(\+[[:alnum:].-]+)?)$ ]] || return 1
  min_version="${BASH_REMATCH[1]}"
  [[ "$min_version" == "$ws_version" ]]
}

is_pinned() {
  local dep_name="${1:-}"
  local version="$2"
  [[ -z "$version" ]] && return 1
  case "$version" in
    workspace:*|file:*|npm:*) return 0 ;;
    http://*|https://*) return 0 ;;
  esac
  if [[ -n "$dep_name" ]] && is_workspace_gte "$dep_name" "$version"; then
    return 0
  fi
  case "$version" in
    ^*) return 1 ;;
    *'~'*) return 1 ;;
    *'*'*) return 1 ;;
    *'>='*) return 1 ;;
    *'<='*) return 1 ;;
  esac
  return 0
}

check_dep_block() {
  local pkg="$1"
  local block="$2"
  local entry name version
  local block_failed=0

  while IFS= read -r entry || [[ -n "${entry:-}" ]]; do
    [[ -z "$entry" ]] && continue
    name="${entry%%$'\t'*}"
    version="${entry#*$'\t'}"
    if ! is_pinned "$name" "$version"; then
      echo "Unpinned dependency in ${pkg} ${block}: ${name} -> ${version}" >&2
      block_failed=1
    fi
  done < <(jq -r --arg b "$block" '.[$b] // {} | to_entries[] | "\(.key)\t\(.value|tostring)"' "$pkg" 2>/dev/null || true)

  [[ "$block_failed" -eq 0 ]]
}

load_workspace_versions

failed=0
while IFS= read -r -d '' pkg; do
  for block in dependencies devDependencies optionalDependencies peerDependencies overrides; do
    if ! check_dep_block "$pkg" "$block"; then
      failed=1
    fi
  done
done < <(find "$REPO_ROOT" -name package.json -not -path '*/node_modules/*' -print0)

exit "$failed"
