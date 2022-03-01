const ConfigPoint = require("config-point");
const { JSONReader, qidoFilter } = require("@ohif/static-wado-util");

const { studiesQueryByIndex } = ConfigPoint.register({
  studiesQueryByIndex: {
    generator: (params) => {
      let dataTime;
      let studiesData;
      const dataLifetime = 60 * 1000;
      const { rootDir } = params;

      const readStudies = async () => {
        if (Date.now() - dataTime > dataLifetime) studiesData = null;
        if (studiesData) return studiesData;
        studiesData = await JSONReader(rootDir, "studies/index.json.gz");
        return studiesData;
      };

      return async function query(queryKeys) {
        const studies = await readStudies();
        if (studies) {
          const filteredStudies = qidoFilter(studies, queryKeys);
          console.log("Found", filteredStudies.length, "from", studies.length);
          return filteredStudies;
        }
        console.log("Couldn't read studies data");
        return null;
      };
    },
  },
});

module.exports = studiesQueryByIndex;
