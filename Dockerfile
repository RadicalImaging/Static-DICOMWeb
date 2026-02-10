# syntax=docker/dockerfile:1.7-labs
FROM node:24 as builder
ENV PATH /app/node_modules/.bin:$PATH
# Install global tools
RUN npm install -g lerna@8.2.4 bun@1.3.9

# Setup workdir
WORKDIR /app

# Copy dependency files first to leverage Docker cache
COPY --parents bun.lock *.tgz package.json packages/*/package.json ./

# Install dependencies
ENV PATH=/app/node_modules/.bin:$PATH
RUN bun install 
# Copy remaining source code
COPY --link --exclude=node_modules --exclude=**/dist . .

# Build and pack
RUN bun run build && bun run pack:js


FROM node:24 as installer

# Install minimal global tools
RUN npm install -g bun@1.3.9 commander@10.0.1

# Setup workdir and PATH
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

# Copy all .tgz packages
COPY *.tgz ./

# Copy prebuilt tgz artifacts from builder stage
COPY *.tgz ./
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

FROM oven/bun:1.3.9 as dicomwebserver

# Setup workdir and PATH
RUN mkdir /app
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

# In installer stage
COPY --from=installer /app ./

# Set up runtime directories
RUN echo 'stty erase ^H' >> /etc/profile && \
    mkdir /dicomweb ~/.aws && \
    ln -s /dicomweb /root/dicomweb

# Copy application config/startup scripts
COPY ./docker/* .

EXPOSE 5000
CMD ["dicomwebserver"]
