import { arc, axis, color, extrude, fillet, fuse, line, param, part, plane, revolve, select, sketch, sphere } from 'fluidcad/core';
import { edge } from 'fluidcad/filters';
import { closed } from './outline.js';

// Choc v1 keycap for the minY grid (19 × 16 mm), rebuilt from the measured caps in
// keycaps/README.md and made fully parametric.
//
// Key frame: X across the key (along the row), Y along the column, Z up. Z = 0 is the floor
// of the pocket on the underside; the rim around the pocket reaches down to Z = -RIM.
//
// - Finger: a dish, concave in both directions, optionally tilted along Y.
// - Thumb: a saddle. Concave along Y, so the thumb lies in a shallow trough that runs along
//   X, the direction it sweeps over the thumb row; convex along X, so the key edges roll
//   away under the thumb instead of digging into it.
//
// Both top surfaces come from one construction: an arc in the XZ plane (concave or convex
// across X) revolved about an axis parallel to X that lies above the cap. The revolved body
// is cut from the cap, and its lower face, a torus, becomes the top surface: its curvature
// along Y is set by the height of that axis.
//
// The cap prints standing on its front edge (-Y). The stem legs then overhang sideways; an
// integrated support carries them: a thin wall under the leg tips that touches them only on
// a narrow strip, tied to the cap by a flat frame of two layers on the bed.

// Depth of the pocket on the underside; its walls slope at 45°, so they print on edge.
const RIM = 1;
const RIM_WIDTH = 0.7;
// Choc v1 stem: two legs, centred in the cap.
const LEG = { width: 1.3, length: 2.7, spacing: 5.8, height: 4, chamfer: 0.2 };
// Integrated support (key frame, see above). wall: under the leg tips, `z` its extent in Z,
// `x` its half width; contact: width of the strip that touches the legs. frame: rails and
// cross bar on the bed, `layer` thick.
const SUPPORT = {
  wall: { z: [-4, -3], x: 3.55 },
  contact: 0.6,
  frame: { layer: 0.4, rail: [5.2, 6.2], end: 8 },
};
// Homing marks on the top surface. Dots: three domes. Hexagon: a raised outline, like the
// eyes on the middle cover.
const DOTS = { at: [-2, 0, 2], radius: 0.6, sink: 0.1 };
const HEX = { radius: 2.6, line: 0.6, height: 0.45 };
// Half length of the cutting body for the top surface, beyond the widest cap.
const REACH = 12;

const hexagon = r => [...Array(6)].map((_, i) => {
  const a = Math.PI / 2 + (i * Math.PI) / 3;
  /** @type {[number, number]} */
  const p = [r * Math.cos(a), r * Math.sin(a)];
  return p;
});

