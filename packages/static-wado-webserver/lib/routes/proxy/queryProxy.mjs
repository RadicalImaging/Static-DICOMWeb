import { plugins } from "@radicalimaging/static-wado-plugins";

export default async function setQueryProxy(routerExpress, level, params, key) {
  const name = params[key];
  if (!name) return;
  try {
    const plugin = await import(plugins[name]);
    const { generator } = plugin.default || plugin;
    const queryFunction = generator(params, key);
    routerExpress.get(level, async (req, res, next) => {
      const results = await queryFunction(req.query);
      if (results) {
        res.json(results);
        return;
      }
      next();
    });
  } catch (e) {
    console.error("Unable to load study query plugin", name, "because", e);
    // eslint-disable-next-line no-process-exit
    process.exit(-1);
  }
}
