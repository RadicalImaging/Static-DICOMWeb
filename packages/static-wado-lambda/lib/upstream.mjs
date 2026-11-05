import { gunzipSync } from 'node:zlib';
import { DicomWebFetch } from '@dcmjs/commands/dicomweb-fetch';

const PAGE_SIZE = 1000;

/**
 * The upstream DICOMweb service (PRX-IMP-3, PRX-IMP-23): the `@dcmjs/commands` fetch client
 * with the token of the secret source as `Authorization: Bearer <token>`, and the allowlist.
 * On a 401 it gets a fresh token and repeats the request one time. No rate limit (D2).
 */
export class Upstream extends DicomWebFetch {
  /**
   * @param {Object} options
   * @param {string} options.url - The upstream DICOMweb root
   * @param {{getToken: Function}} [options.secrets] - No secret source: no auth
   * @param {Object} options.store - Holds the collection pages of the allowlist
   * @param {{studies?: string[], collections?: string[]}} [options.allow] - No allowlist: all
   *   studies are permitted
   */
  constructor({ url, secrets, store, allow }) {
    super({ url });
    this.secrets = secrets;
    this.store = store;
    this.allow = allow;
    if (secrets) {
      this.headers = async () => ({ Authorization: `Bearer ${await secrets.getToken()}` });
    }
  }

  async request(path, accept, signal) {
    try {
      return await super.request(path, accept, signal);
    } catch (error) {
      if (error.status !== 401 || !this.secrets) {
        throw error;
      }
      await this.secrets.getToken({ refresh: true });
      return super.request(path, accept, signal);
    }
  }

  /**
   * True when the allowlist permits the population of the study: the study is in
   * `allow.studies`, or in a stored page of a collection of `allow.collections`.
   * @param {string} studyUID
   * @returns {Promise<boolean>}
   */
  async isAllowed(studyUID) {
    if (!this.allow || this.allow.studies?.includes(studyUID)) {
      return true;
    }
    // shortcut: the pages load once per container; a collection built later needs a new container.
    this.collectionStudies ||= this.loadCollections().catch(error => {
      this.collectionStudies = undefined;
      throw error;
    });
    return (await this.collectionStudies).has(studyUID);
  }

  /** The StudyInstanceUIDs of the stored pages `collections/<id>/studies[/<offset>]`. */
  async loadCollections() {
    const studies = new Set();
    for (const id of this.allow.collections || []) {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await this.store.get(`collections/${id}/studies${offset ? `/${offset}` : ''}`);
        if (!page) {
          break;
        }
        const body = page.contentEncoding === 'gzip' ? gunzipSync(page.body) : page.body;
        const list = JSON.parse(body.toString());
        list.forEach(study => studies.add(study['0020000D']?.Value?.[0]));
        if (list.length < PAGE_SIZE) {
          break;
        }
      }
    }
    return studies;
  }
}

export default Upstream;
