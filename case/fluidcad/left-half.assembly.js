import { assembly, insert } from 'fluidcad/core';
import { leftCase } from './left-case-half.part.js';
import { magnetConnectorLeft } from './magnet-connector-left.part.js';
import { switchesLeft } from './switches-left.part.js';

// Left half of the split version: bottom case, switches with keycaps and sockets, and the
// magnetic connector board in its mounted position. All parts are in the KiCad frame of the
// left half, the main board lies at z = 0 … boardThickness. The height of the bottom case
// relative to it is not fixed yet, so its floor overlaps everything below the board.
export const leftHalf = assembly('Molekula · Left half', () => {
  insert(leftCase).grounded().name('Bottom case left');
  insert(magnetConnectorLeft).grounded().name('Magnetic connector left');
  insert(switchesLeft).grounded().name('Switches left');
});
