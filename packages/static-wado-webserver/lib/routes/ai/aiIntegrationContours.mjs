import importPlugin from '../../util/importPlugin.mjs';

export async function aiIntegrationGetContours(
  routerExpress,
  level,
  params,
  key
) {
  console.log(`aiIntegrationGetContours looking for ${key}`);
  const name = params[key];
  if (!name) return;
  try {
    console.log('aiIntegrationGetContours name: ', name);
    const plugin = await importPlugin(name);
    console.log('plugin: ', plugin);
    const { generator } = plugin.default || plugin;
    console.log('generator: ', generator);
    const aiGetContoursFunction = generator(params, key);
    console.log('Adding aiIntegration calls on', level, 'to', name);
    routerExpress.get(level, async (req, res, next) => {
      const results = await aiGetContoursFunction(req, res);
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

export async function aiIntegrationPostContours(
  routerExpress,
  level,
  params,
  key
) {
  console.log(`aiIntegrationPostContours looking for ${key}`);
  const name = params[key];
  if (!name) return;
  try {
    console.log('aiIntegrationPostContours name: ', name);
    const plugin = await importPlugin(name);
    console.log('plugin: ', plugin);
    const { generator } = plugin.default || plugin;
    console.log('generator: ', generator);
    const aiPostContoursFunction = generator(params, key);
    console.log('Adding aiIntegrationPostContours calls on', level, 'to', name);
    routerExpress.post(level, async (req, res, next) => {
      const result = await aiPostContoursFunction(req, res);
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
