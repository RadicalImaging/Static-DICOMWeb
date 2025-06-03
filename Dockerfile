# syntax=docker/dockerfile:1.7-labs
FROM node:24 as builder
ENV PATH /app/node_modules/.bin:$PATH
RUN npm install -g lerna@5.3.0
RUN npm install -g bun@^1.2.15

WORKDIR /app
COPY --parents bun.lock *.tgz package.json packages/*/package.json .
RUN bun install --frozen-lockfile
COPY --link --exclude=node_modules --exclude=**/dist . .
RUN bun run build
RUN bun run pack:js

FROM node:24 as dicomwebserver
ENV PATH /app/node_modules/.bin:$PATH
RUN npm install -g bun@^1.2.15

WORKDIR /app
RUN npm install -g commander@10.0.1
ENV PATH /app/node_modules/.bin:$PATH
COPY *.tgz .
RUN npm install ./cornerstonejs-dicom-codec-1.0.7.tgz
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
RUN echo 'stty erase ^H' >> /etc/profile
RUN mkdir /dicomweb
RUN mkdir ~/.aws
COPY ./docker/* .
RUN ln -s /dicomweb /root/dicomweb
EXPOSE 5000
CMD ["dicomwebserver"]
