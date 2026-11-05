/**
 * The local secret source (PRX-IMP-28): the upstream token from an environment variable.
 * @param {string} variable - The name of the environment variable
 * @returns {{getToken: () => Promise<string>}}
 */
export function envSecrets(variable) {
  return {
    async getToken() {
      const token = process.env[variable];
      if (!token) {
        throw new Error(`The environment variable ${variable} holds no upstream token`);
      }
      return token;
    },
  };
}

export default envSecrets;
