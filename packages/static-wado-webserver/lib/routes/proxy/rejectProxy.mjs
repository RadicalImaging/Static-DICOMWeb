import childProcess from "child_process";
import util from "util";

const exec = util.promisify(childProcess.exec);

export default function setRejectProxy(routerExpress, params) {
  console.log("Registering post reject", params);
  routerExpress.post("/studies/:studyUID/series/:seriesUID/reject/:reason", async (req, res) => {
    const { studyUID, seriesUID, reason } = req.params;
    console.log("Rejecting", studyUID, seriesUID, reason);
    const command = `mkdicomweb reject studies/${studyUID}/series/${seriesUID}`;
    const { stdout, stderr } = await exec(command);
    console.log("Rejected output:", stdout, stderr);
    res.status(204);
  });
}
