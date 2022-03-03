import importPlugin from "../../util/importPlugin.mjs";

export default async function setQueryProxy(routerExpress, level, params, key) {
  const name = params[key];
  if (!name) return;
  try {
    const plugin = await importPlugin(name);
    const { generator } = plugin.default || plugin;
    const queryFunction = generator(params, key);
    console.log("Adding query call on", level, "to", name);
    routerExpress.get(level, async (req, res, next) => {
      const results = await queryFunction(req.query);
      if (results) {
        console.log("Found results", results.length);
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
