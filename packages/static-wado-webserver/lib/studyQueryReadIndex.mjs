import ConfigPoint from "config-point";
import { JSONReader, qidoFilter } from "@ohif/static-wado-util";

const { studyQueryReadIndex } = ConfigPoint.register({
  studyQueryReadIndex: {
    createWebQuery(directory, params) {
      let studiesData;
      const dataTime = Date.now();
      const dataLifetime = params.studyDataLifetime || 1000 * 60;
      const { rootDir } = params;

      // TODO - use a plugin to read the studies data, to allow switching to a scanner
      const readStudies = async () => {
        if (Date.now() - dataTime > dataLifetime) studiesData = null;
        if (studiesData) return studiesData;
        studiesData = await JSONReader(rootDir, "studies/index.json.gz");
        return studiesData;
      };

      return async function webQuery(req, res, next) {
        const studies = await readStudies();
        if (studies) {
          const filteredStudies = qidoFilter(studies, req.query);
          console.log("Filtered studies count", filteredStudies.length);
          res.json(filteredStudies);
          return;
        }
        console.log("Couldn't read studies data");
        next();
      };
    },
  },
});

export default studyQueryReadIndex;
