const ConfigPoint = require('config-point');
const { createAPIRequest } = require('./dao/APIDao.js');

const { aiIntegrationPostContours } = ConfigPoint.register({
  aiIntegrationPostContours: {
    generator: () => async (req, res) => {
      const namespace = 'contours';
      const result = await createAPIRequest(namespace, req.body);
      if (!result) {
        res.status(500).send(`Unable to process request`);
      } else {
        res.status(200).send(result);
      }
    },
  },
});

module.exports = aiIntegrationPostContours;
