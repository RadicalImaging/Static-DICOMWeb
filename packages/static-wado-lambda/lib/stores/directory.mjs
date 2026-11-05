import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The local object store (PRX-IMP-28), for the local server and the tests. The object of a key
 * is the file `<root>/<key>.object`, with its content type and encoding in `<key>.object.json`.
 * The suffix lets a key (for example `studies/<uid>`) also be the prefix of other keys.
 * @param {string} root - The directory that holds the objects
 * @returns {{get: Function, put: Function, exists: Function}} See `s3Store`
 */
export function directoryStore(root) {
  const base = path.resolve(root);
  const file = key => {
    const name = path.resolve(base, `${key}.object`);
    if (!name.startsWith(base + path.sep)) {
      throw new Error(`Key outside of the store: ${key}`);
    }
    return name;
  };
  return {
    async get(key) {
      try {
        const name = file(key);
        const [body, meta] = await Promise.all([
          fs.readFile(name),
          fs.readFile(`${name}.json`, 'utf8'),
        ]);
        return { body, ...JSON.parse(meta) };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      }
    },
    async put(key, body, { contentType, contentEncoding } = {}) {
      const name = file(key);
      await fs.mkdir(path.dirname(name), { recursive: true });
      await fs.writeFile(`${name}.json`, JSON.stringify({ contentType, contentEncoding }));
      await fs.writeFile(name, body);
    },
    async exists(key) {
      return fs.access(file(key)).then(
        () => true,
        () => false
      );
    },
  };
}

export default directoryStore;
