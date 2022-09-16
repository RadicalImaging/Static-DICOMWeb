/**
 * Tell whether cors is enabled or not based on app configuration.
 * It only checks for existing properties.
 *
 * @param {*} appConfig
 * @returns
 */
export default function isCorsEnabled(appConfig = {}) {
  const { corsOptions } = appConfig;

  return !!corsOptions && corsOptions.enabled && corsOptions.origin?.length > 0;
}
