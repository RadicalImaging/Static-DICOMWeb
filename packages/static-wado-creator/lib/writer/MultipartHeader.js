class MultipartAttribute{
  constructor(attributeName, attributeValue) {
    this.attributeName = attributeName;
    this.attributeValue = attributeValue;
  }
}

class MultipartHeader {
  constructor(headerName, headerValue, attributes = []) {
    this.headerName = headerName;
    this.headerValue = headerValue;
    this.attributes = attributes;
  }
}

module.exports = {
  MultipartAttribute,
  MultipartHeader
}