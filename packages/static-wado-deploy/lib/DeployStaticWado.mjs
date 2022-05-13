import importer from "./importer.mjs";

/**
 * Class that knows how to handle DICOMweb deployments.
 * Assumptions are that files are deployed to an archiving file system like S3 that stores items in multiple locations for safety,
 * and can provide direct support as a web server.  Files are assumed to be able to contain their own content
 * type/transfer encoding.
 *
 * Studies to be uploaded come from the <rootDir>/notifications/deploy directory structure, in the standard notifications layout.
 */
class DeployStaticWado {
  /**
   * Create a DICOMweb deployer
   * @param {object} config
   * @param {string} config.deployPlugin is the name of the deployment plugin
   * @param {string} config.studiesDestination is the root URL prefix of the studies deployment directory
   * @param {string} config.deduplicatedDestination is the root URL prefix of the deduplicated data directory
   * @param {string} config.instanceDestination is the root URL prefix of the instance deduplicated data.
   * @param {string} config.rootDir is the DICOMweb source directory
   * @param {string} config.compress is the compression type to use (if true, then gzip for dicomweb and brotli for client)
   * @param {string} config.deployNotificationName is the name of the notification queue to use, "deploy" by default
   */
  constructor(config) {
    this.config = config;
  }

  async loadPlugins() {
    this.deployPlugin = await importer(this.config.deployPlugin);
    if (!this.deployPlugin) throw new Error(`Deploy plugin ${this.config.deployPlugin} not defined`);
    console.log("Deploy plugin=", this.config.deployPlugin, this.deployPlugin);
    this.clientDeploy = this.deployPlugin.factory("client", this.config);
    this.rootDeploy = this.deployPlugin.factory("root", this.config);
    return { client: this.clientDeploy, root: this.rootDeploy };
  }

  /**
   * Deploys the client to the web service.  Throws an exception if the client path isn't configured.
   */
  deployClient() {
    
  }

  /**
   * Deploys the studies that have notifications in the DICOMWeb notifications directory.
   * If the dicomwebserver is configured for a study index, it also updates the study index.
   */
  deployDicomWebNotifications() {}

  /**
   * Deploys the entire DICOMweb studies directory.
   * Files already existing will have their hash code compared.  If the code is different, they will be replaced, otherwise they
   * will be left.
   */
  deployDicomWebAll() {}
}

export default DeployStaticWado;
