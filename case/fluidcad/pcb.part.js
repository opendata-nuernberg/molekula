import { circle, color, cut, extrude, part, plane, sketch } from 'fluidcad/core';
import { closed, rectangle, trace } from './outline.js';
import { boardThickness, boards, holes, switches, tabs } from './pcb-reference.js';

// Physical reference: the panel after separating, without components.
// All dimensions come from pcb-reference.js, which tools/kicad_reference.py generates from KiCad.

const colors = {
  left: '#2f7d4f',
  connectorLeft: '#b8862b',
  middle: '#2b5fa8',
  connectorRight: '#b8862b',
  right: '#2f7d4f',
};

export const pcb = part('Molekula · PCB separated', () => {
  for (const [name, b] of Object.entries(boards)) {
    const outline = sketch('xy', () => {
      trace(b.start, b.steps);
    }).name(`${b.title} · Edge.Cuts`);
    const plate = extrude(boardThickness, outline).new().name(b.title);
    color(colors[name], plate);
  }

  sketch(plane('xy', { offset: boardThickness }), () => {
    for (const h of holes) circle(h.center, h.drill).name(`${h.ref} · Ø${h.drill}`);
  }).name('Holes for M2 press-fit nuts');
  cut().name('Holes through');

  sketch(plane('xy', { offset: boardThickness }), () => {
    for (const s of switches) {
      // Choc cut-out 13.8 mm as a placement guide, 18 x 17 mm grid.
      closed(rectangle(s.center, 13.8, 13.8, s.rotation)).forEach(k => k.guide());
      closed(rectangle(s.center, 18, 17, s.rotation)).forEach(k => k.guide());
    }
  }).name('Switch positions · Choc 13.8 / grid 18 x 17');

  sketch('xy', () => {
    for (const tab of Object.values(tabs)) {
      const [x0, y0] = tab.from;
      const [x1, y1] = tab.to;
      closed([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).forEach(k => k.guide());
    }
  }).name('Removed panel tabs');
});
