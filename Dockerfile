# syntax=docker/dockerfile:1.7-labs
# One Dockerfile for linux/amd64 and linux/arm64:
#   docker buildx build --platform linux/arm64 .

FROM node:24 AS node-base
ARG TARGETARCH

# canvas has no linux-arm64 prebuilt binary, so arm64 compiles it from source.
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


FROM node-base AS builder

# Install global tools
RUN npm install -g pnpm@12.9.1

# Setup workdir
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

# Copy dependency files first to leverage Docker cache
COPY --parents pnpm-lock.yaml pnpm-workspace.yaml *.tgz package.json packages/*/package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy remaining source code
COPY --link --exclude=node_modules --exclude=**/dist . .

# Build and pack. The deploy packages are not part of the image.
RUN pnpm -r --workspace-concurrency=1 \
      --filter '!@radicalimaging/s3-deploy' \
      --filter '!@radicalimaging/static-wado-deploy' \
      --filter '!@radicalimaging/healthlakestore' \
      run build \
  && pnpm run pack:js


FROM node-base AS installer

# Install minimal global tools
RUN npm install -g bun@1.3.13 commander@10.0.1

# Setup workdir and PATH
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

# Copy all .tgz packages
COPY *.tgz ./

# Copy prebuilt tgz artifacts from builder stage
COPY --from=builder /app/packages/cs3d/*.tgz cs3d.tgz
COPY --from=builder /app/packages/static-wado-util/*.tgz static-wado-util.tgz
COPY --from=builder /app/packages/static-wado-creator/*.tgz static-wado-creator.tgz
COPY --from=builder /app/packages/create-dicomweb/*.tgz create-dicomweb.tgz
COPY --from=builder /app/packages/static-wado-webserver/*.tgz static-wado-webserver.tgz

# Install all modules at once
RUN npm install \
  ./cs3d.tgz \
  ./static-wado-util.tgz \
  ./static-wado-creator.tgz \
  ./create-dicomweb.tgz \
  ./static-wado-webserver.tgz \
  && rm *.tgz

############## Copy the installation locally for minimal size service

FROM oven/bun:1.3.13 AS dicomwebserver
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

COPY --from=installer /app ./

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
