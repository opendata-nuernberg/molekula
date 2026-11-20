import { arc, chamfer, circle, color, extrude, line, param, part, select, sketch } from 'fluidcad/core';
import { edge } from 'fluidcad/filters';
import { boardHeight, layoutParams } from './layout.js';
import { boardThickness, components } from './pcb-reference.js';
import { ENCODER, MEASURED, rectBodies, shellParams, sketchPlane } from './shell.js';

// Knob for the EC11 encoder in the middle: a hexagon like the eyes of the guardian motif,
// with the same eye on its top, as a colour inlay or as a plain recessed outline.
//
// It sits on the D-shaft and floats `gap` above the middle cover. The shaft (MEASURED and
// ENCODER in shell.js) was measured on the printed case: its tip is 7.44 mm above the cover,
// the flat is 7 mm long (it starts 0.44 mm above the cover), the shaft is 6 mm thick and
// 4.5 mm from the flat to the opposite side. The bore is a D with a little clearance; three
// crush ribs on the round side press the shaft against the flat, so the knob holds without a
// set screw and does not wobble.
//
// The knob prints upside down on its flat top, like the cover: the eye lies in the first
// three layers, the bore opens upwards and needs no support.
const SHAFT = { diameter: ENCODER.shaft, acrossFlat: ENCODER.acrossFlat };
// Room above the shaft tip.
const TIP_ROOM = 0.4;
// Crush ribs on the round side of the bore (angles from the flat, which faces +X), and the
// lead-in at the entrance where they are left out.
const RIBS = { angles: [120, 180, 240], width: 0.8, leadIn: 1 };
// Eye on the top: inlay radius (corner, pointy top), recessed outline around it, open
// centre, depth (three layers of 0.2 mm). Scaled down from the eyes on the cover.
const EYE = { radius: 4.2, groove: 0.6, dot: 2, depth: 0.6 };

