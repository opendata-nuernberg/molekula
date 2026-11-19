import { circle, color, cut, extrude, part, plane, rotate, sketch, translate } from 'fluidcad/core';
import { connectors } from './onshape-reference.js';
import { closed, trace } from './outline.js';
import { boardThickness, boards, holes } from './pcb-reference.js';

// Magnetic connector board of the left half in its mounted position in the finished case.
// Outline and holes: pcb-reference.js (KiCad). Position: onshape-reference.js, fitted from
// the Onshape case (case/onshape/molekula.step).
//
// The board stands upright at the split seam, tilted 18° against the KiCad Y axis. The tab
// edge (KiCad y = -61) is at the bottom, the populated top side with the magnetic socket
// faces the seam, and the FFC connector J9 on the bottom side faces the half.
// Coordinates as in pcb.part.js: KiCad frame of the left half, main board z = 0 … boardThickness.
const mount = connectors.connectorLeft;
const { start, steps } = boards.connectorLeft;

/**
 * Bounding box in KiCad coordinates of the flat board.
 * @param {{ min: number[], max: number[] }} h
 */
function box(h) {
  const [x0, y0, z0] = h.min;
  const [x1, y1, z1] = h.max;
  const outline = sketch(plane('xy', { offset: z0 }), () => {
    closed([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  });
  return extrude(z1 - z0, outline).new();
}

export const magnetConnectorLeft = part('Molekula · Magnetic connector left (mounted)', () => {
  sketch(plane('xy', { offset: boardThickness }), () => {
    trace(boards.left.start, boards.left.steps).forEach(k => k.guide());
  }).name('PCB left · Edge.Cuts (reference)');

  const outline = sketch('xy', () => {
    trace(start, steps);
  }).name('Magnetic connector left · Edge.Cuts');
  const plate = extrude(boardThickness, outline).new().name('Board');
  color('#b8862b', plate);

  sketch(plane('xy', { offset: boardThickness }), () => {
    for (const h of holes.filter(h => h.board === 'connectorLeft')) circle(h.center, h.drill).name(`${h.ref} · Ø${h.drill}`);
  }).name('Holes H3/H4');
  cut().name('Holes through');

  // Space taken by the components according to the Onshape model, as bounding boxes.
  const magnet = box(mount.envelopes.magnet).name('Magnetic socket J11 · envelope (Onshape)');
  color('#5a6270', magnet);
  const ffc = box(mount.envelopes.ffc).name('FFC connector J9 · envelope (Onshape)');
  color('#c9c9c9', ffc);

  // Mounted position: stand up (KiCad +y pointing down), rotate about Z, translate.
  rotate('x', -90, plate, magnet, ffc).name('Stand up');
  rotate('z', mount.rotationZ, plate, magnet, ffc).name(`Rotate ${mount.rotationZ}°`);
  translate(mount.origin[0], mount.origin[1], mount.origin[2] + boardThickness, plate, magnet, ffc).name('Move into place');
});
