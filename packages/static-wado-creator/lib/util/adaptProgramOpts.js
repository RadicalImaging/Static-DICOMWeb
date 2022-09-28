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
    maximumInlinePublicLength,
    maximumInlinePrivateLength,
    group: isGroup,
    instances: isInstanceMetadata,
    deduplicate: isDeduplicate,
    study: isStudyData,
    clean: isClean,
    recompress,
    recompressThumb,
    contentType,
    colourContentType,
    dir: rootDir,
    pathDeduplicated,
    pathInstances,
    removeDeduplicatedInstances,
    storeMultipartBulkData,
    prependBulkDataUri,
    expandBulkDataUri,
    verbose,
    scpPort,
  } = programOpts;

  return assignDefined(
    { ...defaults },
    {
      maximumInlinePublicLength,
      maximumInlinePrivateLength,
      isGroup,
      isInstanceMetadata,
      isDeduplicate,
      isStudyData,
      isClean,
      recompress,
      recompressThumb,
      contentType,
      colourContentType,
      rootDir,
      pathDeduplicated,
      pathInstances,
      removeDeduplicatedInstances,
      storeMultipartBulkData,
      scpPort,
      prependBulkDataUri,
      expandBulkDataUri,
      verbose,
    }
  );
};
