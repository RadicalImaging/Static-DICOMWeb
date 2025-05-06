const assignDefined = (dest, src) => {
  Object.keys(src).forEach((key) => {
    const val = src[key];
    if (val !== undefined) {
      dest[key] = val;
    }
  });
  return dest;
};

module.exports = function adaptProgramOpts(programOpts, defaults) {
  const {
    group: isGroup,
    instances: isInstanceMetadata,
    deduplicate: isDeduplicate,
    study: isStudyData,
    clean: isClean,
    dir: rootDir,
    delete: deleteInstances,
    singlePartImage,
    encapsulatedImage,
  } = programOpts;

  return assignDefined(
    { ...defaults },
    {
      ...programOpts,
      isStudyData,
      isClean,
      isInstanceMetadata,
      isDeduplicate,
      isGroup,
      rootDir,
      encapsulatedImage: encapsulatedImage ?? singlePartImage !== true,
      singlePartImage: singlePartImage ?? encapsulatedImage === false,
      delete: deleteInstances,
    }
  );
};
