import StaticWado from '@radicalimaging/static-wado-creator';

const { adaptProgramOpts } = StaticWado;

/**
 *
 */
export default function cstoreMain(destinationAe, studies, defaults) {
  const options = adaptProgramOpts(defaults, {
    ...this,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true,
  });
  console.log('cstoreMain', destinationAe, studies, options);
}
