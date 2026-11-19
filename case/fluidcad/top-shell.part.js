import { color, part } from 'fluidcad/core';
import { boardHeight, layoutParams } from './layout.js';
import { boardThickness, components, holes, switches } from './pcb-reference.js';
import { HOOK, circleBodies, hookRect, outlineBody, rectBodies, shellParams } from './shell.js';

// Top shell of the keyboard without magnetic connectors, in three print parts. Each has one
// flat top face, so it prints upside down on that face without supports.
//
// - Top plates (left, right): a plate of constant thickness lying on the key board and on
//   the wall of the bottom shell. It hides the board; the switches are pushed through its
//   cut-outs into the hotswap sockets and their clips catch under it, as on a normal Choc
//   plate. At three outer edges a tongue at the underside slides outward under a hood of the
//   bottom shell (HOOK in shell.js). No screws.
// - Middle cover: closed cover over Helios, FFC sockets and cables with a hole for the
//   encoder bushing and a cut-out for the USB-C plug. Its flat top reaches over the cable
//   gap onto the inner edges of both plates and clamps them; next to the plates it reaches
//   down to the bottom shell, so a plate cannot slide back off its hooks. Three M2 screws
//   from below through the bottom shell and H5–H7 go into heat-set inserts in its bosses.
//
// Assembly: boards and cables into the bottom shell, each plate laid on shifted toward the
// middle and slid outward onto its hooks, the middle cover on top, screws from below, then
// the switches.

// Encoder EC11: threaded bushing Ø 7 mm.
const ENCODER_BUSHING = 7;
const ENCODER_CLEARANCE = 0.4;
// USB-C plug with overmould, centred on the Helios receptacle.
const USB = { width: 12.5, height: 7, receptacleY: [1.616, 4.644], receptacleZ: [0.111, 3.272] };
// Cutting bodies at the parting surface are slightly larger than the outer wall of the half:
// coincident side faces otherwise make the cut fail silently in OpenCascade.
const OVERLAP = 0.05;
// Cable pass at the inner edge of each half: from the middle to just over the board edge.
const CABLE = { y: [-50, -28], intoHalf: 1, intoMiddle: 5, height: 3 };
// Relief in the upper cover wall for the edge of the Helios board (half width, half depth around y = 0).
const HELIOS_EDGE = { x: 9.5, y: 1.4 };
// Choc v1: the housing is 13.8 mm square, its clips stand out 0.35 mm in X about 0.7 mm
// above the board. The plate keeps a top layer of `layer` (like a 1.2 mm Choc plate) and is
// relieved below it for the clips.
const CLIPS = { layer: 1.2, relief: [15.0, 14.0] };
// Gap between a plate and the parts of the middle cover that reach down next to it.
const PLATE_GAP = 0.2;
// Heat-set inserts M2 in the middle cover: hole for the insert, then room for the screw tip.
const INSERT = { boss: 6, hole: 3.2, depth: 4.5, tip: 2.0, tipDepth: 6.5 };
// Bridge between middle and half: y range like the bottom-shell bridge (shell.js).
const BRIDGE_Y = (s) => [-(63 + s.clearance + s.wall) + 0.1, -(8 - s.clearance - s.wall) - 0.1];

