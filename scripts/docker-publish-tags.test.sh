#!/usr/bin/env bash
# Runs scripts/docker-publish-tags.sh against a local registry, in the cases
# that decide what a release publishes. Needs docker, buildx and jq.
#   bash scripts/docker-publish-tags.test.sh
# shellcheck disable=SC2317,SC2329 # `check` and `trap` call the functions indirectly.
set -euo pipefail

SCRIPT="${PUBLISH_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-publish-tags.sh}"
PORT="${REGISTRY_PORT:-5555}"
REG="localhost:${PORT}"
NAME="publish-tags-test-$$"
WORK="$(mktemp -d)"
FAILED=0

cleanup() {
  docker rm -fv "$NAME" >/dev/null 2>&1 || true
  docker buildx rm "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:5000" \
  registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373 >/dev/null
# The builder shares the host network, so it reaches the registry on localhost.
docker buildx create --name "$NAME" --driver docker-container --driver-opt network=host \
  --driver-opt image=moby/buildkit:v0.34.0@sha256:b059f8d7226d0b326bc871af489a5dddf65e36af4d20d14251b072974d9ee87c >/dev/null
printf 'FROM scratch\nCOPY mark /mark\n' > "$WORK/Dockerfile"

# Pushes one platform image of a fake release by digest, as a build job does,
# and prints the digest without the sha256: prefix.
build() { # platform revision version mark
  echo "$4" > "$WORK/mark"
  docker buildx build --builder "$NAME" --platform "$1" --provenance=mode=min \
    --label "org.opencontainers.image.revision=$2" --label "org.opencontainers.image.version=$3" \
    --output "type=image,name=${REG}/ghcr,push-by-digest=true,name-canonical=true,push=true" \
    --metadata-file "$WORK/meta.json" --quiet "$WORK" >/dev/null
  jq -r '."containerimage.digest"' < "$WORK/meta.json" | sed 's/^sha256://'
}

# Runs the script for a version with two digests; prints its output, keeps its exit code.
publish() { # version revision latest ghcr_only overwrite digest digest
  local dir="$WORK/digests-$RANDOM"
  mkdir -p "$dir"
  touch "$dir/$6" "$dir/$7"
  GHCR_IMAGE="${REG}/ghcr" DOCKERHUB_IMAGE="${REG}/hub" VERSION="$1" REVISION="$2" \
    LATEST="$3" GHCR_ONLY="$4" OVERWRITE="$5" DIGEST_DIR="$dir" bash "$SCRIPT" 2>&1
}

manifests() {
  docker buildx imagetools inspect --raw "$1" | jq -r '.manifests[].digest' | sort
}

# Puts a tag on two digests, as a manual push or an earlier run would.
tag() { # ref digest digest
  docker buildx imagetools create -t "$1" "${REG}/ghcr@sha256:$2" "${REG}/ghcr@sha256:$3" >/dev/null 2>&1
}

check() { # description command...
  local what="$1"
  shift
  if "$@" >"$WORK/out" 2>&1; then
    echo "ok     $what"
  else
    echo "FAILED $what"
    sed 's/^/       /' "$WORK/out"
    FAILED=1
  fi
}

same() { [ "$(manifests "$1")" = "$(manifests "$2")" ]; }
absent() { ! docker buildx imagetools inspect "$1" >/dev/null 2>&1; }
# Succeeds when the command fails with the expected message.
fails_with() { # pattern command...
  local pattern="$1" out
  shift
  if out="$("$@" 2>&1)"; then echo "$out"; return 1; fi
  echo "$out"
  grep -q "$pattern" <<<"$out"
}

A1=$(build linux/amd64 rev-a 1.8.0 a1); A2=$(build linux/arm64 rev-a 1.8.0 a2)
B1=$(build linux/amd64 rev-a 1.8.0 b1); B2=$(build linux/arm64 rev-a 1.8.0 b2)
S1=$(build linux/amd64 rev-x 1.8.1 s1); S2=$(build linux/arm64 rev-x 1.8.1 s2)
M1=$(build linux/amd64 rev-m 1.8.2 m1); M2=$(build linux/arm64 rev-m 1.8.2 m2)
N1=$(build linux/amd64 rev-n 1.9.0 n1); N2=$(build linux/arm64 rev-n 1.9.0 n2)
D1=$(build linux/amd64 unknown dev d1); D2=$(build linux/arm64 unknown dev d2)
P1=$(build linux/amd64 rev-p 1.9.1 p1); P2=$(build linux/arm64 rev-p 1.9.1 p2)

check 'a ghcr_only run publishes GHCR only' publish 1.8.0 rev-a true true false "$A1" "$A2"
check '... and leaves Docker Hub alone' absent "${REG}/hub:1.8.0"
check 'ghcr_only with overwrite is refused' \
  fails_with 'two images for one version' publish 1.8.0 rev-a true true true "$A1" "$A2"
check 'a digest file that is not a digest is refused' \
  fails_with 'is not a sha256 digest' publish 1.8.0 rev-a true false false "$A1" not-a-digest
check 'a later full run publishes the GHCR image, not its new build' \
  publish 1.8.0 rev-a true false false "$B1" "$B2"
check '... so both registries hold one image' same "${REG}/ghcr:1.8.0" "${REG}/hub:1.8.0"
check '... and latest follows' same "${REG}/hub:latest" "${REG}/hub:1.8.0"
check 'a re-run of the same continues' publish 1.8.0 rev-a true false false "$B1" "$B2"

tag "${REG}/ghcr:1.8.1" "$S1" "$S2"
check 'a GHCR version from another commit is refused' \
  fails_with 'does not come from' publish 1.8.1 rev-other true false false "$S1" "$S2"

tag "${REG}/hub:1.8.2" "$S1" "$S2"
check 'Docker Hub with another image is refused' \
  fails_with 'holds another image' publish 1.8.2 rev-m true false false "$M1" "$M2"
check '... and overwrite replaces it' publish 1.8.2 rev-m true false true "$M1" "$M2"
check '... in both registries' same "${REG}/ghcr:1.8.2" "${REG}/hub:1.8.2"

check 'a newer release moves latest' publish 1.9.0 rev-n true false false "$N1" "$N2"
check '... to that release' same "${REG}/hub:latest" "${REG}/hub:1.9.0"
check 'a re-run of an older release leaves latest alone' \
  publish 1.8.0 rev-a true false false "$B1" "$B2"
check '... so latest still holds 1.9.0' same "${REG}/hub:latest" "${REG}/hub:1.9.0"

tag "${REG}/hub:latest" "$D1" "$D2"
check 'a local build with the label dev on latest does not hold latest' \
  publish 1.9.1 rev-p true false false "$P1" "$P2"
check '... so latest moves to the release' same "${REG}/hub:latest" "${REG}/hub:1.9.1"

exit "$FAILED"
