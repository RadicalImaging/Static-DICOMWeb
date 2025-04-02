# syntax=docker/dockerfile:1.7-labs
FROM node:20.18.1-slim as builder
RUN apt-get update && apt-get install -y build-essential python3
ENV PATH /app/node_modules/.bin:$PATH
RUN npm install -g lerna@5.3.0
RUN npm install -g bun

WORKDIR /app
COPY --parents bun.lock package.json packages/*/package.json .
RUN bun install --frozen-lockfile
COPY --link --exclude=node_modules --exclude=**/dist . .
RUN bun run build
RUN bun run pack:js

FROM node:20.18.1-slim as dicomwebserver
RUN apt-get update && apt-get install -y build-essential python3
ENV PATH /app/node_modules/.bin:$PATH
RUN npm install -g bun

WORKDIR /app
RUN npm install -g commander@10.0.1
ENV PATH /app/node_modules/.bin:$PATH
COPY --from=builder /app/packages/cs3d/*.tgz cs3d.tgz
RUN npm install ./cs3d.tgz
COPY --from=builder /app/packages/static-wado-util/*.tgz static-wado-util.tgz
RUN npm install ./static-wado-util.tgz
COPY --from=builder /app/packages/static-wado-creator/*.tgz static-wado-creator.tgz
RUN npm install ./static-wado-creator.tgz
COPY --from=builder /app/packages/static-wado-webserver/*.tgz static-wado-webserver.tgz
RUN npm install ./static-wado-webserver.tgz
# RUN rm *.tgz
#COPY --from=builder /app/packages/static-wado-scp/*.tgz static-wado-scp.tgz
#RUN npm install ./static-wado-scp.tgz
RUN mkdir /dicomweb
RUN mkdir ~/.aws
COPY ./docker/* .
EXPOSE 5000
EXPOSE 11115
CMD ["dicomwebserver"]
