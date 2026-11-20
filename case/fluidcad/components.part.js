import { circle, color, extrude, load, param, part, plane, sketch, translate } from 'fluidcad/core';
import { envelopes } from './envelopes.js';
import { layoutParams, modelPlacement, place, placement } from './layout.js';
import { closed, rectangle } from './outline.js';
import { boardThickness, components as parts, switches } from './pcb-reference.js';
import { ENCODER, MEASURED } from './shell.js';

// Populated components of the keyboard, for interference checks.
//
// By default these are the stepped envelope boxes from envelopes.js (tools/envelopes.mjs):
// a few simple bodies, fast in the browser. With "Detailed models" the imported originals
// (imports/, see imports/SOURCES.md) are loaded instead, for a final check.
//
// Switch model: origin at the switch centre, z = 0 top of the board. In the Onshape model
// the socket top sits 2.0 mm below the top of the board; it is placed against the bottom of
// the 1.6 mm board.

const SOCKET_TOP_IN_MODEL = 2.0;
const TRAVEL = 3.0;

// Component -> [envelope/import, model file in the footprint]. Helios and encoder are built
// from measured heights instead (measuredBodies), in both modes.
const COMPONENTS = {
  SW37: ['reset', 'Button_SW_SPST_SKQG_WithoutStem.STEP'],
  J2: ['ffc', 'FPC-12.stp'],
  J3: ['ffc', 'FPC-12.stp'],
  J4: ['ffc', 'FPC-12.stp'],
  J5: ['ffc', 'FPC-12.stp'],
};

const COLORS = { switch: '#e07b39', keycap: '#d9d4c7', socket: '#3a3a3a', encoder: '#555b66', helios: '#1f6f8b', reset: '#888888', ffc: '#c9c9c9' };

/**
 * Envelope as stepped boxes at several places: one sketch per step with all rectangles.
 * @param {string} name
 * @param {number} dz shift in z (model frame -> board frame)
 * @param {{ center: number[], rotation: number }[]} places
 */
function steppedBodies(name, dz, places) {
  return envelopes[name].steps.map((s, i) => {
    const b = s.max[0] - s.min[0];
    const h = s.max[1] - s.min[1];
    const c = [(s.max[0] + s.min[0]) / 2, (s.max[1] + s.min[1]) / 2];
    const sk = sketch(plane('xy', { offset: s.z[0] + dz }), () => {
      for (const o of places) {
        const w = (o.rotation * Math.PI) / 180;
        const m = [o.center[0] + c[0] * Math.cos(w) - c[1] * Math.sin(w), o.center[1] + c[0] * Math.sin(w) + c[1] * Math.cos(w)];
        if (envelopes[name].roundFrom !== undefined && s.z[0] >= envelopes[name].roundFrom) circle(m, Math.max(b, h));
        else closed(rectangle(m, b, h, o.rotation));
      }
    }).name(`${envelopes[name].title} · step ${i + 1}`);
    const body = extrude(s.z[1] - s.z[0], sk).new().name(`${envelopes[name].title} · step ${i + 1}`);
    color(COLORS[name], body);
    return body;
  });
}

/**
 * Helios and encoder of the middle board from the heights measured on the built keyboard
 * (MEASURED in shell.js). Frame of the board: both sit on the KiCad bottom side (z < 0),
 * which faces up once the board is mounted upside down.
 */
function measuredBodies() {
  const box = (name, center, w, h, z0, z1, col) => {
    const sk = sketch(plane('xy', { offset: -z1 }), () => closed(rectangle(center, w, h, 0))).name(`${name} · sketch`);
    const body = extrude(z1 - z0, sk).new().name(name);
    color(col, body);
    return body;
  };
  const cylinder = (name, center, d, z0, z1, col) => {
    const sk = sketch(plane('xy', { offset: -z1 }), () => circle(center, d)).name(`${name} · sketch`);
    const body = extrude(z1 - z0, sk).new().name(name);
    color(col, body);
    return body;
  };
  const helios = parts.find(t => t.ref === 'J13');
  const enc = parts.find(t => t.ref === 'SW38');
  // Helios footprint incl. the receptacle overhang at the board edge (from the KiCad model).
  const hy = [helios.center[1] + 13.9 - 29.15, helios.center[1] + 13.9 + 4.65];
  return [
    box('J13 · Helios (measured)', [helios.center[0], (hy[0] + hy[1]) / 2], 17.8, hy[1] - hy[0], 0.05, MEASURED.usbTop, COLORS.helios),
    box('SW38 · encoder body (measured)', enc.center, ENCODER.body, ENCODER.body, 0.05, MEASURED.encoderBody, COLORS.encoder),
    ...(MEASURED.encoderBushing > MEASURED.encoderBody
      ? [cylinder('SW38 · encoder bushing', enc.center, ENCODER.bushing, MEASURED.encoderBody, MEASURED.encoderBushing, COLORS.encoder)]
      : []),
    cylinder('SW38 · encoder shaft (measured tip)', enc.center, ENCODER.shaft, MEASURED.encoderBushing, MEASURED.encoderTip, COLORS.encoder),
  ];
}

export const components = part('Molekula · Components', () => {
  const p = layoutParams();
  const pressed = param('Keys pressed', false, 'checkbox');
  const detailed = param('Detailed models (slow)', false, 'checkbox');

  const perRegion = { left: [], middle: [], right: [] };

  for (const region of ['left', 'right']) {
    const places = switches.filter(s => s.board === region);
    if (detailed) {
      for (const s of places) {
        const body = load('choc-v1-with-keycap').include(1).name(`${s.ref} · switch`);
        const cap = load('choc-v1-with-keycap').include(2).name(`${s.ref} · keycap`);
        const socket = load('choc-v1-with-keycap').include(0, 3, 4).name(`${s.ref} · socket`);
        if (pressed) translate(0, 0, -TRAVEL, cap);
        place([{ r: ['z', s.rotation] }], body, cap, socket);
        translate(s.center[0], s.center[1], boardThickness, body, cap);
        translate(s.center[0], s.center[1], SOCKET_TOP_IN_MODEL, socket);
        perRegion[region].push(body, cap, socket);
      }
    } else {
      perRegion[region].push(
        ...steppedBodies('switch', boardThickness, places),
        ...steppedBodies('keycap', boardThickness - (pressed ? TRAVEL : 0), places),
        ...steppedBodies('socket', SOCKET_TOP_IN_MODEL, places),
      );
    }
  }

  for (const [ref, [name, file]] of Object.entries(COMPONENTS)) {
    const c = parts.find(t => t.ref === ref);
    const m = c?.models.find(mm => mm.file === file);
    if (!m || !(c.board in perRegion)) continue;
    const bodies = detailed
      ? [load(envelopes[name].import).name(`${ref} · ${c.value}`)]
      : steppedBodies(name, 0, [{ center: [0, 0], rotation: 0 }]);
    place(modelPlacement(c, m), ...bodies);
    perRegion[c.board].push(...bodies);
  }

  perRegion.middle.push(...measuredBodies());

  for (const [region, bodies] of Object.entries(perRegion)) place(placement(region, p), ...bodies);
});
