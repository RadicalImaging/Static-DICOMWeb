/**
 * Compares two values and returns -1, 0, or +1
 * Handles undefined, null, numbers, strings, and other types
 * - Numbers are compared numerically
 * - Strings are compared using localeCompare
 * - undefined/null values are treated as less than defined values
 * - Other types are converted to strings for comparison
 * 
 * @param {*} a - First value to compare
 * @param {*} b - Second value to compare
 * @returns {number} - -1 if a < b, 0 if a === b, +1 if a > b
 */
export function compareTo(a, b) {
  // Handle undefined/null cases
  if (a === undefined || a === null) {
    if (b === undefined || b === null) {
      return 0; // Both are undefined/null, equal
    }
    return -1; // a is undefined/null, b is defined, a < b
  }
  if (b === undefined || b === null) {
    return 1; // b is undefined/null, a is defined, a > b
  }

  // Handle numbers
  if (typeof a === 'number' && typeof b === 'number') {
    if (isNaN(a)) {
      return isNaN(b) ? 0 : -1; // NaN < any number
    }
    if (isNaN(b)) {
      return 1; // any number > NaN
    }
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  // Try numeric comparison if both can be converted to numbers
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA < numB ? -1 : (numA > numB ? 1 : 0);
  }

  // Handle strings (including string representations)
  const strA = String(a);
  const strB = String(b);
  
  // If both are empty strings, they're equal
  if (!strA && !strB) {
    return 0;
  }
  
  // If one is empty, it's less than the other
  if (!strA) return -1;
  if (!strB) return 1;
  
  // Use localeCompare for string comparison
  return strA.localeCompare(strB);
}
