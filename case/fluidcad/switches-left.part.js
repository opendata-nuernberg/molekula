import { load, part, rotate, translate } from 'fluidcad/core';
import { boardThickness, switches } from './pcb-reference.js';

// Choc v1 (Burnt Orange) with hotswap socket and custom keycap on every position of the
// left half, for interference checks against the case.
// Source: case/onshape/switch-with-keycap.step, imported into FluidCAD as
// imports/choc-v1-with-keycap.brep (origin at the switch centre, z = 0 top of the board).
//
// Bodies in the import, 0-based: 0 and 4 socket contacts, 1 switch, 2 keycap, 3 socket.
const MODEL = 'choc-v1-with-keycap';
const SWITCH_AND_CAP = [1, 2];
const SOCKET = [0, 3, 4];
// In the Onshape model the socket top sits 2.0 mm below the top of the board. With a
// 1.6 mm board the socket moves up by the difference to sit against the bottom.
const SOCKET_TOP_IN_MODEL = 2.0;

export const switchesLeft = part('Molekula · Switches left (Choc v1 + keycap)', () => {
  for (const s of switches.filter(s => s.board === 'left')) {
    const [x, y] = s.center;
    const upper = load(MODEL).include(...SWITCH_AND_CAP).name(`${s.ref} · switch + keycap`);
    const socket = load(MODEL).include(...SOCKET).name(`${s.ref} · socket`);
    if (s.rotation) rotate('z', s.rotation, upper, socket);
    translate(x, y, boardThickness, upper);
    translate(x, y, SOCKET_TOP_IN_MODEL, socket);
  }
});
