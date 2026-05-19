import { Writable } from 'node:stream';
import StreamSearch from 'streamsearch';
import PartStream from './PartStream.js';
import HeaderParser from './HeaderParser.js';
const DASH = 45;
const B_ONEDASH = Buffer.from('-');
const B_CRLF = Buffer.from('\r\n');
const EMPTY_FN = () => { };
export default class Dicer extends Writable {
    constructor(cfg) {
        super(cfg);
        this._dashes = 0;
        this._parts = 0;
        this._finished = false;
        this._realFinish = false;
        this._isPreamble = true;
        this._justMatched = false;
        this._firstWrite = true;
        this._inHeader = true;
        this._ignoreData = false;
        this._partOpts = {};
        this._pause = false;
        if (!cfg || (!cfg.headerFirst && typeof cfg.boundary !== 'string'))
            throw new TypeError('Boundary required');
        if (typeof cfg.boundary === 'string')
            this.setBoundary(cfg.boundary);
        else
            this._bparser = undefined;
        this._headerFirst = cfg.headerFirst;
        this._partOpts = typeof cfg.partHwm === 'number' ? { highWaterMark: cfg.partHwm } : {};
        this._hparser = new HeaderParser(cfg);
        this._hparser.on('header', (header) => {
            this._inHeader = false;
            this._part?.emit('header', header);
        });
        this._hparser.on('error', (err) => {
            if (this._part && !this._ignoreData) {
                this._part.emit('error', err);
                this._part.push(null);
            }
            this.emit('error', err);
        });
    }
    emit(event, ...args) {
        if (event !== 'finish' || this._realFinish) {
            return super.emit(event, ...args);
        }
        if (this._finished)
            return false;
        process.nextTick(() => {
            this.emit('error', new Error('Unexpected end of multipart data'));
            if (this._part && !this._ignoreData) {
                const type = this._isPreamble ? 'Preamble' : 'Part';
                this._part.emit('error', new Error(`${type} terminated early due to unexpected end of multipart data`));
                this._part.push(null);
                process.nextTick(() => {
                    this._realFinish = true;
                    this.emit('finish');
                    this._realFinish = false;
                });
                return;
            }
            this._realFinish = true;
            this.emit('finish');
            this._realFinish = false;
        });
        return false;
    }
    _write(data, _encoding, cb) {
        if (!this._hparser || !this._bparser)
            return cb();
        if (this._headerFirst && this._isPreamble) {
            if (!this._part) {
                this._part = new PartStream(this._partOpts);
                if (this.listenerCount('preamble') > 0)
                    this.emit('preamble', this._part);
                else
                    ignore(this);
            }
            const r = this._hparser.push(data);
            if (!this._inHeader && r !== undefined && r < data.length)
                data = data.subarray(r);
            else
                return cb();
        }
        if (this._firstWrite) {
            this._bparser.push(B_CRLF);
            this._firstWrite = false;
        }
        this._bparser.push(data);
        if (this._pause)
            this._cb = cb;
        else
            cb();
    }
    reset() {
        this._part = undefined;
        this._bparser = undefined;
        this._hparser = undefined;
    }
    setBoundary(boundary) {
        this._bparser = new StreamSearch(`\r\n--${boundary}`, onInfo.bind(this));
    }
}
function onInfo(isMatch, data, start, end) {
    let buf;
    let i = 0;
    let r;
    let ev;
    let shouldWriteMore = true;
    if (!this._part && this._justMatched && data) {
        while (this._dashes < 2 && start + i < end) {
            if (data[start + i] === DASH) {
                ++i;
                ++this._dashes;
            }
            else {
                if (this._dashes)
                    buf = B_ONEDASH;
                this._dashes = 0;
                break;
            }
        }
        if (this._dashes === 2) {
            if (start + i < end && this.listenerCount('trailer') > 0)
                this.emit('trailer', data.subarray(start + i, end));
            this.reset();
            this._finished = true;
            if (this._parts === 0) {
                this._realFinish = true;
                this.emit('finish');
                this._realFinish = false;
            }
        }
        if (this._dashes)
            return;
    }
    if (this._justMatched)
        this._justMatched = false;
    if (!this._part) {
        this._part = new PartStream(this._partOpts);
        this._part._read = () => {
            unpause(this);
        };
        ev = this._isPreamble ? 'preamble' : 'part';
        if (this.listenerCount(ev) > 0)
            this.emit(ev, this._part);
        else
            ignore(this);
        if (!this._isPreamble)
            this._inHeader = true;
    }
    const part = this._part;
    const hparser = this._hparser;
    if (data && start < end && !this._ignoreData && part && hparser) {
        if (this._isPreamble || !this._inHeader) {
            if (buf)
                shouldWriteMore = part.push(buf) !== false;
            shouldWriteMore = part.push(data.subarray(start, end)) !== false;
            if (!shouldWriteMore)
                this._pause = true;
        }
        else if (!this._isPreamble && this._inHeader) {
            if (buf)
                hparser.push(buf);
            r = hparser.push(data.subarray(start, end));
            if (!this._inHeader && r !== undefined && r < end)
                onInfo.call(this, false, data, start + r, end);
        }
    }
    if (isMatch && part && hparser) {
        hparser.reset();
        if (this._isPreamble) {
            this._isPreamble = false;
        }
        else {
            ++this._parts;
            part.on('end', () => {
                if (--this._parts === 0) {
                    if (this._finished) {
                        this._realFinish = true;
                        this.emit('finish');
                        this._realFinish = false;
                    }
                    else {
                        unpause(this);
                    }
                }
            });
        }
        part.push(null);
        this._part = undefined;
        this._ignoreData = false;
        this._justMatched = true;
        this._dashes = 0;
    }
}
function ignore(self) {
    if (self._part && !self._ignoreData) {
        self._ignoreData = true;
        self._part.on('error', EMPTY_FN);
        self._part.resume();
    }
}
function unpause(self) {
    if (!self._pause)
        return;
    self._pause = false;
    if (self._cb) {
        const cb = self._cb;
        self._cb = undefined;
        cb();
    }
}
