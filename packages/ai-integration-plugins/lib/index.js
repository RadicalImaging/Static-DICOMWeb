const ConfigPoint = require('config-point');

const { importPlugin } = ConfigPoint;

console.log('aiIntegration plugin import init');
/**
 * Define all the local plugins here, so they can be loaded dynamically.
 */
const { plugins } = ConfigPoint.register({
  plugins: {
    aiIntegrationGetContours:
      '@ohif/ai-integration-plugins/lib/aiIntegrationGetContours.plugin.js',
    aiIntegrationPostContours:
      '@ohif/ai-integration-plugins/lib/aiIntegrationPostContours.plugin.js',
    aiIntegrationGetPrediction:
      '@ohif/ai-integration-plugins/lib/aiIntegrationGetPrediction.plugin.js',
    aiIntegrationRunPrediction:
      '@ohif/ai-integration-plugins/lib/aiIntegrationRunPrediction.plugin.js',
  },
});

const importer = (name) => import(name);

exports.importPlugin = (name) => importPlugin(name, importer);
exports.plugins = plugins;
