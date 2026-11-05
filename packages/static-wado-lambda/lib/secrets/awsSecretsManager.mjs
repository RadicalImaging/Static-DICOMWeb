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
  return {
    getToken({ refresh } = {}) {
      if (refresh || !token) {
        const read = client
          .send(new GetSecretValueCommand({ SecretId: secretId }))
          .then(result => result.SecretString);
        // Do not cache a failed read.
        read.catch(() => {
          if (token === read) {
            token = undefined;
          }
        });
        token = read;
      }
      return token;
    },
  };
}

export default awsSecretsManager;
