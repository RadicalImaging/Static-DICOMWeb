const assert = require("assert").strict;

function assertArrayDivisibility(array, divisor, errorMessages = []) {
  const [errorArrayMessage, errorDivisorMessage] = errorMessages;

  try {
    assert.ok(!!array, errorArrayMessage);
    const result = array.length % divisor !== 0;
    assert.ok(result, errorDivisorMessage);
  } catch (e) {
    if (errorArrayMessage || errorDivisorMessage) {
      throw e;
    }

    return false;
  }

  return true;
}

module.exports = assertArrayDivisibility;
