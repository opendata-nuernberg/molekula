import { circle, color, cut, extrude, part, plane, sketch } from 'fluidcad/core';
import { geschlossen, rechteck, trace } from './kontur.js';
import { bohrungen, platinenstaerke, schalter, stege, teile } from './pcb-referenz.js';

// Physische Referenz: das Panel nach dem Trennen, ohne Bauteile.
// Alle Maße stammen aus pcb-referenz.js, das werkzeuge/kicad_referenz.py aus KiCad erzeugt.

const farben = {
  links: '#2f7d4f',
  verbinderLinks: '#b8862b',
  mitte: '#2b5fa8',
  verbinderRechts: '#b8862b',
  rechts: '#2f7d4f',
};

export const pcb = part('Molekula · PCB getrennt', () => {
  for (const [name, teil] of Object.entries(teile)) {
    const umriss = sketch('xy', () => {
      trace(teil.start, teil.schritte);
    }).name(`${teil.titel} · Edge.Cuts`);
    const platte = extrude(platinenstaerke, umriss).new().name(teil.titel);
    color(farben[name], platte);
  }

  sketch(plane('xy', { offset: platinenstaerke }), () => {
    for (const b of bohrungen) circle(b.mitte, b.bohrung).name(`${b.ref} · Ø${b.bohrung}`);
  }).name('Bohrungen für M2-Einpressmuttern');
  cut().name('Bohrungen durchgehend');

  sketch(plane('xy', { offset: platinenstaerke }), () => {
    for (const s of schalter) {
      // Choc-Ausschnitt 13,8 mm als Lagehilfe, Raster 18 x 17 mm.
      geschlossen(rechteck(s.mitte, 13.8, 13.8, s.drehung)).forEach(k => k.guide());
      geschlossen(rechteck(s.mitte, 18, 17, s.drehung)).forEach(k => k.guide());
    }
  }).name('Schalterpositionen · Choc 13,8 / Raster 18 x 17');

  sketch('xy', () => {
    for (const steg of Object.values(stege)) {
      const [x0, y0] = steg.von;
      const [x1, y1] = steg.bis;
      geschlossen([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).forEach(k => k.guide());
    }
  }).name('Entfernte Stege des Panels');
});
