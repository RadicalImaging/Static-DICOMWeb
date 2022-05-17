import importPlugin from '../../util/importPlugin.mjs';

/**
 * Set plugin routes.
 *
 * @param {*} routerExpress root entry point for plugins routes (router express).
 * @param {*} params
 * @param {*} pluginsKey name of plugins configuration section.
 */
export default async function setPlugins(routerExpress, params, pluginsKey = "plugins") {
  if( !params ) return;
  const plugins = params[pluginsKey];
  if (plugins) {
    for (let i = 0; i < plugins.length; i++) {
      const pluginItem = plugins[i];
      console.log(
        `Configuring ${pluginItem.pluginName}(${pluginItem.pluginModule}) on ${pluginItem.pluginRoute}`
      );
      await import(pluginItem.pluginModule);
      const plugin = await importPlugin(pluginItem.pluginName);
      const { setRoute } = plugin.default || plugin;
      setRoute(routerExpress, pluginItem);
    }
  } else {
    console.log("No plugins defined");
  }
}
