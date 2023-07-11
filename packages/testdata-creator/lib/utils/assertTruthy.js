const assert = require("assert").strict;

function assertTruthy(array) {
  try {
    for (item of array) {
      if (typeof item !== "object") {
        assert.ok(item, "Invalid value");
      } else if (Array.isArray(item)) {
        assert.ok(item.length, "Invalid value");
        assertTruthy(item);
      } else {
        // TODO
      }
    }
  } catch (e) {
    console.log(e);
    return false;
  }

  return true;
}

module.exports = assertTruthy;
