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
  console.log({ programOpts });
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
    rootDir,
    pathDeduplicated,
    pathInstances,
    removeDeduplicatedInstances,
    storeMultipartBulkData,
    prependBulkDataUri,
    expandBulkDataUri,
    verbose,
    scpPort,
    s3ClientDir,
    s3RgBucket,
    s3CgBucket,
    s3EnvAccount,
    s3EnvRegion,
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
      s3ClientDir,
      s3RgBucket,
      s3CgBucket,
      s3EnvAccount,
      s3EnvRegion,
    }
  );
};
