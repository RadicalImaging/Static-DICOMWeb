import must from 'must';

import { importPlugin, plugins } from '../../lib/index.js';

describe('@ohif/ai-integration-plugins', () => {
  beforeAll(() => importPlugin('aiIntegrationGetContours'));

  it('config has default values', () => {
    must(plugins.aiIntegrationGetContours).not.be.undefined();
    must(plugins.aiIntegrationPostContours).not.be.undefined();
  });

  it('aiIntegration plugin loads', () =>
    importPlugin('aiIntegrationGetContours'));
});
