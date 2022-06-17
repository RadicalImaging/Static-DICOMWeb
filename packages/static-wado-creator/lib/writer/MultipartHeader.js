const MultipartAttribute = require("./MultipartAttribute");

class MultipartHeader {
  constructor(headerName, headerValue, attributes = []) {
    this.headerName = headerName;
    this.headerValue = headerValue;
    this.attributes = attributes;
  }
}

module.exports = {
  MultipartAttribute,
  MultipartHeader,
};
