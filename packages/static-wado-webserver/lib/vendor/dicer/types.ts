import type { WritableOptions } from 'node:stream';

/** Parsed multipart part headers (lowercase names, array values). */
export type MultipartHeaders = Record<string, string[]>;

export interface HeaderParserConfig {
  maxHeaderPairs?: number;
}

export interface DicerConfig extends WritableOptions, HeaderParserConfig {
  boundary?: string;
  headerFirst?: boolean;
  partHwm?: number;
}
