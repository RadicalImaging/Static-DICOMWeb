import { Tags } from './dictionary/Tags.mjs';
import { compareTo } from './compareTo.mjs';

const { getValue } = Tags;

/**
 * Compares two study query objects by StudyDate
 * 
 * @param {Object} a - First study query object
 * @param {Object} b - Second study query object
 * @returns {number} - -1 if a < b, 0 if a === b, +1 if a > b
 */
export function compareStudyDate(a, b) {
  const studyDateA = getValue(a, Tags.StudyDate);
  const studyDateB = getValue(b, Tags.StudyDate);
  return compareTo(studyDateA, studyDateB);
}

/**
 * Compares two study query objects by StudyTime
 * 
 * @param {Object} a - First study query object
 * @param {Object} b - Second study query object
 * @returns {number} - -1 if a < b, 0 if a === b, +1 if a > b
 */
export function compareStudyTime(a, b) {
  const studyTimeA = getValue(a, Tags.StudyTime);
  const studyTimeB = getValue(b, Tags.StudyTime);
  return compareTo(studyTimeA, studyTimeB);
}

/**
 * Compares two study query objects by StudyInstanceUID
 * 
 * @param {Object} a - First study query object
 * @param {Object} b - Second study query object
 * @returns {number} - -1 if a < b, 0 if a === b, +1 if a > b
 */
export function compareStudyUID(a, b) {
  const uidA = getValue(a, Tags.StudyInstanceUID);
  const uidB = getValue(b, Tags.StudyInstanceUID);
  return compareTo(uidA, uidB);
}

/**
 * Combined comparator function that compares studies by StudyDate, StudyTime, and StudyInstanceUID
 * 
 * @param {Object} a - First study query object
 * @param {Object} b - Second study query object
 * @returns {number} - -1 if a < b, 0 if a === b, +1 if a > b
 */
export function compareStudies(a, b) {
  return compareStudyDate(a, b) || compareStudyTime(a, b) || compareStudyUID(a, b);
}

/**
 * Sorts an array of study query objects by StudyDate, StudyTime, and StudyInstanceUID
 * 
 * @param {Array} studies - Array of study query objects to sort
 * @returns {Array} - Sorted array of study query objects (mutates the input array)
 */
export function sortStudies(studies) {
  if (!Array.isArray(studies)) {
    throw new Error('sortStudies expects an array of study query objects');
  }

  return studies.sort(compareStudies);
}