/** Regular hexagon (pointy top) with rounded corners, drawn into the current sketch. */
function roundedHexagon(cx, cy, r, rc) {
  const corners = [...Array(6)].map((_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const along = rc / Math.tan(Math.PI / 3); // tangent point from the corner, interior angle 120°
  const inward = rc / Math.sin(Math.PI / 3); // corner to the centre of its arc
  const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const ends = corners.map((p, i) => {
    const prev = unit(p, corners[(i + 5) % 6]);
    const next = unit(p, corners[(i + 1) % 6]);
    const toCentre = unit(p, [cx, cy]);
    return {
      in: [p[0] + prev[0] * along, p[1] + prev[1] * along],
      out: [p[0] + next[0] * along, p[1] + next[1] * along],
      centre: [p[0] + toCentre[0] * inward, p[1] + toCentre[1] * inward],
    };
  });
  ends.forEach((e, i) => {
    arc(e.in, e.out, e.centre);
    line(e.out, ends[(i + 1) % 6].in);
  });
}

const hexagon = (at, r) => [...Array(6)].map((_, i) => {
  const a = Math.PI / 2 + (i * Math.PI) / 3;
  /** @type {[number, number]} */
  const p = [at[0] + r * Math.cos(a), at[1] + r * Math.sin(a)];
  return p;
});

export const encoderKnob = part('Molekula · Encoder knob', () => {
  const p = layoutParams();
  const s = shellParams();
  const size = param('Knob size across corners (mm)', 19, 'number', { min: 12, max: 26, step: 0.5 });
  const cornerRadius = param('Knob corner radius (mm)', 1.5, 'number', { min: 0.3, max: 4, step: 0.1 });
  const gap = param('Gap above the cover (mm)', 1, 'number', { min: 0.3, max: 3, step: 0.1 });
  const clearance = param('Bore clearance (mm)', 0.15, 'number', {
    min: 0, max: 0.5, step: 0.05, group: 'Shaft', description: 'Per side, on the round part and on the flat.',
  });
  const squeeze = param('Crush rib interference (mm)', 0.1, 'number', {
    min: 0, max: 0.3, step: 0.05, group: 'Shaft', description: 'How far the ribs reach into the shaft; 0 leaves them out.',
  });
  const roof = param('Top thickness above the shaft (mm)', 1.6, 'number', { min: 1, max: 4, step: 0.1 });
  const inlay = param('Eye as colour inlay', true, 'checkbox', { group: 'Look' });
  const knobColor = param('Knob colour', '#d8c9a3', 'color', { group: 'Look' });
  const eyeColor = param('Eye colour', '#3aa7e6', 'color', { group: 'Look' });

  // Heights in the frame of the middle board (z = 0 its underside), as in top-shell.part.js.
  const cover = boardThickness + s.coverHeight;
  const z0 = cover + gap;
  const tip = MEASURED.encoderTip - s.coverHeight; // shaft tip above the cover
  const boreTop = cover + tip + TIP_ROOM;
  const z1 = boreTop + roof;
  const world = z => boardHeight(p) + z;
  if (tip - ENCODER.flatLength > gap) {
    console.warn(`Encoder knob: the shaft flat starts ${(tip - ENCODER.flatLength).toFixed(2)} mm above the cover, above the knob's underside; the round part of the shaft enters the D bore.`);
  }

  const enc = components.find(b => b.ref === 'SW38');
  const at = [-enc.center[0], enc.center[1]]; // the middle board is upside down: KiCad X mirrored

  const body = sketchPlane('middle', p, z0);
  sketch(body.plane, () => {
    roundedHexagon(at[0] + body.dx, at[1] + body.dy, size / 2, cornerRadius);
  }).name('Knob · outline');
  const knob = extrude(z1 - z0).new().name('Knob');

  // D bore from the underside up to just above the shaft tip.
  const r = SHAFT.diameter / 2 + clearance;
  const flat = SHAFT.acrossFlat - SHAFT.diameter / 2 + clearance;
  const half = Math.sqrt(r * r - flat * flat);
  const bore = sketchPlane('middle', p, boreTop);
  sketch(bore.plane, () => {
    const [x, y] = [at[0] + bore.dx, at[1] + bore.dy];
    arc([x + flat, y + half], [x + flat, y - half], [x, y]);
    line([x + flat, y - half], [x + flat, y + half]);
  }).name('Knob · D bore · sketch');
  extrude(boreTop - z0 + 1).remove().scope(knob).name('Knob · D bore');

  // Edges: a lead-in at the bore, broken edges at the bottom and on the top (the print bed).
  chamfer(0.5, select(edge().onPlane('xy', world(z0)))).name('Knob · bottom edges');
  chamfer(0.6, select(edge().onPlane('xy', world(z1)))).name('Knob · top edge');

  // Crush ribs.
  if (squeeze > 0) {
    const inner = SHAFT.diameter / 2 - squeeze;
    const outer = r + 0.3;
    for (const deg of RIBS.angles) {
      const a = (deg * Math.PI) / 180;
      const c = (inner + outer) / 2;
      rectBodies('middle', p, [{ center: [at[0] + c * Math.cos(a), at[1] + c * Math.sin(a)], width: outer - inner, height: RIBS.width, rotation: deg }],
        z0 + RIBS.leadIn, boreTop, `Knob · crush rib ${deg}°`, { add: [knob] });
    }
  }

  // Eye on the top: a pocket as deep as the inlay, refilled by the eye, which leaves the
  // recessed outline around it. The open centre stays in the knob colour.
  const pocketRadius = EYE.radius + EYE.groove / Math.cos(Math.PI / 6);
  rectBodies('middle', p, [{ corners: hexagon(at, pocketRadius) }], z1 - EYE.depth, z1 + 1, 'Knob · eye pocket', { remove: [knob] });
  if (inlay) {
    const centre = sketchPlane('middle', p, z1 - EYE.depth - 0.05);
    sketch(centre.plane, () => circle([at[0] + centre.dx, at[1] + centre.dy], EYE.dot)).name('Knob · eye centre · sketch');
    extrude(EYE.depth + 0.05).add().scope(knob).name('Knob · eye centre');
    const [eye] = rectBodies('middle', p, [{ corners: hexagon(at, EYE.radius) }], z1 - EYE.depth, z1, 'Knob · eye');
    const hole = sketchPlane('middle', p, z1 + 1);
    sketch(hole.plane, () => circle([at[0] + hole.dx, at[1] + hole.dy], EYE.dot)).name('Knob · eye hole · sketch');
    extrude(EYE.depth + 2).remove().scope(eye).name('Knob · eye hole');
    color(eyeColor, eye);
  } else {
    rectBodies('middle', p, [{ corners: hexagon(at, EYE.radius) }], z1 - EYE.depth - 0.05, z1, 'Knob · eye (plain)', { add: [knob] });
  }

  color(knobColor, knob);
});
