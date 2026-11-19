import { param, rotate, translate } from 'fluidcad/core';
import { boardThickness, boards } from './pcb-reference.js';

// Placement of the three boards in the finished keyboard without magnetic connectors.
//
// World coordinates: XY as in KiCad (pcb-reference.js), z = 0 is the desk surface.
// Every board is built in its own frame (KiCad XY, z = 0 bottom of the board,
// z = boardThickness top) and then moved into place by a sequence of translations and
// rotations about world axes. The same sequence applies to everything attached to the
// board: switches, components and the case parts of that region.
//
// - Middle: mounted upside down (KiCad bottom side up), so encoder and Helios face up.
// - Halves: moved outward by the cable gap and tilted about an axis parallel to the inner
//   edge (tenting from the outside in only, not front to back): inner edges up, outer
//   edges down, like a roof. The setting is the wedge thickness at the middle, i.e. how
//   much higher the inner edges and the middle sit than on the flat keyboard. The angle
//   follows from it so that the outer edges just touch the desk (wedge thickness 0 there).
//   The middle sits flat at the height of the inner edges.

/** Inner edge of the halves in KiCad X (±). */
export const INNER_EDGE_X = 14.5;

/**
 * Layout parameters. Called in the body of every part so all parts share the same
 * controls. The assembly passes its values through with insert(part, { … }).
 */
export function layoutParams() {
  const p = {
    wedge: param('Center wedge thickness (mm)', 15, 'number', { min: 0, max: 40, step: 0.5 }),
    pivotOffset: param('Pivot offset inward (mm)', 0, 'number', { min: 0, max: 30, step: 0.5 }),
    cableGap: param('Cable gap (mm)', 3, 'number', { min: 1, max: 15, step: 0.5 }),
    floor: param('Floor thickness (mm)', 1.6, 'number', { min: 1.2, max: 3, step: 0.1 }),
    underSpace: param('Space under the boards (mm)', 2.5, 'number', { min: 2, max: 6, step: 0.1 }),
  };
  p.tenting = tentingAngle(p);
  return p;
}

// Outer wall plus clearance of the shells, used to compute the lift (design values from
// shell.js; a slightly larger value does no harm, the wedge is trimmed at the desk).
const OUTER_MARGIN = 2.5;

/** Horizontal distance from the pivot axis to the outer edge of the bottom shell (untilted). */
function reach(p) {
  const ax = INNER_EDGE_X + p.cableGap - p.pivotOffset;
  const b = boards.left;
  const xs = [b.start, ...b.steps].flatMap(s => (s.length === 4 ? [s[0], s[2]] : [s[0]]));
  return Math.max(...xs.map(x => Math.abs(x - p.cableGap + ax))) + OUTER_MARGIN;
}

/** Lift of the middle and the pivot axis at angle w (radians), outer edge on the desk. */
function liftAt(w, p) {
  return Math.max(0, reach(p) * Math.sin(w) - (p.floor + p.underSpace) * (1 - Math.cos(w)));
}

/**
 * Tenting angle (°) at which the middle and the inner edges sit higher than on the flat
 * keyboard by the wedge thickness, and the outer edges just touch the desk.
 */
export function tentingAngle(p) {
  if (!(p.wedge > 0)) return 0;
  let [lo, hi] = [0, Math.PI / 3];
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (liftAt(m, p) < p.wedge) lo = m;
    else hi = m;
  }
  return (((lo + hi) / 2) * 180) / Math.PI;
}

/** Lift caused by tenting: equal to the wedge thickness at the middle. */
export function lift(p) {
  if (!(p.tenting > 0)) return 0;
  return liftAt((p.tenting * Math.PI) / 180, p);
}

/** Height of the board bottom above the desk (middle board and pivot axis of the halves). */
export const boardHeight = p => p.floor + p.underSpace + lift(p);

/**
 * Steps that move a board from its own frame into place.
 * A step is { t: [x, y, z] } or { r: ['x' | 'y' | 'z', degrees] }.
 * @param {'left' | 'middle' | 'right'} region
 */
export function placement(region, p) {
  const z = boardHeight(p);
  if (region === 'middle') {
    const d = boardThickness / 2;
    return [{ t: [0, 0, -d] }, { r: ['y', 180] }, { t: [0, 0, d + z] }];
  }
  const { phi, axisX, shift } = halfTilt(region, p);
  return [
    { t: [shift, 0, z] },
    { t: [-axisX, 0, -z] },
    { r: ['y', phi] },
    { t: [axisX, 0, z] },
  ];
}

/**
 * Tilt of a half: angle about Y (phi), position of the pivot axis in X (axisX, at the
 * height of the board bottom) and outward shift by the cable gap.
 * @param {'left' | 'right'} region
 */
export function halfTilt(region, p) {
  const side = region === 'left' ? -1 : 1;
  // Pivot axis: parallel to the inner edge at the height of the board bottom, offset from
  // the (shifted) inner edge toward the middle by pivotOffset. At 0 the inner edge of the
  // half sits at the same height as the middle board. A positive angle about Y lowers the
  // outer side (+X) of the right half; the left half uses the negative angle.
  return {
    phi: side * p.tenting,
    axisX: side * (INNER_EDGE_X + p.cableGap - p.pivotOffset),
    shift: side * p.cableGap,
  };
}

/** Applies the steps to FluidCAD bodies. Empty steps are skipped. */
export function place(steps, ...bodies) {
  for (const s of steps) {
    if (s.t && s.t.some(v => Math.abs(v) > 1e-9)) translate(s.t[0], s.t[1], s.t[2], ...bodies);
    if (s.r && Math.abs(s.r[1]) > 1e-9) rotate(s.r[0], s.r[1], ...bodies);
  }
}

/** The same steps as plain math for a single point. */
export function point(steps, p) {
  let [x, y, z] = p;
  for (const s of steps) {
    if (s.t) {
      x += s.t[0];
      y += s.t[1];
      z += s.t[2];
    } else {
      const w = (s.r[1] * Math.PI) / 180;
      const [c, n] = [Math.cos(w), Math.sin(w)];
      if (s.r[0] === 'x') [y, z] = [y * c - z * n, y * n + z * c];
      if (s.r[0] === 'y') [x, z] = [x * c + z * n, -x * n + z * c];
      if (s.r[0] === 'z') [x, y] = [x * c - y * n, x * n + y * c];
    }
  }
  return [x, y, z];
}

/**
 * Placement of a KiCad 3D model in the frame of its board (z = 0 bottom).
 * KiCad rotates the model about X, Y, Z, moves it by offset (Y up) and puts it on the top
 * side. On the bottom side it is additionally flipped about Y.
 * @param {{ center: number[], rotation: number, side: string }} component
 * @param {{ offset: number[], rotation: number[] }} model
 */
export function modelPlacement(component, model) {
  const [rx, ry, rz] = model.rotation;
  const steps = [];
  if (rx) steps.push({ r: ['x', rx] });
  if (ry) steps.push({ r: ['y', ry] });
  if (rz) steps.push({ r: ['z', rz] });
  steps.push({ t: model.offset });
  if (component.side === 'bottom') steps.push({ r: ['y', 180] });
  else steps.push({ t: [0, 0, boardThickness] });
  steps.push({ r: ['z', component.rotation] });
  steps.push({ t: [component.center[0], component.center[1], 0] });
  return steps;
}
