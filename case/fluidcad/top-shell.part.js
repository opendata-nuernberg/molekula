import { color, part } from 'fluidcad/core';
import { envelopes } from './envelopes.js';
import { boardHeight, layoutParams } from './layout.js';
import { boardThickness, components, switches } from './pcb-reference.js';
import { bridge, circleBodies, outlineBody, rectBodies, shellParams } from './shell.js';

// Top shell of the keyboard without magnetic connectors: one piece for both halves and the
// middle.
//
// - Halves: surrounding rim. A thin lip reaches clampOverlap over the board edge and clamps
//   the board onto the ledge of the bottom shell. Above it the rim is cut back around the
//   board and around every keycap.
// - Middle: closed cover over Helios, FFC sockets and cables, with a hole for the encoder
//   bushing and a cut-out for the USB-C plug.
// - Bridges over the gap between the halves and the middle cover the FFC cables.

// Encoder EC11: threaded bushing Ø 7 mm.
const ENCODER_BUSHING = 7;
const ENCODER_CLEARANCE = 0.4;
// USB-C plug with overmould, centred on the Helios receptacle.
const USB = { width: 12.5, height: 7, receptacleY: [1.616, 4.644], receptacleZ: [0.111, 3.272] };
// Cutting bodies at the parting surface are slightly larger than the outer wall of the half:
// coincident side faces otherwise make the cut fail silently in OpenCascade.
const OVERLAP = 0.05;
const CABLE = { y: [-50, -28], intoHalf: 8, intoMiddle: 5, height: 3 };
// Relief in the upper cover wall for the edge of the Helios board (half width, half depth around y = 0).
const HELIOS_EDGE = { x: 9.5, y: 1.4 };

/** Rectangle around all steps of an envelope. */
function footprint(name) {
  const st = envelopes[name].steps;
  return {
    min: [Math.min(...st.map(s => s.min[0])), Math.min(...st.map(s => s.min[1]))],
    max: [Math.max(...st.map(s => s.max[0])), Math.max(...st.map(s => s.max[1]))],
  };
}

export const topShell = part('Molekula · Top shell', () => {
  const p = layoutParams();
  const s = shellParams();
  const PT = boardThickness;
  const zh = boardHeight(p);
  const top = PT + s.rimHeight;

  // Three separate bodies: rims of the halves (tilted) and the cover of the middle with the
  // bridges (flat), not fused, as in the bottom shell (see there). Below the tilted parting
  // surface everything belongs to the bottom shell (affects the cover and the bridges).
  const left = outlineBody('left', p, s.clearance + s.wall, PT, top, 'Left · rim');
  const right = outlineBody('right', p, s.clearance + s.wall, PT, top, 'Right · rim');
  const middle = outlineBody('middle', p, s.clearance + s.wall, PT, PT + s.coverHeight, 'Middle · cover');
  for (const side of [-1, 1]) bridge(side, p, s, zh + PT, zh + top, `Bridge ${side < 0 ? 'left' : 'right'}`, { add: [middle] });
  const target = [left, right, middle];
  if (p.tenting > 0) {
    for (const region of ['left', 'right']) {
      outlineBody(region, p, s.clearance + s.wall + OVERLAP, -80, PT, `${region === 'left' ? 'Left' : 'Right'} · below the parting surface`, { remove: [middle] });
    }
  }

  // Halves: clamp lip, opening above the board, clearance around the keycaps, cable pass.
  const cap = footprint('keycap');
  const c = [(cap.min[0] + cap.max[0]) / 2, (cap.min[1] + cap.max[1]) / 2];
  for (const [region, side] of [['left', -1], ['right', 1]]) {
    const R = region === 'left' ? 'Left' : 'Right';
    outlineBody(region, p, -s.clampOverlap, PT - 1, top + 1, `${R} · inner opening`, { remove: target });
    outlineBody(region, p, s.clearance, PT + s.lip, top + 1, `${R} · opening above the lip`, { remove: target });
    rectBodies(region, p,
      switches.filter(t => t.board === region).map(t => {
        const w = (t.rotation * Math.PI) / 180;
        return {
          center: [t.center[0] + c[0] * Math.cos(w) - c[1] * Math.sin(w), t.center[1] + c[0] * Math.sin(w) + c[1] * Math.cos(w)],
          width: cap.max[0] - cap.min[0] + 2 * s.keycapClearance,
          height: cap.max[1] - cap.min[1] + 2 * s.keycapClearance,
          rotation: t.rotation,
        };
      }),
      PT + s.lip, top + 1, `${R} · keycap clearance`, { remove: target });
    const x0 = side * (14.5 - p.cableGap - CABLE.intoMiddle);
    const x1 = side * (14.5 + CABLE.intoHalf);
    rectBodies(region, p,
      [{ center: [(x0 + x1) / 2, (CABLE.y[0] + CABLE.y[1]) / 2], width: Math.abs(x1 - x0), height: CABLE.y[1] - CABLE.y[0] }],
      PT - 1, PT + CABLE.height, `${R} · cable pass`, { remove: target });
  }

  // Middle, in the frame of the upside-down board (KiCad X mirrored).
  outlineBody('middle', p, s.clearance, PT - 1, PT + s.coverHeight - s.coverThickness, 'Middle · space under the cover', { remove: target });
  const enc = components.find(b => b.ref === 'SW38');
  circleBodies('middle', p, [[-enc.center[0], enc.center[1]]], ENCODER_BUSHING + 2 * ENCODER_CLEARANCE, PT, PT + s.coverHeight + 1, 'Middle · encoder bushing', { remove: target });
  // Helios on the KiCad top side with headers, model offset z -7.8; after flipping the board
  // the receptacle sits above it. z' = PT - z.
  const helios = components.find(b => b.ref === 'J13');
  const hm = helios.models.find(m => m.file === 'splinky-headers.step');
  const receptacleY = USB.receptacleY.map(y => helios.center[1] + hm.offset[1] + y);
  const receptacleZ = USB.receptacleZ.map(z => PT - (PT + hm.offset[2] + z));
  const zUsb = (receptacleZ[0] + receptacleZ[1]) / 2;
  rectBodies('middle', p,
    [{ center: [-helios.center[0], receptacleY[0] + 10], width: USB.width, height: 20 }],
    zUsb - USB.height / 2, zUsb + USB.height / 2, 'Middle · USB-C', { remove: target });
  // The Helios board reaches the cover wall at its upper edge: relieve the wall there.
  rectBodies('middle', p,
    [{ center: [-helios.center[0], 0], width: 2 * HELIOS_EDGE.x, height: 2 * HELIOS_EDGE.y }],
    PT - 1, PT + s.coverHeight - s.coverThickness, 'Middle · Helios relief at the wall', { remove: target });

  color('#6b7380', ...target);
});
