const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");
const retrieveJson = require("./query/retrieveJson");

/**
 * Queries the given URL instance.
 * Options:
 *   * metadata 
 *      Appends /series to the URL and tries to retrieve
 *      Stores the data in the `series` key
 *      Iterates over all series in the list and checks if the series is up to date
 *      For each series not up to date:
 *         * `series/<seriesInstanceUID>/metadata` stored to a key of the same name
 *         * Iterates over all instances in above and adds to `StudyData`
 *      Writes updated study data files (recreated from new deduplciated data)
 *   * cache - will cache all queried files
 *   * stream - will print the response directly to the standard output.
 *   * deduplicated
 *      Reads the /deduplicated path first
 *      If no object, and the `metadata` option is set, then runs that path
 *      If the object is found, then writes the deduplicated data to the deduplicated path
 *      Runs the regular metadata create path
 * 
 * Retrieving individual instances for proxying cached data.
 * Data can be read from disk once this is complete.
 *    `mkdicomweb query 1.2.3/series --cache`
 *    `mkdicomweb query 1.2.3/series/2.3.4/metadata --cache`
 * 
 * Retrieving a study query for direct proxy:
 * Data can be streamed directly from the command line.
 *    `mkdicomweb query 1.2.3?ModalitiesInStudy=CR --stream`
 * 
 * Creates or Updates Deduplicated Metadata:
 * This command should be used before receiving data against remote proxies NOT supporting deduplicated
 *    `mkdicomweb query 1.2.3 --metadata`
 * 
 * Creates or Updates Deduplicated Metadata from Deduplicated Remote
 * This command should be used before receiving data against remote proxies supporting deduplicated
 *   `mkdicomweb query 1.2.3 --deduplicated`
 * 
 * @param {*} url to fetch 
 * @param {*} options 
 * @param {*} program 
 */
module.exports = function queryMain(url, options) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    isGroup: true,
    isStudyData: true,
  });
  const importer = new StaticWado(finalOptions);
  const useUrl = url.indexOf('http')===-1 ? `${this.dicomwebUrl}/studies/${url}` : url;
  console.log("Import from", useUrl);
  retrieveJson(url, options).then(json => {
    console.log("Retrieved:", JSON.stringify(json,null,2));
  });
};
