const ConfigPoint = require("config-point");
const { handleHomeRelative } = require("@radicalimaging/static-wado-util");

let jobId = 1000;
const jobs = {};

const initiateApi = (item, req, res) => {
  const thisId = jobId;
  jobId += 1;
  res.status(200).send(`${thisId}`);
  console.log("Initiate job", item.id, thisId);
  jobs[jobId] = 1;
};

function subsequentApi(item, req, res) {
  const itemId = jobs[req.params.jobId] || 1;
  jobs[req.params.jobId] = itemId + 1;
  const { root } = this;
  const path = `${item.pluginRoute}/${itemId}.json`;
  res.setHeader("content-type", "application/json; charset=utf-8");
  console.log("Requested URL is", req.url);
  const fileName = `${root}/${path}`;
  res.status(200).sendFile(fileName);
};

module.exports = ConfigPoint.createConfiguration("apiSimulator", {
  setRoute: (router, item, params) => {
    const root = handleHomeRelative(params.dir || '~/dicomweb');
    const props = { params, root };
    console.log("Registering API", item.pluginRoute);
    router.post(item.pluginRoute, initiateApi.bind(null, item));
    // The get route isn't quite valid here, but is useful for testing before completing this.
    router.get(item.pluginRoute, initiateApi.bind(props, item));
    router.get(`${item.pluginRoute}/:jobId`, subsequentApi.bind(props, item));
  },
});
