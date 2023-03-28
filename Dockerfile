FROM node:16
WORKDIR /app
RUN git clone https://github.com/RadicalImaging/Static-DICOMWeb.git /app
WORKDIR /app
RUN npm install -g npm@9.6.2
RUN yarn install --production
WORKDIR /app/packages/static-wado-scp
RUN npm install -g
WORKDIR /app/packages/static-wado-webserver
RUN npm install -g
EXPOSE 5000
ENTRYPOINT ["/bin/sh", "-c" , "dicomwebscp &; dicomwebserver &"]
