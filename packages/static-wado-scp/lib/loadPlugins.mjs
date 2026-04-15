import { plugins } from '@radicalimaging/static-wado-plugins';

export const loadedPlugins = {};

const loadPlugins = options => {
  const { studyQuery } = options;
  console.log('Using study query', studyQuery);
  return import(plugins[studyQuery])
    .then(value => {
      const theImport = value.default || value;
      loadedPlugins.STUDY = theImport.generator(options);
    })
    .catch(reason => {
      console.log('Unable to load plugin because', reason);

      process.exit(-1);
    });
};

export default loadPlugins;
