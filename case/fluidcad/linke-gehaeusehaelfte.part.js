import { extrude, fillet, offset, param, part, plane, select, sketch } from 'fluidcad/core';
import { edge } from 'fluidcad/filters';
import { trace } from './kontur.js';
import { teile } from './pcb-referenz.js';

// Kontur der linken Hälfte nach dem Trennen, ohne Stege und Magnetverbinder-Platine.
// Quelle: pcb-referenz.js, erzeugt aus pcb/pcb.kicad_pcb.
const { start, schritte } = teile.links;

export const leftCase = part('Molekula · linke Unterschale', () => {
  // Entwurfswerte. Bestückungshöhen, Auflage und Kabelwege sind noch zu vermessen.
  const profileHeight = param('Profilhöhe (vorläufig)', 7, 'number', { min: 4, max: 12, step: 0.1 });
  const wallThickness = param('Wandstärke (vorläufig)', 1.8, 'number', { min: 1.6, max: 2.3, step: 0.1 });
  const edgeRadius = param('Kantenradius (vorläufig)', 0.5, 'number', { min: 0.2, max: 0.9, step: 0.1 });
  const floorThickness = param('Bodenstärke (vorläufig)', 1.6, 'number', { min: 1.2, max: 2.5, step: 0.1 });
  const boardClearance = param('PCB-Spiel je Seite (vorläufig)', 0.6, 'number', { min: 0.5, max: 0.9, step: 0.1 });

  sketch('xy', () => {
    trace(start, schritte).forEach(k => k.guide());
  }).name('PCB links · Edge.Cuts nach dem Trennen');

  const floor = sketch('xy', () => {
    const edges = trace(start, schritte);
    edges.forEach(k => k.guide());
    offset(boardClearance + wallThickness, ...edges);
  }).name('Außenkontur am Boden');
  extrude(floorThickness, floor).name('Boden');

  const rim = sketch(plane('xy', { offset: floorThickness }), () => {
    const edges = trace(start, schritte);
    edges.forEach(k => k.guide());
    offset(boardClearance + wallThickness, ...edges);
    offset(boardClearance, ...edges);
  }).name('Wandprofil');
  extrude(profileHeight - floorThickness, rim).add().name('Umlaufende Wand');
  fillet(edgeRadius, select(edge().onPlane('xy', 0))).name('Außenkante am Boden');
});
