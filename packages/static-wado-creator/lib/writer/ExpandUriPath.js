const ExpandUriPath = (id, path, options) => {
  const { prependBulkDataUri, expandBulkDataUri, includeSeries } = options;
  let expandedRelative = "";
  if (expandBulkDataUri) {
    let expandedRelativeSeries = "";
    if (includeSeries) {
      expandedRelativeSeries = `series/${id.seriesInstanceUid}/`;
    }
    expandedRelative = `studies/${id.studyInstanceUid}/${expandedRelativeSeries}`;
  }
  if (options.verbose) console.log(`Expanded path returned: ${prependBulkDataUri}${expandedRelative}${path}`);
  return `${prependBulkDataUri}${expandedRelative}${path}`;
};

module.exports = ExpandUriPath;
