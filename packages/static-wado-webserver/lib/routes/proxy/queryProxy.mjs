import { plugins } from '@radicalimaging/static-wado-plugins';
import { logger } from '@radicalimaging/static-wado-util';

const { webserverLog } = logger;

export const getDicomKey = (codeKey, lowerKey, query) => {
  for (const [key, value] of Object.entries(query)) {
    const keyToLower = key.toLowerCase();
    if (keyToLower === codeKey || keyToLower === lowerKey) {
      return value;
    }
  }
};

export default async function setQueryProxy(routerExpress, level, params, key) {
  const name = params[key];
  if (!name) return;
  try {
    const plugin = await import(plugins[name]);
    const { generator } = plugin.default || plugin;
    const queryFunction = generator(params, key);
    routerExpress.get(level, async (req, res, next) => {
      const studyUID = getDicomKey('0020000d', 'studyinstanceuid', req.query);
      if (studyUID) {
        req.url = `${req.path}/${studyUID}/index.json.gz`;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        next();
        return;
      }

      const results = await queryFunction(req.query);
      if (results) {
        res.json(results);
        return;
      }
      next();
    });
  } catch (e) {
    webserverLog.error('Unable to load study query plugin', name, 'because', e);
    // eslint-disable-next-line no-process-exit
    process.exit(-1);
  }
}
