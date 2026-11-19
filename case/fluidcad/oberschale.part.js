import { color, part } from 'fluidcad/core';
import { huellen } from './huellen.js';
import { layoutParameter, platinenHoehe } from './layout.js';
import { bauteile, platinenstaerke, schalter } from './pcb-referenz.js';
import { bruecke, kreisKoerper, rechteckKoerper, schalenParameter, umrissKoerper } from './schale.js';

// Oberschale der Tastatur ohne Magnetverbinder: ein Stück für beide Hälften und die Mitte.
//
// - Hälften: umlaufender Rand. Eine dünne Lippe greift um klemmrand über die Platinenkante
//   und klemmt die Platine auf die Auflage der Unterschale. Darüber ist der Rand um die
//   Platine und um jede Kappe freigestellt.
// - Mitte: geschlossener Deckel über Helios, FFC-Buchsen und Kabeln, mit Loch für die
//   Encoderbuchse und Ausschnitt für den USB-C-Stecker.
// - Brücken über dem Spalt zwischen Hälften und Mitte decken die FFC-Kabel ab.

// Encoder EC11: Gewindebuchse Ø 7 mm.
const ENCODER_BUCHSE = 7;
const ENCODER_SPIEL = 0.4;
// USB-C-Stecker mit Umspritzung, Mitte über der Buchse des Helios.
const USB = { breite: 12.5, hoehe: 7, buchseY: [1.616, 4.644], buchseZ: [0.111, 3.272] };
// Schnittkörper an der Trennfläche minimal größer als die Außenwand der Hälfte: deckungsgleiche
// Seitenflächen lassen den Ausschnitt in OpenCascade sonst still scheitern.
const DECKUNG = 0.05;
const KABEL = { y: [-50, -28], inHaelfte: 8, inMitte: 5, hoehe: 3 };
// Freistellung an der oberen Deckelwand für die Kante der Helios-Platine (halbe Breite, halbe Tiefe um y = 0).
const HELIOS_RAND = { x: 9.5, y: 1.4 };

/** Rechteck um alle Stufen einer Hülle. */
function grundriss(name) {
  const st = huellen[name].stufen;
  return {
    min: [Math.min(...st.map(s => s.min[0])), Math.min(...st.map(s => s.min[1]))],
    max: [Math.max(...st.map(s => s.max[0])), Math.max(...st.map(s => s.max[1]))],
  };
}

