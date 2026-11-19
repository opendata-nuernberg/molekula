import { circle, color, cut, extrude, part, plane, sketch } from 'fluidcad/core';
import { trace } from './kontur.js';
import { lage, layoutParameter, platzieren } from './layout.js';
import { bohrungen, platinenstaerke, teile } from './pcb-referenz.js';

// Die drei Platinen der Tastatur ohne Magnetverbinder in Einbaulage (siehe layout.js).
// Die Verbinderplatinen des Panels werden nicht verwendet.

const farben = { links: '#2f7d4f', mitte: '#2b5fa8', rechts: '#2f7d4f' };

export const platinen = part('Molekula · Platinen', () => {
  const p = layoutParameter();
  for (const region of ['links', 'mitte', 'rechts']) {
    const teil = teile[region];
    const umriss = sketch('xy', () => {
      trace(teil.start, teil.schritte);
    }).name(`${teil.titel} · Edge.Cuts`);
    const platte = extrude(platinenstaerke, umriss).new().name(teil.titel);
    const loecher = bohrungen.filter(b => b.teil === region);
    if (loecher.length) {
      sketch(plane('xy', { offset: platinenstaerke }), () => {
        for (const b of loecher) circle(b.mitte, b.bohrung);
      }).name(`${teil.titel} · Bohrungen`);
      cut().name(`${teil.titel} · Bohrungen durchgehend`);
    }
    color(farben[region], platte);
    platzieren(lage(region, p), platte);
  }
});
