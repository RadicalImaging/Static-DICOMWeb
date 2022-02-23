const { Stats } = require("@ohif/static-wado-util");

const handler = {
  get(obj, key) {
    const ikey = parseInt(key);
    if (ikey == key) return obj.index_get(ikey);
    const handlerFunc = handler[key];
    if (handlerFunc && key != "get") return handlerFunc(obj, key);
    if (!obj._keys[key]) {
      console.log("New call to", key);
      obj._keys[key] = true;
    }
    return obj[key];
  },

  length: (obj) => obj.combinedLength,
};

const StreamingFunctions = {
  addChunks(chunks) {
    if (!this.chunks) this.chunks = [];
    chunks.forEach((chunk) => this.chunks.push(chunk));
    this.combinedLength = 0;
    let i = 0;
    this.chunks.forEach((chunk) => {
      chunk.start = this.combinedLength;
      chunk.i = i;
      i += 1;
      this.combinedLength += chunk.length;
    });
    this.lastChunk = this.chunks[0];
  },

  index_get(ikey) {
    const found = this.findChunk(ikey);
    if (!found) throw Error(`index ${ikey} not found between 0..${this.combinedLength}`);
    return found[ikey - found.start];
  },

  findChunk(ikey) {
    let i = (this.lastChunk.start <= ikey && this.lastChunk.i) || 0;
    while (i < this.chunks.length) {
      const chunk = this.chunks[i];
      if (ikey >= chunk.start && ikey < chunk.start + chunk.length) {
        this.lastChunk = chunk;
        return chunk;
      }
      i += 1;
    }
  },

  slice(start, end) {
    const buflen = end - start;
    const ret = Buffer.alloc(buflen);
    let i = 0;
    while (i < buflen) {
      const chunk = this.findChunk(start + i);
      const chunkI = start + i - chunk.start;
      const useLen = Math.min(buflen, chunk.length - chunkI);
      chunk.copy(ret, i, chunkI, chunkI + useLen);
      i += useLen;
    }
    return ret;
  },

  hexSlice(start, end) {
    return this.slice(start, end).hexSlice();
  },

  /** The internal node copy function is a native that directly accesses internal class details, so over-ride it.
   * TODO: Make this efficient by using the internal copy function when available rather than copy one at a time.
   */
  copy(target, targetStart = 0, srcStart = 0, srcEnd = 0) {
    const { length } = target;
    const srcLength = (srcEnd === undefined && Math.min(this.length, srcEnd)) || this.length;
    const copied = 0;
    while (targetStart < length && srcStart < srcLength) {
      target[targetStart] = this[srcStart];
      targetStart += 1;
      srcStart += 1;
    }
    return copied;
  },

  _keys: { then: true, lastChunk: true, chunks: true },
};

Object.keys(StreamingFunctions).forEach((key) => {
  StreamingFunctions._keys[key] = true;
});

const StreamingBuffer = (chunks) => {
  const buf = Buffer.from("NotUsed");
  Object.assign(buf, StreamingFunctions);
  buf.addChunks(chunks);
  return new Proxy(buf, handler);
};

const asyncIteratorToBuffer = async (readable) => {
  if (ArrayBuffer.isView(readable)) return readable;
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
    Stats.BufferStats.add("Read Async", `Read async buffer ${chunks.length}`, 1024);
  }
  Stats.BufferStats.reset();
  return StreamingBuffer(chunks);
};

module.exports = asyncIteratorToBuffer;
