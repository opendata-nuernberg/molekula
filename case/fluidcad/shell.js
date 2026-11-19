import { circle, extrude, offset, param, plane, sketch } from 'fluidcad/core';
import { boardThickness, boards, components } from './pcb-reference.js';
import { boardHeight, halfTilt } from './layout.js';
import { closed, rectangle, trace } from './outline.js';

// Building blocks shared by the bottom and the top shell.
//
// Every body is sketched and extruded directly in its final position: for the halves the
// sketch plane is already tilted (see sketchPlane()). That way all unions and cuts run as
// .add()/.remove() while extruding, which FluidCAD computes with a small tolerance.
// fuse() and subtract() on bodies that were moved afterwards work without tolerance and
// fail silently at the tilted seam (the result stays unchanged).
//
// Coordinates are in the frame of the respective board: KiCad XY, z = 0 board bottom.
// Region 'world': XY as in KiCad, z from the desk, not tilted.

/** Case parameters, called in the body of every shell part. Values are design values. */
export function shellParams() {
  return {
    wall: param('Wall thickness (mm)', 1.8, 'number', { min: 1.2, max: 3, step: 0.1 }),
    clearance: param('PCB clearance per side (mm)', 0.6, 'number', { min: 0.2, max: 1.5, step: 0.1 }),
    ledge: param('Ledge under the PCB edge (mm)', 1.0, 'number', { min: 0.5, max: 3, step: 0.1 }),
    plate: param('Top plate thickness (mm)', 2.2, 'number', { min: 1.5, max: 3, step: 0.1 }),
    plateGap: param('Gap between top plate and wall (mm)', 0.2, 'number', { min: 0, max: 0.6, step: 0.05 }),
    switchCutout: param('Switch cut-out in the top plate (mm)', 14.0, 'number', { min: 13.8, max: 14.4, step: 0.05 }),
    overlap: param('Middle cover overlap onto the plates (mm)', 4, 'number', { min: 2, max: 8, step: 0.5 }),
    coverHeight: param('Middle cover height above the PCB (mm)', 7.0, 'number', { min: 4, max: 20, step: 0.1 }),
    coverThickness: param('Cover thickness (mm)', 1.4, 'number', { min: 1, max: 3, step: 0.1 }),
  };
}

/**
 * Heights measured on the first built keyboard, above the upper side of the upside-down middle
 * board. They replace the KiCad 3D models where those differ from the real assembly: the
 * Helios is soldered almost flat onto the board with its parts facing up (the model puts it
 * on 7.8 mm headers, upside down), and the encoder body is taller than in the model.
 * encoderBushing is not measured: EC11 bushings are about 5 mm long.
 */
export const MEASURED = { usbTop: 4.5, usbHeight: 3.16, encoderBody: 7.0, encoderBushing: 12.0, encoderTip: 15.6 };

/** EC11 body footprint (square) and shaft diameters. */
export const ENCODER = { body: 12.3, bushing: 7, shaft: 6 };

/**
 * Opening for the USB-C plug, centred on the Helios receptacle, in the frame of the middle
 * (KiCad X mirrored, z = 0 board bottom). The plug sits low, so the opening reaches a little
 * below the top of the board into the bottom shell. y0: the opening runs from y0 outward.
 */
export function usbOpening() {
  const helios = components.find(b => b.ref === 'J13');
  const model = helios.models.find(m => m.file === 'splinky-headers.step');
  const plug = { width: 12.5, height: 6.5 };
  const z = boardThickness + MEASURED.usbTop - MEASURED.usbHeight / 2;
  return { x: -helios.center[0], y0: helios.center[1] + model.offset[1] + 1.616, width: plug.width, z0: z - plug.height / 2, z1: z + plug.height / 2 };
}

/**
 * Sketch plane at height z0 in the frame of a region, in its final position, and the shift
 * dx that a KiCad X coordinate gets in the sketch (Y stays).
 *
 * FluidCAD's plane('xy', { rotateY, offset }) puts the origin at (0, 0, offset) and rotates
 * the plane about Y around that point. For the halves (layout.js): world = A + Ry(φ)·(X, y, z)
 * with A = (axisX, 0, zh) on the pivot axis and X = x + shift − axisX. Equating with
 * (0, 0, o) + Ry(φ)·(u, y, 0) gives u = X + a, a = (axisX + z0·sin φ)/cos φ,
 * o = zh + a·sin φ + z0·cos φ.
 */
export function sketchPlane(region, p, z0) {
  if (region === 'world') return { plane: plane('xy', { offset: z0 }), dx: 0 };
  const zh = boardHeight(p);
  if (region === 'middle') return { plane: plane('xy', { offset: zh + z0 }), dx: 0 };
  const { phi, axisX, shift } = halfTilt(region, p);
  const w = (phi * Math.PI) / 180;
  const a = (axisX + z0 * Math.sin(w)) / Math.cos(w);
  const o = zh + a * Math.sin(w) + z0 * Math.cos(w);
  return {
    plane: Math.abs(phi) > 1e-9 ? plane('xy', { rotateY: phi, offset: o }) : plane('xy', { offset: o }),
    dx: shift - axisX + a,
  };
}

/**
 * New body; with mode { add: [...] } fused into those bodies, with { remove: [...] } cut
 * from them. A cut runs against the sketch normal like cut(): its sketch therefore sits at
 * the top (z1), see start().
 */
function apply(e, mode) {
  if (mode?.add) return e.add().scope(...mode.add);
  if (mode?.remove) return e.remove().scope(...mode.remove);
  return e.new();
}

