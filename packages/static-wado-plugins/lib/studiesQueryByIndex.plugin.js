const ConfigPoint = require('config-point');
const { JSONReader, qidoFilter } = require('@radicalimaging/static-wado-util');

const { studiesQueryByIndex } = ConfigPoint.register({
  studiesQueryByIndex: {
    generator: params => {
      let dataTime = 0;
      let studiesData;
      const dataLifetime = 20 * 1000;
      const { rootDir } = params;

      const readStudies = async () => {
        if (studiesData && Date.now() - dataTime > dataLifetime) {
          studiesData = null;
        }
        if (studiesData) {
          return studiesData;
        }
        studiesData = await JSONReader(rootDir, 'studies/index.json.gz');
        dataTime = Date.now();
        return studiesData;
      };

      return async function query(queryKeys) {
        const studies = await readStudies();
        if (studies) {
          const filteredStudies = qidoFilter(studies, queryKeys);
          return filteredStudies;
        }
        console.log("Couldn't read studies data");
        return null;
      };
    },
  },
});

module.exports = studiesQueryByIndex;
