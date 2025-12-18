import * as cs3d from '@cornerstonejs/core';
import { createCanvas } from 'canvas';
import { getRenderedBuffer } from './api';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!DOCTYPE html>`, { pretendToBeVisual: true });
global.window = dom.window;
global.document = window.document;

export default { cs3d, createCanvas, getRenderedBuffer };
export { cs3d, createCanvas, getRenderedBuffer };
