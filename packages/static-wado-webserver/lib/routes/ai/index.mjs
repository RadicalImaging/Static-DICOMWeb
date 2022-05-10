import {
  aiIntegrationGetContours,
  aiIntegrationPostContours,
} from './aiIntegrationContours.mjs';
import {
  aiIntegrationGetPrediction,
  aiIntegrationRunPrediction,
} from './aiIntegrationPrediction.mjs';

/**
 * Set all app client routes.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 */
export default async function setAiIntegration(routerExpress, params) {
  console.log('setAiIntegration');
  await aiIntegrationGetContours(
    routerExpress,
    '/api/generate-contours/:jobId',
    params,
    'aiIntegrationGetContours'
  );
  await aiIntegrationPostContours(
    routerExpress,
    '/api/generate-contours',
    params,
    'aiIntegrationPostContours'
  );
  await aiIntegrationGetPrediction(
    routerExpress,
    '/api/run-ai-prediction/:jobId',
    params,
    'aiIntegrationGetPrediction'
  );
  await aiIntegrationRunPrediction(
    routerExpress,
    '/api/run-ai-prediction',
    params,
    'aiIntegrationRunPrediction'
  );
}
