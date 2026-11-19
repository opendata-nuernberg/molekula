import { extrude, fillet, offset, param, part, plane, select, sketch } from 'fluidcad/core';
import { edge } from 'fluidcad/filters';
import { trace } from './outline.js';
import { boards } from './pcb-reference.js';

// Outline of the left half after separating, without tabs and the magnetic connector board.
// Source: pcb-reference.js, generated from pcb/pcb.kicad_pcb.
const { start, steps } = boards.left;

export const leftCase = part('Molekula · Bottom case left', () => {
  // Design values. Component heights, ledge and cable routes still need to be measured.
  const profileHeight = param('Profile height (draft)', 7, 'number', { min: 4, max: 12, step: 0.1 });
  const wallThickness = param('Wall thickness (draft)', 1.8, 'number', { min: 1.6, max: 2.3, step: 0.1 });
  const edgeRadius = param('Edge radius (draft)', 0.5, 'number', { min: 0.2, max: 0.9, step: 0.1 });
  const floorThickness = param('Floor thickness (draft)', 1.6, 'number', { min: 1.2, max: 2.5, step: 0.1 });
  const boardClearance = param('PCB clearance per side (draft)', 0.6, 'number', { min: 0.5, max: 0.9, step: 0.1 });

  sketch('xy', () => {
    trace(start, steps).forEach(k => k.guide());
  }).name('PCB left · Edge.Cuts after separating');

  const floor = sketch('xy', () => {
    const edges = trace(start, steps);
    edges.forEach(k => k.guide());
    offset(boardClearance + wallThickness, ...edges);
  }).name('Outer outline at the floor');
  extrude(floorThickness, floor).name('Floor');

  const rim = sketch(plane('xy', { offset: floorThickness }), () => {
    const edges = trace(start, steps);
    edges.forEach(k => k.guide());
    offset(boardClearance + wallThickness, ...edges);
    offset(boardClearance, ...edges);
  }).name('Wall profile');
  extrude(profileHeight - floorThickness, rim).add().name('Surrounding wall');
  fillet(edgeRadius, select(edge().onPlane('xy', 0))).name('Outer edge at the floor');
});
