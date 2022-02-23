const filterKeys = {
  StudyInstanceUID: "0020000D",
  PatientName: "00100010",
  "00100020": "mrn",
  StudyDescription: "00081030",
  StudyDate: "00080020",
  ModalitiesInStudy: "00080061",
  AccessionNumber: "00080050",
};

/**
 * Compares values, matching any instance of desired to any instance of
 * actual by recursively go through the paired set of values.  That is,
 * this is O(m*n) where m is how many items in desired and n is the length of actual
 * Then, at the individual item node, compares the Alphabetic name if present,
 * and does a sub-string matching on string values, and otherwise does an
 * exact match comparison.
 *
 * @param {*} desired
 * @param {*} actual
 * @returns true if the values match
 */
const compareValues = (desired, actual) => {
  if (Array.isArray(desired)) {
    return desired.find((item) => compareValues(item, actual));
  }
  if (Array.isArray(actual)) {
    return actual.find((actualItem) => compareValues(desired, actualItem));
  }
  if (actual?.Alphabetic) {
    actual = actual.Alphabetic;
  }
  if (typeof actual == "string") {
    if (actual.length === 0) return true;
    if (desired.length === 0 || desired === "*") return true;
    if (desired[0] === "*" && desired[desired.length - 1] === "*") {
      return actual.indexOf(desired.substring(1, desired.length - 1)) != -1;
    }
    if (desired[desired.length - 1] === "*") {
      return actual.indexOf(desired.substring(0, desired.length - 1)) != -1;
    }
    if (desired[0] === "*") {
      return actual.indexOf(desired.substring(1)) === actual.length - desired.length + 1;
    }
  }
  return desired === actual;
};

/** Compares a pair of dates to see if the value is within the range */
const compareDateRange = (range, value) => {
  if (!value) return true;
  const dash = range.indexOf("-");
  if (dash === -1) return compareValues(range, value);
  const start = range.substring(0, dash);
  const end = range.substring(dash + 1);
  return (!start || value >= start) && (!end || value <= end);
};

/**
 * Filters the return list by the query parameters.
 *
 * @param {*} key
 * @param {*} queryParams
 * @param {*} study
 * @returns
 */
const filterItem = (key, queryParams, study) => {
  const altKey = filterKeys[key] || key;
  if (!queryParams) return true;
  const testValue = queryParams[key] || queryParams[altKey];
  if (!testValue) return true;
  const valueElem = study[key] || study[altKey];
  if (!valueElem) return false;
  if (valueElem.vr == "DA") return compareDateRange(testValue, valueElem.Value[0]);
  const value = valueElem.Value;
  return !!compareValues(testValue, value);
};

const qidoFilter = (list, queryParams) => {
  const filtered = list.filter((item) => {
    for (const key of Object.keys(filterKeys)) {
      if (!filterItem(key, queryParams, item)) return false;
    }
    return true;
  });
  return filtered;
};

module.exports = qidoFilter;
