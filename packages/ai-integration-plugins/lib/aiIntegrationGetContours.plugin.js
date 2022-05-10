const ConfigPoint = require('config-point');
const { findAPIRequest } = require('./dao/APIDao.js');

const { aiIntegrationGetContours } = ConfigPoint.register({
  aiIntegrationGetContours: {
    generator: () => async (req, res) => {
      const namespace = 'contours';
      const jobId = req.params.jobId;
      const result = await findAPIRequest(
        namespace,
        jobId,
        'tests/ai/sampleContoursResponse.json5'
      );
      if (!result) {
        res.status(404).send(`Job ${jobId} not found`);
      } else {
        res.status(200).send(result);
      }
    },
  },
});

module.exports = aiIntegrationGetContours;
