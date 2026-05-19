import { EventEmitter } from 'node:events';
import StreamSearch from 'streamsearch';
import type { HeaderParserConfig, MultipartHeaders } from './types.js';

const B_DCRLF = Buffer.from('\r\n\r\n');
const RE_CRLF = /\r\n/g;
// eslint-disable-next-line no-control-regex
const RE_HDR = /^([^:]+):[ \t]?([\x00-\xFF]+)?$/;
const MAX_HEADER_PAIRS = 2000; // From node's http.js
const MAX_HEADER_SIZE = 64 * 1024;

export default class HeaderParser extends EventEmitter {
  nread = 0;
  npairs = 0;
  maxHeaderPairs: number;
  buffer = '';
  header: MultipartHeaders = {};
  finished = false;
  ss: StreamSearch;

  constructor(cfg?: HeaderParserConfig) {
    super();

    this.maxHeaderPairs =
      cfg && typeof cfg.maxHeaderPairs === 'number' ? cfg.maxHeaderPairs : MAX_HEADER_PAIRS;
    this.ss = new StreamSearch(B_DCRLF, (isMatch, data, start, end) => {
      if (this.finished) return;

      if (data) {
        const chunkLen = end - start;
        if (this.nread + chunkLen > MAX_HEADER_SIZE) {
          this._abortOversized();
          return;
        }
        this.nread += chunkLen;
        this.buffer += data.toString('latin1', start, end);
      }
      if (isMatch) this._finish();
    });
  }

  _abortOversized(): void {
    if (this.finished) return;
    this.finished = true;
    this.emit(
      'error',
      new Error(`Multipart part header exceeds maximum size of ${MAX_HEADER_SIZE} bytes`)
    );
  }

  push(data: Buffer): number | undefined {
    const r = this.ss.push(data);
    if (this.finished) return r;
  }

  reset(): void {
    this.finished = false;
    this.buffer = '';
    this.header = {};
    this.ss.reset();
  }

  _finish(): void {
    let hadError = false;
    if (this.buffer) hadError = !parseHeader(this);
    this.ss.matches = this.ss.maxMatches;
    const header = this.header;
    this.header = {};
    this.buffer = '';
    this.finished = true;
    this.nread = this.npairs = 0;
    if (!hadError) this.emit('header', header);
  }
}

function parseHeader(self: HeaderParser): boolean {
  if (self.npairs === self.maxHeaderPairs) return true;

  const lines = self.buffer.split(RE_CRLF);
  const len = lines.length;
  let m: RegExpExecArray | null;
  let h: string | undefined;
  let modded = false;

  for (let i = 0; i < len; ++i) {
    const line = lines[i];
    if (line.length === 0) continue;

    if (line[0] === '\t' || line[0] === ' ') {
      if (!h) {
        self.emit('error', new Error('Unexpected folded header value'));
        return false;
      }
      const values = self.header[h];
      if (values) values[values.length - 1] += line;
    } else {
      m = RE_HDR.exec(line);
      if (m) {
        h = m[1].toLowerCase();
        if (m[2]) {
          if (self.header[h] === undefined) self.header[h] = [m[2]];
          else self.header[h].push(m[2]);
        } else {
          self.header[h] = [''];
        }
        if (++self.npairs === self.maxHeaderPairs) break;
      } else {
        self.buffer = line;
        modded = true;
        break;
      }
    }
  }
  if (!modded) self.buffer = '';

  return true;
}
