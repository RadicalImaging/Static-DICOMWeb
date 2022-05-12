export default function setRejectProxy(routerExpress, params) {
  console.log("Registering post reject", params);
  routerExpress.post("/studies/:studyUID/series/:seriesUID/reject/:reason", async (req, res) => {
    console.log("Rejecting");
    res.status(204);
  });
}