export const topShell = part('Molekula · Top shell', () => {
  const p = layoutParams();
  const s = shellParams();
  const PT = boardThickness;
  const zh = boardHeight(p);
  const outside = s.clearance + s.wall;

  // Three separate bodies, one per print part.
  const left = outlineBody('left', p, outside, PT, PT + s.plate, 'Left · top plate');
  const right = outlineBody('right', p, outside, PT, PT + s.plate, 'Right · top plate');
  const middle = outlineBody('middle', p, outside, PT, PT + s.coverHeight, 'Middle · cover');
  const plates = { left, right };

  // Middle cover over the cable gap and onto the plates, flat top at cover height.
  const [y0, y1] = BRIDGE_Y(s);
  for (const side of [-1, 1]) {
    const x0 = 11.5;
    const x1 = 14.5 + p.cableGap + s.overlap;
    rectBodies('world', p, [{ center: [(side * (x0 + x1)) / 2, (y0 + y1) / 2], width: x1 - x0, height: y1 - y0 }],
      zh + PT, zh + PT + s.coverHeight, `Middle · cover over the ${side < 0 ? 'left' : 'right'} plate`, { add: [middle] });
  }
  // Below the top of the plates (and a little around them) everything belongs to the plates.
  for (const region of ['left', 'right']) {
    outlineBody(region, p, outside + PLATE_GAP, -80, PT + s.plate,
      `${region === 'left' ? 'Left' : 'Right'} · room for the plate`, { remove: [middle] });
  }

  for (const region of ['left', 'right']) {
    const R = region === 'left' ? 'Left' : 'Right';
    const plate = plates[region];
    const places = switches.filter(t => t.board === region);
    rectBodies(region, p,
      places.map(t => ({ center: t.center, width: s.switchCutout, height: s.switchCutout, rotation: t.rotation })),
      PT - 1, PT + s.plate + 1, `${R} · switch cut-out`, { remove: [plate] });
    rectBodies(region, p,
      places.map(t => ({ center: t.center, width: CLIPS.relief[0], height: CLIPS.relief[1], rotation: t.rotation })),
      PT - 1, PT + s.plate - CLIPS.layer, `${R} · clip relief`, { remove: [plate] });
    // Hooks: notch for the hood of the bottom shell, then the tongue.
    rectBodies(region, p,
      HOOK.places[region].map(h => hookRect(region, h, s.clearance - HOOK.gap, outside + HOOK.bulge + HOOK.gap, HOOK.hood + 2 * HOOK.gap)),
      PT - 1, PT + s.plate + 1, `${R} · hood notch`, { remove: [plate] });
    rectBodies(region, p,
      HOOK.places[region].map(h => hookRect(region, h, s.clearance - HOOK.gap - 0.1, HOOK.reach, HOOK.width)),
      PT, PT + HOOK.thickness, `${R} · hook tongue`, { add: [plate] });
  }

  // Cable pass at the inner edges, through the plate and into the cover.
  for (const [region, side] of [['left', -1], ['right', 1]]) {
    const R = region === 'left' ? 'Left' : 'Right';
    const x0 = side * (14.5 - p.cableGap - CABLE.intoMiddle);
    const x1 = side * (14.5 + CABLE.intoHalf);
    rectBodies(region, p,
      [{ center: [(x0 + x1) / 2, (CABLE.y[0] + CABLE.y[1]) / 2], width: Math.abs(x1 - x0), height: CABLE.y[1] - CABLE.y[0] }],
      PT - 1, PT + CABLE.height, `${R} · cable pass`, { remove: [plates[region], middle] });
  }

  // Middle, in the frame of the upside-down board (KiCad X mirrored).
  outlineBody('middle', p, s.clearance, PT - 1, PT + s.coverHeight - s.coverThickness, 'Middle · space under the cover', { remove: [middle] });
  const enc = components.find(b => b.ref === 'SW38');
  circleBodies('middle', p, [[-enc.center[0], enc.center[1]]], ENCODER_BUSHING + 2 * ENCODER_CLEARANCE, PT, PT + s.coverHeight + 1, 'Middle · encoder bushing', { remove: [middle] });
  // Helios on the KiCad top side with headers, model offset z -7.8; after flipping the board
  // the receptacle sits above it. z' = PT - z.
  const helios = components.find(b => b.ref === 'J13');
  const hm = helios.models.find(m => m.file === 'splinky-headers.step');
  const receptacleY = USB.receptacleY.map(y => helios.center[1] + hm.offset[1] + y);
  const receptacleZ = USB.receptacleZ.map(z => PT - (PT + hm.offset[2] + z));
  const zUsb = (receptacleZ[0] + receptacleZ[1]) / 2;
  rectBodies('middle', p,
    [{ center: [-helios.center[0], receptacleY[0] + 10], width: USB.width, height: 20 }],
    zUsb - USB.height / 2, zUsb + USB.height / 2, 'Middle · USB-C', { remove: [middle] });
  // The Helios board reaches the cover wall at its upper edge: relieve the wall there.
  rectBodies('middle', p,
    [{ center: [-helios.center[0], 0], width: 2 * HELIOS_EDGE.x, height: 2 * HELIOS_EDGE.y }],
    PT - 1, PT + s.coverHeight - s.coverThickness, 'Middle · Helios relief at the wall', { remove: [middle] });

  // Bosses with heat-set inserts over H5–H7; the screws come from below.
  const screws = holes.filter(b => b.board === 'middle').map(b => [-b.center[0], b.center[1]]);
  circleBodies('middle', p, screws, INSERT.boss, PT, PT + s.coverHeight - s.coverThickness + 0.1, 'Middle · insert boss', { add: [middle] });
  circleBodies('middle', p, screws, INSERT.hole, PT - 1, PT + INSERT.depth, 'Middle · insert hole', { remove: [middle] });
  circleBodies('middle', p, screws, INSERT.tip, PT - 1, PT + INSERT.tipDepth, 'Middle · screw tip', { remove: [middle] });

  color('#6b7380', left, right, middle);
});
