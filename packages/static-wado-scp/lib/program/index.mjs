import { loadConfiguration, configureCommands } from '@radicalimaging/static-wado-util';
import loadPlugins from '../loadPlugins.mjs';

/**
 * Configure static-wado-scp commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
export default async function configureProgram(defaults) {
  const configurationFile = await loadConfiguration(defaults, process.argv);
  console.log('Loaded configuration from', configurationFile);
  loadPlugins(defaults);
  configureCommands(defaults);
}
