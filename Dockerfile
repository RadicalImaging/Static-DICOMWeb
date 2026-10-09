# syntax=docker/dockerfile:1.7-labs@sha256:b99fecfe00268a8b556fad7d9c37ee25d716ae08a5d7320e6d51c4dd83246894
# One Dockerfile for linux/amd64 and linux/arm64:
#   docker buildx build --platform linux/arm64 .
#
# The Dockerfile frontend and the base images are pinned by digest. Both base
# images are Debian trixie, so the canvas that arm64 compiles here finds the
# same libraries at run time. To update one, pick the new tag and take its
# digest from
#   docker buildx imagetools inspect <image>:<tag>
# The apt packages are not pinned: Debian replaces old versions in trixie, so
# a pinned version stops installing. They come from the trixie security updates.

FROM node:24-trixie@sha256:1278a37eb510ec1606fba0e80f554bcc941ae0b44f35ae373c4822ae7717c64d AS builder
ARG TARGETARCH

# canvas has no linux-arm64 prebuilt binary, so arm64 compiles it from source
# (node:24-trixie lacks only libgif-dev; the list names every need anyway).
# On amd64 canvas uses the prebuilt binary, which bundles its libraries. If
# that download fails, canvas compiles against libraries the final stage
# lacks; the canvas check in the final stage then fails the build.
RUN if [ "$TARGETARCH" = "arm64" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        python3 \
        libpixman-1-dev \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        ca-certificates \
      && apt-get clean && rm -rf /var/lib/apt/lists/*; \
    fi

# Install global tools. Keep pnpm at the packageManager version of package.json
# (corepack leaves Node after 24). pnpm needs its install script: without it,
# pnpm runs its Node launcher, which gives no node-gyp to the arm64 canvas build.
RUN npm install -g pnpm@12.9.1

# Setup workdir
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

# Copy dependency files first to leverage Docker cache
COPY --parents pnpm-lock.yaml pnpm-workspace.yaml package.json packages/*/package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy remaining source code
COPY --link --exclude=node_modules --exclude=**/dist . .

# Build the server and the workspace packages that it needs, which are the
# packages that `pnpm deploy` copies.
RUN pnpm --filter '@radicalimaging/static-wado-webserver...' --workspace-concurrency=1 run build

# The server and the production dependencies of it, from pnpm-lock.yaml, so
# the image gets the locked versions and the overrides of pnpm-workspace.yaml.
RUN pnpm --filter @radicalimaging/static-wado-webserver deploy --prod /deploy

############## Copy the installation locally for minimal size service

FROM oven/bun:1.3.13@sha256:87416c977a612a204eb54ab9f3927023c2a3c971f4f345a01da08ea6262ae30e AS dicomwebserver
ARG TARGETARCH

# Replace the labels of oven/bun. docker-publish.yml passes the release values.
ARG IMAGE_VERSION=dev
ARG IMAGE_REVISION=unknown
ARG IMAGE_CREATED=unknown
LABEL org.opencontainers.image.title="Static DICOMweb" \
      org.opencontainers.image.description="DICOMweb server and DICOM to DICOMweb conversion tools" \
      org.opencontainers.image.url="https://github.com/RadicalImaging/Static-DICOMWeb" \
      org.opencontainers.image.source="https://github.com/RadicalImaging/Static-DICOMWeb" \
      org.opencontainers.image.documentation="https://github.com/RadicalImaging/Static-DICOMWeb#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.created="${IMAGE_CREATED}"

# The security updates of trixie, which the pinned base image predates. Then
# curl for health checks. On arm64, also the runtime libraries of the canvas
# build; the amd64 prebuilt binary bundles them.
RUN apt-get update && \
    apt-get upgrade -y --no-install-recommends && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    if [ "$TARGETARCH" = "arm64" ]; then \
      apt-get install -y --no-install-recommends \
        libpixman-1-0 \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
        librsvg2-2; \
    fi && \
    rm -rf /var/lib/apt/lists/*

# Setup workdir and PATH
RUN mkdir /app
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

COPY --from=builder /deploy ./

# node_modules/.bin holds the commands of the dependencies only, so add the
# commands of the server itself.
RUN ln -s ../../bin/dicomwebserver.mjs node_modules/.bin/dicomwebserver && \
    ln -s ../../bin/monitordicomwebserver.mjs node_modules/.bin/monitordicomwebserver

# Fail the build, also a local one, when canvas cannot load its libraries.
RUN bun -e "require('canvas').createCanvas(1, 1)"

# Set up runtime directories
RUN echo 'stty erase ^H' >> /etc/profile && \
    mkdir /dicomweb ~/.aws && \
    ln -s /dicomweb /root/dicomweb

# Copy application config/startup scripts
COPY ./docker/* .

EXPOSE 5000
EXPOSE 6499
# CMD ["dicomwebserver", "-q"]
CMD ["monitordicomwebserver"]
