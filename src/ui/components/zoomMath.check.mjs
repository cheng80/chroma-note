import assert from 'node:assert/strict';

import { clamp, clampOffset, contentCoordinateAtFocal, offsetForFocal } from './zoomMath.ts';

assert.equal(clamp(0.5, 1, 4), 1);
assert.equal(clamp(5, 1, 4), 4);
assert.equal(clampOffset(80, 100, 2), 50);
assert.equal(clampOffset(20, 100, 1), 0);

const focal = 75;
const viewport = 100;
const contentCoordinate = contentCoordinateAtFocal(focal, viewport, 10, 2);
const movedFocal = 80;
const nextOffset = offsetForFocal(contentCoordinate, movedFocal, viewport, 3);
assert.equal(viewport / 2 + nextOffset + contentCoordinate * 3, movedFocal);

console.log('zoomMath check passed');
