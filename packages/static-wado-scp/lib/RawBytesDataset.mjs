import dcmjsDimse from 'dcmjs-dimse';

const { Dataset } = dcmjsDimse;

/**
 * A dcmjs-dimse Dataset that holds the encoded bytes of a received C-STORE
 * dataset. `getDenaturalizedDataset()` returns the bytes unchanged, so the
 * importer reads the data exactly as the SCU sent it. `getElements()`
 * decodes the bytes only when a caller needs the elements.
 */
export default class RawBytesDataset extends Dataset {
  /**
   * @param {Buffer} bytes - Dataset bytes, without the File Meta Information.
   * @param {string} transferSyntaxUid - Accepted transfer syntax of the bytes.
   */
  constructor(bytes, transferSyntaxUid) {
    super({}, transferSyntaxUid);
    this.bytes = bytes;
    this.decoded = undefined;
  }

  getElement(tag) {
    return this.getElements()[tag];
  }

  getElements() {
    this.decoded ||= new Dataset(this.bytes, this.transferSyntaxUid);
    return this.decoded.getElements();
  }

  getDenaturalizedDataset() {
    return this.bytes;
  }

  toString() {
    return `Dataset: ${this.bytes.length} bytes, ${this.transferSyntaxUid}`;
  }
}
