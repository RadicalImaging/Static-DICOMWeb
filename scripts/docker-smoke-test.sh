#!/usr/bin/env bash
# Smoke test of a Static-DICOMWeb image, for docker-ci.yml and docker-publish.yml:
#   bash scripts/docker-smoke-test.sh <image>
# canvas must load, the commands must run, and the default command must serve
# DICOMweb. dicomwebserver --help starts the server, so only its presence counts.
set -euo pipefail

IMAGE="$1"
NAME="smoke-$$"

docker run --rm "$IMAGE" sh -ec '
  bun -e "const c = require(\"canvas\"); c.createCanvas(4, 4).toBuffer(\"image/png\"); console.log(\"canvas\", c.version)"
  createdicomweb --help >/dev/null
  mkdicomweb --help >/dev/null
  for CMD in dicomwebserver monitordicomwebserver curl; do command -v "$CMD"; done
'

# A free host port, so that the test does not collide with another server.
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -p 127.0.0.1::5000 "$IMAGE" >/dev/null
PORT="$(docker port "$NAME" 5000/tcp | head -n 1 | sed 's/.*://')"

# A native start takes seconds. An arm64 image under QEMU takes minutes, and
# the monitor can restart it first; raise SMOKE_TIMEOUT_SECONDS for that case.
TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-180}"
DEADLINE=$((SECONDS + TIMEOUT))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/dicomweb/studies" >/dev/null; then
    echo 'The server answers /dicomweb/studies.'
    exit 0
  fi
  sleep 2
done

docker logs "$NAME"
echo "::error::The server did not answer /dicomweb/studies within ${TIMEOUT} seconds."
exit 1
