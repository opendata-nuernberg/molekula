import { circle, color, cut, extrude, part, plane, rotate, sketch, translate } from 'fluidcad/core';
import { geschlossen, trace } from './kontur.js';
import { verbinder } from './onshape-referenz.js';
import { bohrungen, platinenstaerke, teile } from './pcb-referenz.js';

// Magnetverbinder-Platine der linken Hälfte in ihrer Einbaulage im fertigen Gehäuse.
// Kontur und Bohrungen: pcb-referenz.js (KiCad). Lage: onshape-referenz.js, eingepasst
// aus dem Onshape-Gehäuse (case/onshape/molekula.step).
//
// Die Platine steht senkrecht an der Trennfuge, 18° gegen die KiCad-Y-Achse gekippt.
// Die Stegkante (KiCad y = -61) liegt unten, die Bestückungsoberseite mit der
// Magnetbuchse zeigt zur Fuge, der FFC-Stecker J9 auf der Unterseite zur Hälfte hin.
// Koordinaten wie pcb.part.js: KiCad-Rahmen der linken Hälfte, Hauptplatine z = 0 … platinenstaerke.
const lage = verbinder.verbinderLinks;
const { start, schritte } = teile.verbinderLinks;

/**
 * Hüllquader in KiCad-Koordinaten der flachen Platine.
 * @param {{ min: number[], max: number[] }} h
 */
function huelle(h) {
  const [x0, y0, z0] = h.min;
  const [x1, y1, z1] = h.max;
  const grundriss = sketch(plane('xy', { offset: z0 }), () => {
    geschlossen([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  });
  return extrude(z1 - z0, grundriss).new();
}

export const magnetverbinderLinks = part('Molekula · Magnetverbinder links (Einbaulage)', () => {
  sketch(plane('xy', { offset: platinenstaerke }), () => {
    trace(teile.links.start, teile.links.schritte).forEach(k => k.guide());
  }).name('PCB links · Edge.Cuts (Bezug)');

  const umriss = sketch('xy', () => {
    trace(start, schritte);
  }).name('Magnetverbinder links · Edge.Cuts');
  const platte = extrude(platinenstaerke, umriss).new().name('Platine');
  color('#b8862b', platte);

  sketch(plane('xy', { offset: platinenstaerke }), () => {
    for (const b of bohrungen.filter(b => b.teil === 'verbinderLinks')) circle(b.mitte, b.bohrung).name(`${b.ref} · Ø${b.bohrung}`);
  }).name('Bohrungen H3/H4');
  cut().name('Bohrungen durchgehend');

  // Bauraum der Bauteile laut Onshape-Modell, als Hüllquader.
  const magnet = huelle(lage.huellen.magnet).name('Magnetbuchse J11 · Hülle (Onshape)');
  color('#5a6270', magnet);
  const ffc = huelle(lage.huellen.ffc).name('FFC-Stecker J9 · Hülle (Onshape)');
  color('#c9c9c9', ffc);

  // Einbaulage: aufstellen (KiCad +y nach unten), um Z drehen, verschieben.
  rotate('x', -90, platte, magnet, ffc).name('Aufstellen');
  rotate('z', lage.drehungZ, platte, magnet, ffc).name(`Drehen ${lage.drehungZ}°`);
  translate(lage.ursprung[0], lage.ursprung[1], lage.ursprung[2] + platinenstaerke, platte, magnet, ffc).name('In Einbaulage schieben');
});
