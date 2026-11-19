import { color, part } from 'fluidcad/core';
import { envelopes } from './envelopes.js';
import { boardHeight, layoutParams } from './layout.js';
import { boardThickness, components, holes, switches } from './pcb-reference.js';
import { RIBS, bridge, circleBodies, edgeRect, outlineBody, reachIntoMiddle, rectBodies, shellParams, usbOpening, worldBox } from './shell.js';

// Bottom shell of the keyboard without magnetic connectors: one piece for both halves and
// the middle. The parting surface to the top shell is the top of each board.
//
// - Halves: rest with their edge on a surrounding ledge and are clamped by the top plates
//   (the key boards have no mounting holes). The outer wall rises to the top of the plates,
//   so the plates sit recessed in a pocket and the side shows one flat wall. Crush ribs on
//   the inside of the wall hold the plates (RIBS in shell.js).
//   With tenting (inside up, outside down) a wedge grows underneath
//   down to the desk. It is modelled solid: a closed cavity would have a shallow sloped
//   ceiling that cannot be printed without enclosed supports. The slicer's infill keeps
//   the wedge light.
// - Middle: mounted upside down. Three M2 screws from below go through H5–H7 into heat-set
//   inserts in the middle cover and hold bottom shell, board and cover together. With
//   tenting the middle stands on a pedestal; access holes for a screwdriver and for the
//   reset button reach up from the desk side.
// - Cable pass: at each inner edge a channel for the FFC cable from J4/J5 to the middle.
// - Reliefs: where hotswap sockets or the Helios header pins reach over the ledge, it is
//   cut back.

// access: hole from the desk up to the floor, wide enough for a screwdriver shaft of 10 mm.
const SCREW = { hole: 2.4, head: 4.4, headDepth: 2.0, boss: 6, access: 11 };
const RESET_HOLE = 3.0;
// Cutting bodies at the parting surface are slightly larger than the outer wall of the half:
// coincident side faces otherwise make the cut fail silently in OpenCascade.
const OVERLAP = 0.05;
const CABLE = { y: [-50, -28], intoHalf: 8, intoMiddle: 5 };
const RELIEF = 0.5;
// Solder side of the Helios headers under the upside-down middle board (KiCad pads ± margin).
const HELIOS_PINS = { x: 8.9, y: [-35, 0.5] };

/** Footprint of an envelope over all its steps. */
function footprint(name) {
  const st = envelopes[name].steps;
  return {
    min: [Math.min(...st.map(t => t.min[0])), Math.min(...st.map(t => t.min[1]))],
    max: [Math.max(...st.map(t => t.max[0])), Math.max(...st.map(t => t.max[1]))],
  };
}

