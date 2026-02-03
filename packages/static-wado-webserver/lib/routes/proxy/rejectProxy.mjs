import { execSpawn, logger } from '@radicalimaging/static-wado-util';

const { webserverLog } = logger;

export default function setRejectProxy(routerExpress /* , params */) {
  routerExpress.post('/studies/:studyUID/series/:seriesUID/reject/:reason', async (req, res) => {
    const { studyUID, seriesUID, reason } = req.params;
    // TODO validate parameters
    webserverLog.info('Rejecting', studyUID, seriesUID, reason);
    const command = `mkdicomweb reject studies/${studyUID}/series/${seriesUID}`;
    execSpawn(command);
    res.status(204).send();
  });
}
