const assert = require("assert").strict;
const aeConfig = require("../aeConfig");

/**
 * Checks whether there is an ae definition into aeConfig or not.
 * In case result is false and there is a valid array of errorMessages, then it will throw an exception.
 *
 * @throws Exception if there is valid array of errorMessages is passed and result is false
 * @param {*} params object to check if there is a property name as aeStr or not.
 * @param {*} aeStr string reference
 * @param {*} errorMessages array of error messages for missing ae and missing ae def. Where first index is error string for missing ae and second index is error message for missing ae def.
 * @returns boolean
 */
module.exports = function assertAeDefinition(params, aeStr, errorMessages = []) {
  const aeValue = params[aeStr];
  const [errorAeMessage, errorAeDefMessage] = errorMessages;

  const result = aeValue && aeConfig[aeValue];
  try {
    assert.ok(!!aeValue, errorAeMessage);
    assert.ok(result, errorAeDefMessage);
  } catch (e) {
    if (errorAeMessage || errorAeDefMessage) {
      throw e;
    }

    return false;
  }

  return true;
};
