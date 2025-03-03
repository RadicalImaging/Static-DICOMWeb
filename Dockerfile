# syntax=docker/dockerfile:1.7-labs
FROM node:20 as builder
WORKDIR /app
RUN yarn config set workspaces-experimental true
ENV PATH /app/node_modules/.bin:$PATH
RUN npm install -g lerna@5.3.0
RUN npm install typescript
COPY --parents yarn.lock package.json packages/*/package.json .
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --ignore-scripts --production 
COPY --link --exclude=node_modules --exclude=**/build . .
RUN yarn run build
RUN yarn run link:exec

FROM node:20 as dicomwebserver
WORKDIR /app
RUN npm install -g commander@10.0.1
COPY --from=builder /app/packages/static-wado-util/*.tgz static-wado-util.tgz
COPY --from=builder /app/packages/static-cs-lite/*.tgz static-cs-lite.tgz
COPY --from=builder /app/packages/static-wado-creator/*.tgz static-wado-creator.tgz
RUN npm install -g ./static-wado-util.tgz ./static-cs-lite.tgz 
RUN npm install -g ./static-wado-creator.tgz
RUN mkdir /dicomweb
RUN mkdir ~/.aws
COPY ./docker/* .
EXPOSE 5000
EXPOSE 11115
# CMD ["mkdicomweb", "--help"]
