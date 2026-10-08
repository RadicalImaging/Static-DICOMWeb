# syntax=docker/dockerfile:1.7-labs
# One Dockerfile for linux/amd64 and linux/arm64:
#   docker buildx build --platform linux/arm64 .
#
# The base images are pinned by digest, and both are Debian trixie, so the
# canvas that arm64 compiles here finds the same libraries at run time.
# To update one, pick the new tag and take its digest from
#   docker buildx imagetools inspect <image>:<tag>

FROM node:24-trixie@sha256:1278a37eb510ec1606fba0e80f554bcc941ae0b44f35ae373c4822ae7717c64d AS builder
ARG TARGETARCH

# canvas has no linux-arm64 prebuilt binary, so arm64 compiles it from source.
# amd64 gets no -dev packages on purpose: a failed prebuilt download then fails
# the build, instead of compiling a canvas that needs libraries the final stage lacks.
RUN if [ "$TARGETARCH" = "arm64" ]; then \
      apt-get update && apt-get install -y \
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

# Install global tools
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

# Build. The deploy packages are not part of the image.
RUN pnpm -r --workspace-concurrency=1 \
      --filter '!@radicalimaging/s3-deploy' \
      --filter '!@radicalimaging/static-wado-deploy' \
      --filter '!@radicalimaging/healthlakestore' \
      run build

# The server and the production dependencies of it, from pnpm-lock.yaml, so
# the image gets the locked versions and the overrides of pnpm-workspace.yaml.
RUN pnpm --filter @radicalimaging/static-wado-webserver deploy --prod /deploy

############## Copy the installation locally for minimal size service

FROM oven/bun:1.3.13@sha256:87416c977a612a204eb54ab9f3927023c2a3c971f4f345a01da08ea6262ae30e AS dicomwebserver
ARG TARGETARCH

# curl for health checks. On arm64, also the runtime libraries of the canvas
# build; the amd64 prebuilt binary bundles them.
RUN apt-get update && \
    apt-get install -y curl && \
    if [ "$TARGETARCH" = "arm64" ]; then \
      apt-get install -y \
        libpixman-1-0 \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
        librsvg2-2 \
        ca-certificates; \
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
