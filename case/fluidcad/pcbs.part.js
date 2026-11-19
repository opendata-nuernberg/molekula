import { circle, color, cut, extrude, part, plane, sketch } from 'fluidcad/core';
import { layoutParams, place, placement } from './layout.js';
import { trace } from './outline.js';
import { boardThickness, boards, holes } from './pcb-reference.js';

// The three boards of the keyboard without magnetic connectors in their mounted position
// (see layout.js). The connector boards of the panel are not used.

const colors = { left: '#2f7d4f', middle: '#2b5fa8', right: '#2f7d4f' };

export const pcbs = part('Molekula · PCBs', () => {
  const p = layoutParams();
  for (const region of ['left', 'middle', 'right']) {
    const b = boards[region];
    const outline = sketch('xy', () => {
      trace(b.start, b.steps);
    }).name(`${b.title} · Edge.Cuts`);
    const plate = extrude(boardThickness, outline).new().name(b.title);
    const drilled = holes.filter(h => h.board === region);
    if (drilled.length) {
      sketch(plane('xy', { offset: boardThickness }), () => {
        for (const h of drilled) circle(h.center, h.drill);
      }).name(`${b.title} · holes`);
      cut().name(`${b.title} · holes through`);
    }
    color(colors[region], plate);
    place(placement(region, p), plate);
  }
});
