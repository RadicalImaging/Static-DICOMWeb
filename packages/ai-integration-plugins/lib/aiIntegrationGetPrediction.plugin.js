const ConfigPoint = require('config-point');
const { findAPIRequest } = require('./dao/APIDao.js');

const { aiIntegrationGetPrediction } = ConfigPoint.register({
  aiIntegrationGetPrediction: {
    generator: () => async (req, res) => {
      const namespace = 'prediction';
      const jobId = req.params.jobId;
      const result = await findAPIRequest(
        namespace,
        jobId,
        'tests/ai/samplePredictionResponse.json5'
      );
      if (!result) {
        res.status(404).send(`Job ${jobId} not found`);
      } else {
        res.status(200).send(result);
      }
    },
  },
});

module.exports = aiIntegrationGetPrediction;
