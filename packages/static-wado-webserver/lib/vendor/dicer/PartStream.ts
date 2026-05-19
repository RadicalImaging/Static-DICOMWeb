import { Readable } from 'node:stream';

export default class PartStream extends Readable {
  _read(_size: number): void {}
}