/** Rectangle with chamfered corners, centred at (cx, cy). */
function chamferedRect(cx, cy, w, h, c) {
  const [x0, x1, y0, y1] = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
  /** @type {[number, number][]} */
  const p = [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
  return closed(p);
}

/** Rounded rectangle centred at the origin of the sketch. */
function roundedRect(w, h, r) {
  const [x, y] = [w / 2, h / 2];
  return [
    line([-x + r, -y], [x - r, -y]), arc([x - r, -y], [x, -y + r], [x - r, -y + r]),
    line([x, -y + r], [x, y - r]), arc([x, y - r], [x - r, y], [x - r, y - r]),
    line([x - r, y], [-x + r, y]), arc([-x + r, y], [-x, y - r], [-x + r, y - r]),
    line([-x, y - r], [-x, -y + r]), arc([-x, -y + r], [-x + r, -y], [-x + r, -y + r]),
  ];
}

/** Radius of an arc that rises by `rise` at 6 mm from its lowest point. */
const radiusFor = rise => (36 + rise * rise) / (2 * rise);

export const keycap = part('Molekula · Keycap', () => {
  const profile = param('Profile', 'finger', 'select', {
    options: [{ label: 'Finger (dish)', value: 'finger' }, { label: 'Thumb (saddle)', value: 'thumb' }],
  });
  const mark = param('Homing mark', 'none', 'select', {
    options: [{ label: 'None', value: 'none' }, { label: 'Three dots', value: 'dots' }, { label: 'Hexagon', value: 'hexagon' }],
  });
  const width = param('Width (mm)', 18.3, 'number', { min: 15, max: 18.8, step: 0.1, group: 'Body' });
  const depth = param('Depth (mm)', 15.3, 'number', { min: 13, max: 15.8, step: 0.1, group: 'Body' });
  const corner = param('Corner radius (mm)', 3, 'number', { min: 0.5, max: 6, step: 0.1, group: 'Body' });
  const edgeRadius = param('Top edge radius (mm)', 2, 'number', { min: 0.3, max: 2.5, step: 0.1, group: 'Body' });
  const height = param('Height at the centre (mm)', 2.5, 'number', {
    min: 1.5, max: 8, step: 0.1, group: 'Body', description: 'Top surface above the pocket floor; the rim adds 1 mm.',
  });
  const dishAcross = param('Dish depth across (mm)', 0.55, 'number', {
    min: 0, max: 2, step: 0.05, group: 'Finger', description: 'Rise of the dish 6 mm from the centre along X.',
  });
  const dishAlong = param('Dish depth along (mm)', 0.35, 'number', {
    min: 0, max: 2, step: 0.05, group: 'Finger', description: 'Rise of the dish 6 mm from the centre along Y.',
  });
  const tilt = param('Tilt along the column (°)', 0, 'number', {
    min: -20, max: 20, step: 0.5, group: 'Finger', description: 'Positive raises the back edge (+Y). The old slope caps had 14°.',
  });
  const thumbHeight = param('Thumb height at the centre (mm)', 3, 'number', {
    min: 1.5, max: 8, step: 0.1, group: 'Thumb', description: 'Higher than the finger keys, so the edges that roll away stay thick enough.',
  });
  const trough = param('Saddle trough (mm)', 0.8, 'number', {
    min: 0, max: 2, step: 0.05, group: 'Thumb', description: 'Concave along Y: rise 6 mm from the centre.',
  });
  const roll = param('Saddle roll-off (mm)', 0.5, 'number', {
    min: 0, max: 1.5, step: 0.05, group: 'Thumb', description: 'Convex along X: drop 6 mm from the centre.',
  });
  const support = param('Integrated print support', true, 'checkbox', { group: 'Print' });
  const capColor = param('Colour', '#d8c9a3', 'color', { group: 'Print' });

  const thumb = profile === 'thumb';
  const h = thumb ? thumbHeight : height;
  // Signed rise across X (positive = concave) and rise along Y (always concave; a flat
  // direction gets a very large radius instead).
  const across = thumb ? -roll : dishAcross;
  const along = thumb ? trough : dishAlong;
  const turn = ((thumb ? 0 : tilt) * Math.PI) / 180;

  // Highest point of the top surface, to size the blank.
  const reachX = width / 2 + 0.5;
  const reachY = depth / 2 + 0.5;
  const riseAt = (rise, d) => (rise > 0 ? radiusFor(rise) - Math.sqrt(Math.max(0, radiusFor(rise) ** 2 - d * d)) : 0);
  const top = h + riseAt(Math.max(0, across), reachX) + riseAt(along, reachY) + Math.abs(Math.tan(turn)) * reachY + 1;

  // Blank: the footprint from the rim up to above the top surface.
  sketch(plane('xy', { offset: -RIM }), () => {
    roundedRect(width, depth, corner);
  }).name('Footprint');
  const cap = extrude(top + RIM).new().name('Keycap');

  // Top surface. The cutting body's profile: the arc across X, closed upwards to the axis
  // about which it is revolved. Tilting a surface of revolution about an axis parallel to
  // its own only moves it along the circle: the axis moves to -R·sin(tilt) in Y and the low
  // point of the dish slides forward, so the surface over the cap rises towards +Y.
  const radius = along > 0.01 ? radiusFor(along) : 2000;
  const axisY = -radius * Math.sin(turn);
  const axisZ = h + radius * Math.cos(turn);
  const low = axisZ - radius; // lowest point of the profile, in the plane of the axis
  // The XZ plane faces -Y: its offset is the negative y.
  const cutter = sketch(plane('xz', { offset: -axisY }), () => {
    let z = low;
    if (Math.abs(across) < 1e-3) {
      line([-REACH, low], [REACH, low]);
    } else {
      const r = radiusFor(Math.abs(across));
      z = across > 0 ? low + riseAt(across, REACH) : low - riseAt(-across, REACH);
      /** @type {[number, number]} */
      const centre = across > 0 ? [0, low + r] : [0, low - r];
      const a = arc([-REACH, z], [REACH, z], centre);
      if (across < 0) a.cw();
    }
    line([REACH, z], [REACH, axisZ]);
    line([REACH, axisZ], [-REACH, axisZ]);
    line([-REACH, axisZ], [-REACH, z]);
  }).name('Top surface · profile');
  revolve(axis('x', { offsetY: axisY, offsetZ: axisZ }), cutter).remove().scope(cap).name('Top surface');
  fillet(edgeRadius, select(edge().above('xy', 0.2))).name('Top edge');

  // Pocket on the underside with 45° walls.
  sketch(plane('xy', { offset: 0 }), () => {
    roundedRect(width - 2 * (RIM_WIDTH + RIM), depth - 2 * (RIM_WIDTH + RIM), Math.max(0.3, corner - RIM_WIDTH - RIM));
  }).name('Pocket · floor');
  extrude(RIM).draft(45).remove().scope(cap).name('Pocket');

  // Stem legs.
  for (const side of [-1, 1]) {
    sketch(plane('xy', { offset: -LEG.height }), () => {
      chamferedRect((side * LEG.spacing) / 2, 0, LEG.width, LEG.length, LEG.chamfer);
    }).name(`Stem leg ${side < 0 ? 'left' : 'right'} · sketch`);
    extrude(LEG.height + 0.05).add().scope(cap).name(`Stem leg ${side < 0 ? 'left' : 'right'}`);
  }

  // Homing mark.
  if (mark === 'dots') {
    for (const x of DOTS.at) fuse(cap, sphere(DOTS.radius).translate(x, 0, h - DOTS.sink));
  } else if (mark === 'hexagon') {
    sketch(plane('xy', { offset: h - 0.8 }), () => {
      closed(hexagon(HEX.radius));
      closed(hexagon(HEX.radius - HEX.line / Math.cos(Math.PI / 6)));
    }).name('Homing hexagon · sketch');
    extrude(0.8 + HEX.height).add().scope(cap).name('Homing hexagon');
  }

  // Integrated print support. The cap stands on its front edge, y = -depth / 2.
  if (support) {
    const bed = -depth / 2;
    const legUnder = -LEG.length / 2;
    const [w0, w1] = SUPPORT.wall.z;
    const c = (w1 - w0 - SUPPORT.contact) / 2;
    // Wall: from the bed to the underside of the leg tips, chamfered to a narrow strip on top.
    sketch('yz', () => {
      closed([[bed, w0], [legUnder - c, w0], [legUnder + 0.05, w0 + c], [legUnder + 0.05, w1 - c], [legUnder - c, w1], [bed, w1]]);
    }).name('Support · wall · sketch');
    extrude(2 * SUPPORT.wall.x).symmetric().add().scope(cap).name('Support · wall');
    // Frame on the bed: two rails from the rim, a cross bar at their end, a foot under the wall.
    const { layer, rail, end } = SUPPORT.frame;
    const bars = [
      ...[-1, 1].map(s => ({ x: [s * rail[0], s * rail[1]], z: [-end, -RIM + 0.1] })),
      { x: [-rail[1], rail[1]], z: [-end, -end + 1] },
      { x: [-rail[1], rail[1]], z: [w0, w1] },
    ];
    for (const [i, b] of bars.entries()) {
      // The XZ plane faces -Y: its offset is the negative y, and it extrudes towards -Y.
      sketch(plane('xz', { offset: -(bed + layer) }), () => {
        closed([[b.x[0], b.z[0]], [b.x[1], b.z[0]], [b.x[1], b.z[1]], [b.x[0], b.z[1]]]);
      }).name(`Support · frame ${i + 1} · sketch`);
      extrude(layer).add().scope(cap).name(`Support · frame ${i + 1}`);
    }
  }

  color(capColor, cap);
});