/** Height of the sketch plane: bottom for bodies, top for cuts. */
const start = (mode, z0, z1) => (mode?.remove ? z1 : z0);

const shiftSteps = (points, dx) => points.map(s => (s.length === 4 ? [s[0] + dx, s[1], s[2] + dx, s[3]] : [s[0] + dx, s[1]]));

/**
 * Outline of a board, offset by distance (positive outward), as a prism from z0 to z1 in
 * the frame of region. outline: key in boards (default: region).
 */
export function outlineBody(region, p, distance, z0, z1, name, mode = null, outline = region) {
  const b = boards[outline];
  const { plane: e, dx } = sketchPlane(region, p, start(mode, z0, z1));
  const s = sketch(e, () => {
    const edges = trace(shiftSteps([b.start], dx)[0], shiftSteps(b.steps, dx));
    if (Math.abs(distance) > 1e-9) {
      edges.forEach(k => k.guide());
      offset(distance, ...edges);
    }
  }).name(`${name} · sketch`);
  return apply(extrude(z1 - z0, s), mode).name(name);
}

/**
 * Rotated rectangles, each its own body (boolean operations only process the first part
 * of a multi-part tool body), as prisms from z0 to z1.
 * @param {{ center: number[], width: number, height: number, rotation?: number }[]} rects
 */
export function rectBodies(region, p, rects, z0, z1, name, mode = null) {
  return rects.map((r, i) => {
    const { plane: e, dx } = sketchPlane(region, p, start(mode, z0, z1));
    const s = sketch(e, () => {
      closed(rectangle([r.center[0] + dx, r.center[1]], r.width, r.height, r.rotation ?? 0));
    }).name(`${name} ${i + 1} · sketch`);
    return apply(extrude(z1 - z0, s), mode).name(rects.length > 1 ? `${name} ${i + 1}` : name);
  });
}

/** Circles with diameter d, each its own body, as cylinders from z0 to z1. */
export function circleBodies(region, p, centers, d, z0, z1, name, mode = null) {
  return centers.map((m, i) => {
    const { plane: e, dx } = sketchPlane(region, p, start(mode, z0, z1));
    const s = sketch(e, () => {
      circle([m[0] + dx, m[1]], d);
    }).name(`${name} ${i + 1} · sketch`);
    return apply(extrude(z1 - z0, s), mode).name(centers.length > 1 ? `${name} ${i + 1}` : name);
  });
}

/**
 * Crush ribs that hold the top plates in their pocket. The outer wall of each half rises to
 * the top of the plate, so the plate sits recessed in the bottom shell. Narrow vertical ribs on
 * the inner face of the wall are squeezed when the plate is pressed in and keep it in place
 * without screws or glue. Each rib sits on a straight, axis-parallel board edge (KiCad frame;
 * the boards are not exact mirror images): at is a point on the edge, n the outward normal.
 */
export const RIBS = {
  places: {
    left: [
      { at: [-138.5, -34], n: [-1, 0] }, { at: [-71.5, 0], n: [0, 1] }, { at: [-108.75, -10], n: [0, 1] },
      { at: [-127.75, -42], n: [0, -1] }, { at: [-55.5, -78], n: [0, -1] }, { at: [-66, -62], n: [-1, 0] },
      { at: [-29.75, -8], n: [0, 1] },
    ],
    right: [
      { at: [138, -34], n: [1, 0] }, { at: [71.5, 0], n: [0, 1] }, { at: [108.5, -10], n: [0, 1] },
      { at: [127.5, -42], n: [0, -1] }, { at: [55.5, -78], n: [0, -1] }, { at: [66, -62], n: [1, 0] },
      { at: [29.75, -8], n: [0, 1] },
    ],
  },
  width: 1.2, // along the edge
  depth: 0.35, // how far a rib stands out of the wall
  leadIn: 0.6, // the top of the pocket stays free of ribs, so the plate finds its place first
};

/**
 * Rectangle across a straight board edge: d from d0 to d1 outward from the edge, w wide along
 * the edge. place: { at, n } as in RIBS.
 */
export function edgeRect(place, d0, d1, w) {
  const [nx, ny] = place.n;
  const d = (d0 + d1) / 2;
  return {
    center: [place.at[0] + nx * d, place.at[1] + ny * d],
    width: nx !== 0 ? d1 - d0 : w,
    height: nx !== 0 ? w : d1 - d0,
  };
}

/**
 * Bridge between the middle and a half (world, not tilted). Fills the gap left by the panel
 * tab and the cable gap between the outer walls and reaches a little into both pockets; the
 * interiors are cut out again afterwards.
 * @param {number} side -1 left, +1 right
 */
export function bridge(side, p, s, z0, z1, name, mode = null) {
  const xMiddle = 11.5;
  const xHalf = 14.5 + p.cableGap + 1;
  const y = [-(63 + s.clearance + s.wall) + 0.1, -(8 - s.clearance - s.wall) - 0.1];
  return rectBodies(
    'world', p,
    [{ center: [(side * (xMiddle + xHalf)) / 2, (y[0] + y[1]) / 2], width: xHalf - xMiddle, height: y[1] - y[0] }],
    z0, z1, name, mode,
  )[0];
}

/** Large box in world coordinates. */
export function worldBox(p, z0, z1, name, mode = null) {
  return rectBodies('world', p, [{ center: [0, -40], width: 600, height: 400 }], z0, z1, name, mode)[0];
}
