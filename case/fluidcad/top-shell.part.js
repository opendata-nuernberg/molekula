import { color, part } from 'fluidcad/core';
import { INNER_EDGE_X, boardHeight, layoutParams } from './layout.js';
import { boardThickness, components, holes, switches } from './pcb-reference.js';
import { ENCODER, bridgeY, circleBodies, gapCorners, outlineBody, reachIntoMiddle, rectBodies, shellParams, usbOpening } from './shell.js';

// Top shell of the keyboard without magnetic connectors, in three print parts. Each has one
// flat top face, so it prints upside down on that face without supports.
//
// - Top plates (left, right): a plate of constant thickness lying on the key board, recessed
//   in the pocket of the bottom shell whose wall rises to the top of the plate. It hides the
//   board; the switches are pushed through its cut-outs into the hotswap sockets and their
//   clips catch under it, as on a normal Choc plate. Crush ribs in the pocket (RIBS in
//   shell.js), the switches and the middle cover hold it. No screws.
// - Middle cover: closed cover over Helios, FFC sockets and cables with a hole for the
//   encoder body and a cut-out for the USB-C plug. Its flat top reaches over the cable
//   gap onto the inner edges of both plates and clamps them. Three M2 screws
//   from below through the bottom shell and H5–H7 go into heat-set inserts in its bosses.
//
// Assembly: boards and cables into the bottom shell, the plates pressed into their pockets,
// the middle cover on top, screws from below, then the switches.

// Clearance around the encoder body, which reaches up to the top of the cover.
const ENCODER_CLEARANCE = 0.35;
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
// Gap between the middle cover and the pocket wall of the bottom shell next to it.
const PLATE_GAP = 0.2;
// Heat-set inserts M2 in the middle cover: hole for the insert, then room for the screw tip.
// The hole for the screw tip stops `tipCover` below the top of the cover.
const INSERT = { boss: 6, hole: 3.2, depth: 4.5, tip: 2.0, tipCover: 1.2 };

export const topShell = part('Molekula · Top shell', () => {
  const p = layoutParams();
  const s = shellParams();
  const PT = boardThickness;
  const zh = boardHeight(p);
  const outside = s.clearance + s.wall;

  // Three separate bodies, one per print part.
  const inside = s.clearance - s.plateGap;
  const left = outlineBody('left', p, inside, PT, PT + s.plate, 'Left · top plate');
  const right = outlineBody('right', p, inside, PT, PT + s.plate, 'Right · top plate');
  const middle = outlineBody('middle', p, outside, PT, PT + s.coverHeight, 'Middle · cover');
  const plates = { left, right };

  // Middle cover over the cable gap and onto the plates, flat top at cover height.
  for (const side of [-1, 1]) {
    rectBodies('world', p, [{ corners: gapCorners(side, p, bridgeY(s), 11.5, 14.5 + s.overlap) }],
      zh + PT, zh + PT + s.coverHeight, `Middle · cover over the ${side < 0 ? 'left' : 'right'} plate`, { add: [middle] });
  }
  // Below the top of the plates (and a little around the wall of the pocket) everything
  // belongs to the bottom shell and the plates.
  for (const region of ['left', 'right']) {
    outlineBody(region, p, outside + PLATE_GAP, -10, PT + s.plate,
      `${region === 'left' ? 'Left' : 'Right'} · room for the plate`, { remove: [middle] });
  }
  // The same once more as a plain box under the cover over the plate: with steep tenting
  // and splay the cut above alone sometimes fails silently there.
  for (const [region, side] of [['left', -1], ['right', 1]]) {
    const [y0, y1] = bridgeY(s);
    const x0 = INNER_EDGE_X - outside - PLATE_GAP;
    const x1 = INNER_EDGE_X + s.overlap + 1;
    rectBodies(region, p, [{ center: [(side * (x0 + x1)) / 2, (y0 - 1 + y1 + 0.6) / 2], width: x1 - x0, height: y1 - y0 + 1.6 }],
      -10, PT + s.plate, `${region === 'left' ? 'Left' : 'Right'} · room for the plate under the cover`, { remove: [middle] });
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
  }

  // Cable pass at the inner edges, through the plate and into the cover.
  for (const [region, side] of [['left', -1], ['right', 1]]) {
    const R = region === 'left' ? 'Left' : 'Right';
    // Into the middle far enough to cross its wall also when the half is splayed.
    const into = Math.min(14.5 - p.cableGap - CABLE.intoMiddle, ...CABLE.y.map(y => side * reachIntoMiddle(side, p, y, 9.5)));
    const x0 = side * into;
    const x1 = side * (14.5 + CABLE.intoHalf);
    rectBodies(region, p,
      [{ center: [(x0 + x1) / 2, (CABLE.y[0] + CABLE.y[1]) / 2], width: Math.abs(x1 - x0), height: CABLE.y[1] - CABLE.y[0] }],
      PT - 1, PT + CABLE.height, `${R} · cable pass`, { remove: [plates[region], middle] });
  }

  // Middle, in the frame of the upside-down board (KiCad X mirrored).
  outlineBody('middle', p, s.clearance, PT - 1, PT + s.coverHeight - s.coverThickness, 'Middle · space under the cover', { remove: [middle] });
  const enc = components.find(b => b.ref === 'SW38');
  const encBody = ENCODER.body + 2 * ENCODER_CLEARANCE;
  rectBodies('middle', p, [{ center: [-enc.center[0], enc.center[1]], width: encBody, height: encBody }],
    PT, PT + s.coverHeight + 1, 'Middle · encoder body', { remove: [middle] });
  const usb = usbOpening();
  rectBodies('middle', p, [{ center: [usb.x, usb.y0 + 10], width: usb.width, height: 20 }],
    usb.z0, usb.z1, 'Middle · USB-C', { remove: [middle] });
  // The Helios board reaches the cover wall at its upper edge: relieve the wall there.
  const helios = components.find(b => b.ref === 'J13');
  rectBodies('middle', p,
    [{ center: [-helios.center[0], 0], width: 2 * HELIOS_EDGE.x, height: 2 * HELIOS_EDGE.y }],
    PT - 1, PT + s.coverHeight - s.coverThickness, 'Middle · Helios relief at the wall', { remove: [middle] });

  // Bosses with heat-set inserts over H5–H7; the screws come from below.
  const screws = holes.filter(b => b.board === 'middle').map(b => [-b.center[0], b.center[1]]);
  circleBodies('middle', p, screws, INSERT.boss, PT, PT + s.coverHeight - s.coverThickness + 0.1, 'Middle · insert boss', { add: [middle] });
  circleBodies('middle', p, screws, INSERT.hole, PT - 1, PT + INSERT.depth, 'Middle · insert hole', { remove: [middle] });
  circleBodies('middle', p, screws, INSERT.tip, PT - 1, PT + s.coverHeight - INSERT.tipCover, 'Middle · screw tip', { remove: [middle] });

  color('#6b7380', left, right, middle);
});