export const bottomShell = part('Molekula · Bottom shell', () => {
  const p = layoutParams();
  const s = shellParams();
  const PT = boardThickness;
  const zh = boardHeight(p);
  const bottom = -(p.underSpace + p.floor);
  // Down to the desk: with tenting the underside of the halves reaches far down on the
  // inside; the rest is trimmed at the desk. The middle stands on a solid pedestal.
  const depth = p.tenting > 0 ? zh / Math.cos((p.tenting * Math.PI) / 180) + 5 : 0;

  // Three separate bodies: left and right half (tilted) and the middle with the bridges
  // (flat). They are not fused: boolean operations between tilted and flat bodies are
  // unreliable in FluidCAD (they fail silently or lose bodies). The bodies overlap at the
  // seam; tools/print-files.mjs fuses them into one solid for printing. Every cut acts on
  // all three, each with its own separate target body.
  const left = outlineBody('left', p, s.clearance + s.wall, bottom - depth, PT + s.plate, 'Left · outside');
  const right = outlineBody('right', p, s.clearance + s.wall, bottom - depth, PT + s.plate, 'Right · outside');
  const middle = outlineBody('middle', p, s.clearance + s.wall, -zh, PT, 'Middle · outside');
  for (const side of [-1, 1]) bridge(side, p, s, 0, zh + PT, `Bridge ${side < 0 ? 'left' : 'right'}`, { add: [middle] });
  const all = [left, right, middle];
  if (depth > 0) {
    worldBox(p, -300, 0, 'Below the desk', { remove: [left, right] });
    for (const [half, side, R] of [[left, -1, 'Left'], [right, 1, 'Right']]) {
      // Tilted, the wedge under the inner edge swings out toward the middle; trim it past
      // the centre line so the halves do not overlap.
      rectBodies('world', p, [{ center: [-side * 150, -40], width: 300, height: 400 }], -300, 300, `${R} · past the centre`, { remove: [half] });
    }
  }

  // Halves: space under the board with ledge, board pocket, cable pass, sockets.
  // Above the tilted parting surface everything belongs to the top shell (affects the
  // middle and the bridges).
  const sg = footprint('socket');
  const sc = [(sg.min[0] + sg.max[0]) / 2, (sg.min[1] + sg.max[1]) / 2];
  for (const [region, side, half] of [['left', -1, left], ['right', 1, right]]) {
    const R = region === 'left' ? 'Left' : 'Right';
    const target = [half, middle];
    if (p.tenting > 0) outlineBody(region, p, s.clearance + s.wall + OVERLAP, PT, PT + 60, `${R} · above the parting surface`, { remove: [middle] });
    outlineBody(region, p, -s.ledge, -p.underSpace, 0.01, `${R} · space under the board`, { remove: target });
    outlineBody(region, p, s.clearance, 0, PT + s.plate + 1, `${R} · board and plate pocket`, { remove: target });
    // Into the middle far enough to cross its wall also when the half is splayed.
    const into = Math.min(14.5 - p.cableGap - CABLE.intoMiddle, ...CABLE.y.map(y => side * reachIntoMiddle(side, p, y, 9.5)));
    const x0 = side * into;
    const x1 = side * (14.5 + CABLE.intoHalf);
    rectBodies(region, p,
      [{ center: [(x0 + x1) / 2, (CABLE.y[0] + CABLE.y[1]) / 2], width: Math.abs(x1 - x0), height: CABLE.y[1] - CABLE.y[0] }],
      -p.underSpace, PT + s.plate + 1, `${R} · cable pass`, { remove: target });
    rectBodies(region, p,
      switches.filter(t => t.board === region).map(t => {
        const w = (t.rotation * Math.PI) / 180;
        return {
          center: [t.center[0] + sc[0] * Math.cos(w) - sc[1] * Math.sin(w), t.center[1] + sc[0] * Math.sin(w) + sc[1] * Math.cos(w)],
          width: sg.max[0] - sg.min[0] + 2 * RELIEF,
          height: sg.max[1] - sg.min[1] + 2 * RELIEF,
          rotation: t.rotation,
        };
      }),
      -p.underSpace, 0.01, `${R} · socket relief`, { remove: [half] });
    // Crush ribs: from just above the board to below the lead-in at the top of the pocket.
    rectBodies(region, p,
      RIBS.places[region].map(r => edgeRect(r, s.clearance - RIBS.depth, s.clearance + 0.1, RIBS.width)),
      PT + 0.05, PT + s.plate - RIBS.leadIn, `${R} · crush rib`, { add: [half] });
  }

  // Middle, in the frame of the upside-down board: KiCad X is mirrored.
  outlineBody('middle', p, -s.ledge, -p.underSpace, 0.01, 'Middle · space under the board', { remove: all });
  outlineBody('middle', p, s.clearance, 0, PT + 1, 'Middle · board pocket', { remove: all });
  rectBodies('middle', p,
    [{ center: [0, (HELIOS_PINS.y[0] + HELIOS_PINS.y[1]) / 2], width: 2 * HELIOS_PINS.x, height: HELIOS_PINS.y[1] - HELIOS_PINS.y[0] }],
    -p.underSpace, 0.01, 'Middle · Helios header relief', { remove: [middle] });
  // The USB-C plug reaches a little below the top of the board: notch in the wall.
  const usb = usbOpening();
  rectBodies('middle', p, [{ center: [usb.x, usb.y0 + 10], width: usb.width, height: 20 }],
    usb.z0, PT + 1, 'Middle · USB-C notch', { remove: [middle] });
  const screws = holes.filter(b => b.board === 'middle').map(b => [-b.center[0], b.center[1]]);
  const reset = components.find(b => b.ref === 'SW37');
  circleBodies('middle', p, screws, SCREW.boss, -p.underSpace, 0, 'Middle · screw boss', { add: [middle] });
  // From the desk side: with tenting the screw heads sit deep in the pedestal. An access hole
  // for the screwdriver reaches from the desk up to the floor of the middle, the head sinks
  // into the floor and the screw boss.
  circleBodies('middle', p, screws, SCREW.access, -zh - 1, bottom, 'Middle · screwdriver access', { remove: all });
  circleBodies('middle', p, screws, SCREW.hole, -zh - 1, 1, 'Middle · screw hole', { remove: all });
  circleBodies('middle', p, screws, SCREW.head, -zh - 1, bottom + SCREW.headDepth, 'Middle · screw head', { remove: all });
  circleBodies('middle', p, [[-reset.center[0], reset.center[1]]], RESET_HOLE, -zh - 1, 1, 'Middle · reset access', { remove: all });

  color('#4a4f57', ...all);
});
