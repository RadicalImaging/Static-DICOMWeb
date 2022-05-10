const ConfigPoint = require('config-point');
const { createAPIRequest } = require('./dao/APIDao.js');

const { aiIntegrationRunPrediction } = ConfigPoint.register({
  aiIntegrationRunPrediction: {
    generator: () => async (req, res) => {
      const namespace = 'prediction';
      const result = await createAPIRequest(namespace, req.body);
      if (!result) {
        res.status(500).send(`Unable to process request`);
      } else {
        res.status(200).send(result);
      }
    },
  },
});

module.exports = aiIntegrationRunPrediction;
