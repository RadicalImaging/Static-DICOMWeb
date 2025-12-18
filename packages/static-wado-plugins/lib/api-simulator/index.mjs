import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import ConfigPoint from 'config-point';

let jobId = 1000;
const jobs = {};

const initiateApi = (item, req, res) => {
  const thisId = jobId;
  jobId += 1;
  res.status(200).send(`${thisId}`);
  console.log('Initiate job', item.id, thisId);
};

function subsequentApi(item, req, res) {
  const itemId = jobs[req.params.jobId] || 1;
  jobs[req.params.jobId] = itemId + 1;

  const endPath = `${item.pluginRoute}/${itemId}.json`;
  console.log('item=', item);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-cache');
  const filePath = `${this.root}${endPath}`;
  console.log('sendFile path', endPath, req.url, filePath);
  res.sendFile(filePath);
}

export default ConfigPoint.createConfiguration('apiSimulator', {
  setRoute: (router, item, params = {}) => {
    const { dir = '~/dicomweb' } = params;
    const root = handleHomeRelative(dir);
    const props = { root };

    console.log('Registering API', item.pluginRoute, '/', jobId);
    router.post(item.pluginRoute, initiateApi.bind(props, item));
    // The get route isn't quite valid here, but is useful for testing before completing this.
    router.get(item.pluginRoute, initiateApi.bind(props, item));
    router.get(`${item.pluginRoute}/:jobId`, subsequentApi.bind(props, item));
  },
});
