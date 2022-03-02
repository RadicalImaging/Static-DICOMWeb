const ConfigPoint = require("config-point");
const dcmjsDimse = require("dcmjs-dimse");
const { aeConfig } = require("@ohif/static-wado-util");

const { Client } = dcmjsDimse;
const { CFindRequest } = dcmjsDimse.requests;
const { Status } = dcmjsDimse.constants;

const { studiesQueryByIndex } = ConfigPoint.register({
  studiesQueryByIndex: {
    generator: (params) => {
      const { queryAe, callingAe = "SCU", staticWadoAe } = params;
      if (!queryAe) throw new Error("queryAe not specified");
      const aeData = aeConfig[queryAe];
      if (!aeData) throw new Error(`No data for aeConfig.${queryAe} is configured in ${Object.keys(aeConfig)}`);
      const { host, port } = aeData;
      console.log("Studies query to", queryAe);

      return function query(queryKeysSrc) {
        const queryKeys = {
          QueryRetrieveLevel: "STUDY",
          NumberOfStudyRelatedInstances: 0,
          NumberOfStudyRelatedSeries: 0,
          ...queryKeysSrc,
        };
        console.log("Query to SCP", queryKeys);

        const client = new Client();
        const request = CFindRequest.createStudyFindRequest(queryKeys);
        return new Promise((resolve, reject) => {
          const queryList = [];
          request.on("response", (response) => {
            const status = response.getStatus();
            if (status === Status.Pending && response.hasDataset()) {
              const dataset = response.getDataset();
              if (params.verbose) console.log("Adding result", dataset.elements.StudyInstanceUID);
              queryList.push(dataset);
            } else if (status === Status.Success) {
              console.log("SCP Study Query success with", queryList.length, "items");
              resolve(queryList);
            } else if (status === Status.Pending) {
              console.log("Pending...");
            } else {
              console.log("Unknown status", status.toString(16));
              reject(new Error(`Unknown status ${status.toString(16)}`));
            }
          });
          client.addRequest(request);
          client.on("networkError", (e) => {
            console.log("Network error: ", e);
            reject(e);
          });
          client.send(host, port, callingAe || staticWadoAe, queryAe);
          console.log("Sending client request", host, port, callingAe || staticWadoAe, queryAe);
        });
      };
    },
  },
});

module.exports = studiesQueryByIndex;