export const oberschale = part('Molekula · Oberschale', () => {
  const p = layoutParameter();
  const s = schalenParameter();
  const PT = platinenstaerke;
  const zh = platinenHoehe(p);
  const oben = PT + s.randhoehe;

  // Drei getrennte Körper: Ränder der Hälften (gekippt) und Deckel der Mitte mit den Brücken
  // (flach), wie in der Unterschale nicht vereinigt (siehe dort). Unter der gekippten
  // Trennfläche gehört alles zur Unterschale (betrifft Deckel und Brücken).
  const links = umrissKoerper('links', p, s.spiel + s.wand, PT, oben, 'Links · Rand');
  const rechts = umrissKoerper('rechts', p, s.spiel + s.wand, PT, oben, 'Rechts · Rand');
  const mitte = umrissKoerper('mitte', p, s.spiel + s.wand, PT, PT + s.deckelhoehe, 'Mitte · Deckel');
  for (const seite of [-1, 1]) bruecke(seite, p, s, zh + PT, zh + oben, `Brücke ${seite < 0 ? 'links' : 'rechts'}`, { add: [mitte] });
  const ziel = [links, rechts, mitte];
  if (p.tenting > 0) {
    for (const region of ['links', 'rechts']) {
      umrissKoerper(region, p, s.spiel + s.wand + DECKUNG, -80, PT, `${region === 'links' ? 'Links' : 'Rechts'} · unter der Trennfläche`, { remove: [mitte] });
    }
  }

  // Hälften: Klemmlippe, Öffnung über der Platine, Freiraum um die Kappen, Kabeldurchlass.
  const kappe = grundriss('kappe');
  const c = [(kappe.min[0] + kappe.max[0]) / 2, (kappe.min[1] + kappe.max[1]) / 2];
  for (const [region, seite] of [['links', -1], ['rechts', 1]]) {
    const R = region === 'links' ? 'Links' : 'Rechts';
    umrissKoerper(region, p, -s.klemmrand, PT - 1, oben + 1, `${R} · Öffnung innen`, { remove: ziel });
    umrissKoerper(region, p, s.spiel, PT + s.lippe, oben + 1, `${R} · Öffnung über der Lippe`, { remove: ziel });
    rechteckKoerper(region, p,
      schalter.filter(t => t.teil === region).map(t => {
        const w = (t.drehung * Math.PI) / 180;
        return {
          mitte: [t.mitte[0] + c[0] * Math.cos(w) - c[1] * Math.sin(w), t.mitte[1] + c[0] * Math.sin(w) + c[1] * Math.cos(w)],
          breite: kappe.max[0] - kappe.min[0] + 2 * s.kappenspiel,
          hoehe: kappe.max[1] - kappe.min[1] + 2 * s.kappenspiel,
          drehung: t.drehung,
        };
      }),
      PT + s.lippe, oben + 1, `${R} · Freiraum Kappe`, { remove: ziel });
    const x0 = seite * (14.5 - p.kabelspalt - KABEL.inMitte);
    const x1 = seite * (14.5 + KABEL.inHaelfte);
    rechteckKoerper(region, p,
      [{ mitte: [(x0 + x1) / 2, (KABEL.y[0] + KABEL.y[1]) / 2], breite: Math.abs(x1 - x0), hoehe: KABEL.y[1] - KABEL.y[0] }],
      PT - 1, PT + KABEL.hoehe, `${R} · Kabeldurchlass`, { remove: ziel });
  }

  // Mitte im Rahmen der umgedrehten Platine (KiCad-X gespiegelt).
  umrissKoerper('mitte', p, s.spiel, PT - 1, PT + s.deckelhoehe - s.deckelstaerke, 'Mitte · Raum unter dem Deckel', { remove: ziel });
  const enc = bauteile.find(b => b.ref === 'SW38');
  kreisKoerper('mitte', p, [[-enc.mitte[0], enc.mitte[1]]], ENCODER_BUCHSE + 2 * ENCODER_SPIEL, PT, PT + s.deckelhoehe + 1, 'Mitte · Encoderbuchse', { remove: ziel });
  // Helios auf der KiCad-Oberseite mit Stiftleisten, Modellversatz z -7.8; nach dem Umdrehen
  // liegt die Buchse über der Platine. z' = PT - z.
  const helios = bauteile.find(b => b.ref === 'J13');
  const hm = helios.modelle.find(m => m.datei === 'splinky-headers.step');
  const buchseY = USB.buchseY.map(y => helios.mitte[1] + hm.versatz[1] + y);
  const buchseZ = USB.buchseZ.map(z => PT - (PT + hm.versatz[2] + z));
  const zUsb = (buchseZ[0] + buchseZ[1]) / 2;
  rechteckKoerper('mitte', p,
    [{ mitte: [-helios.mitte[0], buchseY[0] + 10], breite: USB.breite, hoehe: 20 }],
    zUsb - USB.hoehe / 2, zUsb + USB.hoehe / 2, 'Mitte · USB-C', { remove: ziel });
  // Die Platine des Helios ragt an der Oberkante bis an die Deckelwand: dort innen freistellen.
  rechteckKoerper('mitte', p,
    [{ mitte: [-helios.mitte[0], 0], breite: 2 * HELIOS_RAND.x, hoehe: 2 * HELIOS_RAND.y }],
    PT - 1, PT + s.deckelhoehe - s.deckelstaerke, 'Mitte · Freiraum Helios an der Wand', { remove: ziel });

  color('#6b7380', ...ziel);
});
