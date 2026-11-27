import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * The AWS secret source (PRX-IMP-28): the upstream token is the `SecretString` of a Secrets
 * Manager secret. The token is cached; `getToken({ refresh: true })` reads it again (the
 * upstream does that on a 401).
 * @param {Object} options
 * @param {string} options.secretId - The name or ARN of the secret
 * @param {SecretsManagerClient} [options.client]
 * @returns {{getToken: (options?: {refresh?: boolean}) => Promise<string>}}
 */
export function awsSecretsManager({ secretId, client = new SecretsManagerClient({}) }) {
  let token;
  let refreshing;
  return {
    getToken({ refresh } = {}) {
      // Concurrent 401s share one read.
      if (refreshing || (!refresh && token)) {
        return refreshing || token;
      }
      const read = client.send(new GetSecretValueCommand({ SecretId: secretId })).then(result => {
        if (typeof result.SecretString !== 'string') {
          throw new Error(`The secret ${secretId} has no SecretString`);
        }
        return result.SecretString;
      });
      refreshing = read;
      token = read;
      read.then(
        () => {
          refreshing = undefined;
        },
        () => {
          refreshing = undefined;
          // Do not cache a failed read.
          if (token === read) {
            token = undefined;
          }
        }
      );
      return read;
    },
  };
}

export default awsSecretsManager;
