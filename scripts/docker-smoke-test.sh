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
docker run -d --name "$NAME" -p 127.0.0.1::5000 "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
PORT="$(docker port "$NAME" 5000/tcp | head -n 1 | sed 's/.*://')"

# A native start takes seconds; an arm64 image under QEMU takes minutes.
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/dicomweb/studies" >/dev/null; then
    echo 'The server answers /dicomweb/studies.'
    exit 0
  fi
  sleep 2
done

docker logs "$NAME"
echo '::error::The server did not answer /dicomweb/studies within 180 seconds.'
exit 1
