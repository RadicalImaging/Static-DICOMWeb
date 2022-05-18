const ConfigPoint = require('config-point');

let jobId = 1000;
const jobs = {};

const initiateApi = (item, req, res) => {
  const thisId = jobId;
  jobId += 1;
  res.status(200).send(`${thisId}`);
  console.log("Initiate job", item.id, thisId);
  jobs[jobId] = 1;
};

const subsequentApi = (item, req, res, next) => {
  console.log("Subsequent api", item.id, req.params.jobId);
  const itemId = jobs[req.params.jobId];
  jobs[req.params.jobId] += 1;

  req.url = `${item.pluginRoute}/${itemId}.json`;
  res.setHeader("content-type", "application/json");
  console.log("Requested URL is", req.url);
  next();
};

module.exports = ConfigPoint.createConfiguration("apiSimulator", {
  setRoute: (router, item) => {
    console.log("Registering API", item.pluginRoute);
    router.post(item.pluginRoute, initiateApi.bind(null,item));
    // The get route isn't quite valid here, but is useful for testing before completing this.
    router.get(item.pluginRoute, initiateApi.bind(null,item));
    router.get(`${item.pluginRoute}/:jobId`, subsequentApi.bind(null,item));
  },
});