declare module 'streamsearch' {
  type StreamSearchCallback = (
    isMatch: boolean,
    data: Buffer | false,
    start: number,
    end: number
  ) => void;

  export default class StreamSearch {
    constructor(needle: string | Buffer, cb: StreamSearchCallback);
    push(data: Buffer): number | undefined;
    reset(): void;
    matches: number;
    maxMatches: number;
  }
}
