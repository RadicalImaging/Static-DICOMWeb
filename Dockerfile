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
RUN yarn link:exec
RUN mkdir /dicomweb
RUN mkdir ~/.aws


RUN yarn build
RUN yarn link:exec
COPY ./docker/* .
RUN chmod ugo+x ./startStaticDicomweb.sh
EXPOSE 5000
EXPOSE 11115
ENTRYPOINT ["/bin/sh", "-c" , "/app/startStaticDicomweb.sh"]
