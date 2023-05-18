import { execSpawn } from "@radicalimaging/static-wado-util";

export default function setRejectProxy(routerExpress /* , params */) {
  routerExpress.post("/studies/:studyUID/series/:seriesUID/reject/:reason", async (req, res) => {
    const { studyUID, seriesUID, reason } = req.params;
    // TODO validate parameters
    console.log("Rejecting", studyUID, seriesUID, reason);
    const command = `mkdicomweb reject studies/${studyUID}/series/${seriesUID}`;
    execSpawn(command);
    res.status(204).send();
  });
}
