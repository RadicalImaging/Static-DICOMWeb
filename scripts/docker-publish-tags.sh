#!/usr/bin/env bash
# Writes the version and `latest` tags of a release image, for the `publish`
# job of docker-publish.yml. Run it after `docker login` to each registry.
#
# Environment:
#   GHCR_IMAGE, DOCKERHUB_IMAGE  the image names, without a tag
#   VERSION                      the release version, for example 1.8.0
#   REVISION                     the commit of the release tag
#   LATEST                       true when the release is the newest on master
#   GHCR_ONLY                    true to skip Docker Hub
#   OVERWRITE                    true to replace a version that holds another image
#   DIGEST_DIR                   one empty file per built digest (hex only)
#
# A version keeps one image:
# - When GHCR holds the version (a run that stopped before Docker Hub, or a
#   ghcr_only run), the script publishes that image, not the new build. That
#   image must come from REVISION, because GHCR is not behind the approval.
# - A tag that holds the same manifests counts as done, so a re-run continues.
# - A tag that holds another image stops the run, unless OVERWRITE is set;
#   then the new build replaces the version in each registry.
# `latest` moves only forward: a re-run of an old release leaves a newer
# `latest` alone. Only "not found" counts as a free tag; any other registry
# error stops the run. A manual push between the checks and the write is not
# detected, so do not push these tags by hand.
set -euo pipefail

: "${GHCR_IMAGE:?}" "${DOCKERHUB_IMAGE:?}" "${VERSION:?}" "${REVISION:?}" "${DIGEST_DIR:?}"
LATEST="${LATEST:-false}"
GHCR_ONLY="${GHCR_ONLY:-false}"
OVERWRITE="${OVERWRITE:-false}"

if [ "$GHCR_ONLY" = 'true' ] && [ "$OVERWRITE" = 'true' ]; then
  echo '::error::ghcr_only with overwrite would give GHCR and Docker Hub two images for one version.'
  exit 1
fi

# The digests of the manifests in an image index, sorted.
manifests() {
  docker buildx imagetools inspect --raw "$1" | jq -r '.manifests[].digest' | sort
}

# One OCI label of each platform image, one line per platform.
labels() {
  docker buildx imagetools inspect "$1" --format '{{json .Image}}' |
    jq -r --arg key "$2" '(if has("config") then [.] else [.[]] end)[] | .config.Labels[$key] // ""'
}

# True when the tag exists. Only "not found" means a free tag.
exists() {
  local error
  if error="$(docker buildx imagetools inspect "$1" 2>&1 >/dev/null)"; then
    return 0
  fi
  if printf '%s' "$error" | grep -q ': not found'; then
    return 1
  fi
  echo "::error::Cannot read $1: $(printf '%s' "$error" | tail -n 1)"
  exit 1
}

IMAGES=("$GHCR_IMAGE")
if [ "$GHCR_ONLY" != 'true' ]; then
  IMAGES+=("$DOCKERHUB_IMAGE")
fi

SOURCES=()
for FILE in "$DIGEST_DIR"/*; do
  SOURCES+=("${GHCR_IMAGE}@sha256:$(basename "$FILE")")
done
if [ "${#SOURCES[@]}" -ne 2 ]; then
  echo "::error::Expected 2 digests (amd64, arm64), found ${#SOURCES[@]}."
  exit 1
fi

if [ "$OVERWRITE" != 'true' ] && exists "${GHCR_IMAGE}:${VERSION}"; then
  # Each platform image must name REVISION; a missing label counts as another.
  REVISIONS="$(labels "${GHCR_IMAGE}:${VERSION}" org.opencontainers.image.revision)"
  if [ -z "$REVISIONS" ] || printf '%s\n' "$REVISIONS" | grep -qvxF "$REVISION"; then
    echo "::error::${GHCR_IMAGE}:${VERSION} does not come from ${REVISION} (revisions: $(printf '%s' "$REVISIONS" | tr '\n' ' ')). Start the run with overwrite to replace it."
    exit 1
  fi
  echo "::notice::GHCR holds ${VERSION} from ${REVISION}, so this run publishes that image and not the new build."
  SOURCES=("${GHCR_IMAGE}:${VERSION}")
fi
WANT="$(for SOURCE in "${SOURCES[@]}"; do manifests "$SOURCE"; done | sort)"

for IMAGE in "${IMAGES[@]}"; do
  if exists "${IMAGE}:${VERSION}"; then
    HAVE="$(manifests "${IMAGE}:${VERSION}")"
    if [ "$HAVE" = "$WANT" ]; then
      echo "${IMAGE}:${VERSION} holds this image already."
    elif [ "$OVERWRITE" = 'true' ]; then
      echo "::warning::This run replaces ${IMAGE}:${VERSION}."
    else
      echo "::error::${IMAGE}:${VERSION} holds another image. Start the run with overwrite to replace it."
      exit 1
    fi
  fi
done

TAGS=()
CHECK=()
for IMAGE in "${IMAGES[@]}"; do
  TAGS+=(-t "${IMAGE}:${VERSION}")
  CHECK+=("${IMAGE}:${VERSION}")
  if [ "$LATEST" != 'true' ]; then
    continue
  fi
  if exists "${IMAGE}:latest"; then
    CURRENT="$(labels "${IMAGE}:latest" org.opencontainers.image.version | sort -V | tail -n 1)"
    NEWEST="$(printf '%s\n%s\n' "$CURRENT" "$VERSION" | sort -V | tail -n 1)"
    if [ -n "$CURRENT" ] && [ "$CURRENT" != "$VERSION" ] && [ "$NEWEST" = "$CURRENT" ]; then
      echo "::notice::${IMAGE}:latest holds ${CURRENT}, which is newer than ${VERSION}, so latest stays."
      continue
    fi
  fi
  TAGS+=(-t "${IMAGE}:latest")
  CHECK+=("${IMAGE}:latest")
done

ANNOTATIONS=(
  --annotation "index:org.opencontainers.image.title=Static DICOMweb"
  --annotation "index:org.opencontainers.image.description=DICOMweb server and DICOM to DICOMweb conversion tools"
  --annotation "index:org.opencontainers.image.source=https://github.com/RadicalImaging/Static-DICOMWeb"
  --annotation "index:org.opencontainers.image.licenses=MIT"
  --annotation "index:org.opencontainers.image.version=${VERSION}"
  --annotation "index:org.opencontainers.image.revision=${REVISION}"
)
docker buildx imagetools create "${ANNOTATIONS[@]}" "${TAGS[@]}" "${SOURCES[@]}"

for REF in "${CHECK[@]}"; do
  HAVE="$(manifests "$REF")"
  if [ "$HAVE" != "$WANT" ]; then
    echo "::error::${REF} does not hold the published manifests."
    exit 1
  fi
  echo "${REF} holds the published manifests."
done
