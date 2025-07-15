# syntax=docker/dockerfile:1.7-labs
FROM node:24 as builder
ENV PATH /app/node_modules/.bin:$PATH
# Install global tools
RUN npm install -g lerna@5.3.0 bun@1.2.15

# Setup workdir
WORKDIR /app

# Copy dependency files first to leverage Docker cache
COPY --parents bun.lock *.tgz package.json packages/*/package.json ./

# Install dependencies
ENV PATH=/app/node_modules/.bin:$PATH
RUN bun install --frozen-lockfile

# Copy remaining source code
COPY --link --exclude=node_modules --exclude=**/dist . .

# Build and pack
RUN bun run build && bun run pack:js


FROM node:24 as dicomwebserver

# Install minimal global tools
RUN npm install -g bun@1.2.15 commander@10.0.1

# Setup workdir and PATH
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

# Copy all .tgz packages
COPY *.tgz ./

# Copy prebuilt tgz artifacts from builder stage
COPY --from=builder /app/packages/cs3d/*.tgz cs3d.tgz
COPY --from=builder /app/packages/static-wado-util/*.tgz static-wado-util.tgz
COPY --from=builder /app/packages/static-wado-creator/*.tgz static-wado-creator.tgz
COPY --from=builder /app/packages/static-wado-webserver/*.tgz static-wado-webserver.tgz

# Install all modules at once
RUN npm install \
  ./cornerstonejs-dicom-codec-1.0.7.tgz \
  ./cs3d.tgz \
  ./static-wado-util.tgz \
  ./static-wado-creator.tgz \
  ./static-wado-webserver.tgz \
  && rm *.tgz

# Set up runtime directories
RUN echo 'stty erase ^H' >> /etc/profile && \
    mkdir /dicomweb ~/.aws && \
    ln -s /dicomweb /root/dicomweb

# Copy application config/startup scripts
COPY ./docker/* .

EXPOSE 5000
CMD ["dicomwebserver"]
