import { Upstream } from './upstream.mjs';
import { envSecrets } from './secrets/env.mjs';
import { awsSecretsManager } from './secrets/awsSecretsManager.mjs';

/** The environment variable that holds the configuration JSON object */
export const CONFIG_VARIABLE = 'STATIC_WADO_PROXY_CONFIG';

export const defaults = {
  root: '/dicomweb',
  upstream:
    'https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb',
};

/**
 * The proxy configuration: the JSON object of `STATIC_WADO_PROXY_CONFIG` over the defaults.
 * The package README lists the keys.
 * @param {Object} [env]
 * @returns {Object}
 */
export function loadConfig(env = process.env) {
  return { ...defaults, ...JSON.parse(env[CONFIG_VARIABLE] || '{}') };
}

/** The secret source of `config.auth`, or undefined for no auth. */
function createSecrets(auth) {
  if (!auth) {
    return undefined;
  }
  if (auth.source === 'env') {
    return envSecrets(auth.variable);
  }
  if (auth.source === 'secretsManager') {
    return awsSecretsManager(auth);
  }
  throw new Error(`Unknown auth source ${auth.source}`);
}

/**
 * The `context` that `handle` and the handlers get. An entry adapter creates it one time.
 * @param {{config: Object, store: Object}} options - `store` is the object store of the entry
 * @returns {{config: Object, store: Object, secrets?: Object, upstream: Upstream, compute?: Object}}
 *   `compute` (encode, thumbnail) comes with the frame and thumbnail handlers.
 */
export function createContext({ config, store }) {
  const secrets = createSecrets(config.auth);
  const upstream = new Upstream({ url: config.upstream, secrets, store, allow: config.allow });
  return { config, store, secrets, upstream, compute: undefined };
}
