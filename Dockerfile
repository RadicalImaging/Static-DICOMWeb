FROM node:18
WORKDIR /app
RUN git clone https://github.com/RadicalImaging/Static-DICOMWeb.git /app
RUN git fetch
RUN git checkout feat/docker
RUN git pull
RUN yarn install
RUN npm install -g lerna@5.3.0
RUN npm install typescript
RUN yarn build
RUN yarn link:exec
EXPOSE 5000
EXPOSE 11112
ENTRYPOINT ["/bin/sh", "-c" , "dicomwebscp &; dicomwebserver &"]
