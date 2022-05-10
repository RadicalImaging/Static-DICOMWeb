import importPlugin from '../../util/importPlugin.mjs';

export async function aiIntegrationGetPrediction(
  routerExpress,
  level,
  params,
  key
) {
  console.log(`aiIntegrationGetPrediction looking for ${key}`);
  const name = params[key];
  if (!name) return;
  try {
    console.log('aiIntegrationGetPrediction name: ', name);
    const plugin = await importPlugin(name);
    console.log('plugin: ', plugin);
    const { generator } = plugin.default || plugin;
    console.log('generator: ', generator);
    const aiGetPredictionFunction = generator(params, key);
    console.log(
      'Adding aiIntegrationGetPrediction calls on',
      level,
      'to',
      name
    );
    routerExpress.get(level, async (req, res, next) => {
      const results = await aiGetPredictionFunction(req, res);
      if (results) {
        console.log('Found results', results.length);
        res.json(results);
        return;
      }
      next();
    });
  } catch (e) {
    console.error('Unable to load aiIntegration plugin', name, 'because', e);
    // eslint-disable-next-line no-process-exit
    process.exit(-1);
  }
}

export async function aiIntegrationRunPrediction(
  routerExpress,
  level,
  params,
  key
) {
  console.log(`aiIntegrationRunPrediction looking for ${key}`);
  const name = params[key];
  if (!name) return;
  try {
    console.log('aiIntegrationRunPrediction name: ', name);
    const plugin = await importPlugin(name);
    console.log('plugin: ', plugin);
    const { generator } = plugin.default || plugin;
    console.log('generator: ', generator);
    const aiRunPredictionFunction = generator(params, key);
    console.log(
      'Adding aiIntegrationRunPrediction calls on',
      level,
      'to',
      name
    );
    routerExpress.post(level, async (req, res, next) => {
      const result = await aiRunPredictionFunction(req, res);
      if (result) {
        res.status(200).send(result);
        return;
      }
      next();
    });
  } catch (e) {
    console.error('Unable to load aiIntegration plugin', name, 'because', e);
    // eslint-disable-next-line no-process-exit
    process.exit(-1);
  }
}
