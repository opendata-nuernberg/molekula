import { color, part } from 'fluidcad/core';
import { huellen } from './huellen.js';
import { layoutParameter, platinenHoehe } from './layout.js';
import { bauteile, bohrungen, platinenstaerke, schalter } from './pcb-referenz.js';
import { bruecke, kreisKoerper, rechteckKoerper, schalenParameter, umrissKoerper, weltQuader } from './schale.js';

// Unterschale der Tastatur ohne Magnetverbinder: ein Stück für beide Hälften und die Mitte.
// Trennfläche zur Oberschale ist die Platinenoberseite jeder Region.
//
// - Hälften: liegen mit der Kante auf einer umlaufenden Auflage und werden von der
//   Oberschale geklemmt (keine Befestigungsbohrungen). Beim Tenting (innen hoch, außen tief)
//   wächst darunter ein Keil bis zum Tisch. Er ist massiv modelliert: ein geschlossener
//   Hohlraum hätte eine flach geneigte Decke, die sich nicht ohne eingeschlossene Stützen
//   drucken lässt. Leicht wird der Keil über die Füllung im Slicer.
// - Mitte: umgedreht eingebaut, mit M2-Schrauben von unten in H5–H7 und einem Loch für
//   den Reset-Taster. Beim Tenting steht sie auf einem Sockel; Schraubenköpfe und
//   Reset-Zugang reichen dann als Bohrungen von der Tischseite hinauf.
// - Kabeldurchlass: an jeder Innenkante ein Kanal für das FFC-Kabel von J4/J5 zur Mitte.
// - Freiräume: Wo Hotswap-Sockets oder die Stiftleisten des Helios über die Auflage ragen,
//   ist sie ausgespart.

const SCHRAUBE = { loch: 2.4, kopf: 4.4, kopftiefe: 2.0, dom: 6 };
const RESET_LOCH = 3.0;
// Schnittkörper an der Trennfläche minimal größer als die Außenwand der Hälfte: deckungsgleiche
// Seitenflächen lassen den Ausschnitt in OpenCascade sonst still scheitern.
const DECKUNG = 0.05;
const KABEL = { y: [-50, -28], inHaelfte: 8, inMitte: 5 };
const FREIRAUM = 0.5;
// Lötseite der Helios-Stiftleisten unter der umgedrehten Mittelplatine (KiCad-Pads ± Rand).
const HELIOS_PINS = { x: 8.9, y: [-35, 0.5] };

/** Grundriss einer Hülle über alle Stufen. */
function grundriss(name) {
  const st = huellen[name].stufen;
  return {
    min: [Math.min(...st.map(t => t.min[0])), Math.min(...st.map(t => t.min[1]))],
    max: [Math.max(...st.map(t => t.max[0])), Math.max(...st.map(t => t.max[1]))],
  };
}

export const unterschale = part('Molekula · Unterschale', () => {
  const p = layoutParameter();
  const s = schalenParameter();
  const PT = platinenstaerke;
  const zh = platinenHoehe(p);
  const unten = -(p.unterraum + p.boden);
  // Bis zum Tisch: Unterkante der Hälften reicht beim Tenting innen weit nach unten, der Rest
  // wird am Tisch abgeschnitten. Die Mitte steht auf einem massiven Sockel.
  const tief = p.tenting > 0 ? zh / Math.cos((p.tenting * Math.PI) / 180) + 5 : 0;

  // Drei getrennte Körper: linke und rechte Hälfte (gekippt) und die Mitte mit den Brücken
  // (flach). Vereinigt werden sie nicht: Boolesche Operationen zwischen gekippten und flachen
  // Körpern sind in FluidCAD unzuverlässig (sie scheitern still oder verlieren Körper). Die
  // Körper überlappen sich an der Fuge; der Slicer vereinigt überlappende Teile eines Objekts.
  // Jeder Ausschnitt wirkt auf alle drei, jeweils mit eigenem, getrenntem Zielkörper.
  const links = umrissKoerper('links', p, s.spiel + s.wand, unten - tief, PT, 'Links · außen');
  const rechts = umrissKoerper('rechts', p, s.spiel + s.wand, unten - tief, PT, 'Rechts · außen');
  const mitte = umrissKoerper('mitte', p, s.spiel + s.wand, -zh, PT, 'Mitte · außen');
  for (const seite of [-1, 1]) bruecke(seite, p, s, 0, zh + PT, `Brücke ${seite < 0 ? 'links' : 'rechts'}`, { add: [mitte] });
  const alle = [links, rechts, mitte];
  if (tief > 0) {
    weltQuader(p, -300, 0, 'Unter dem Tisch', { remove: [links, rechts] });
    for (const [haelfte, seite, R] of [[links, -1, 'Links'], [rechts, 1, 'Rechts']]) {
      // Gekippt schwingt der Keil unter der Innenkante zur Mitte hin aus; jenseits der
      // Mittellinie abschneiden, damit sich die Hälften nicht überlappen.
      rechteckKoerper('welt', p, [{ mitte: [-seite * 150, -40], breite: 300, hoehe: 400 }], -300, 300, `${R} · jenseits der Mitte`, { remove: [haelfte] });
    }
  }

  // Hälften: Raum unter der Platine mit Auflage, Platinentasche, Kabeldurchlass, Sockets.
  // Über der gekippten Trennfläche gehört alles zur Oberschale (betrifft Mitte und Brücken).
  const sg = grundriss('sockel');
  const sc = [(sg.min[0] + sg.max[0]) / 2, (sg.min[1] + sg.max[1]) / 2];
  for (const [region, seite, haelfte] of [['links', -1, links], ['rechts', 1, rechts]]) {
    const R = region === 'links' ? 'Links' : 'Rechts';
    const ziel = [haelfte, mitte];
    if (p.tenting > 0) umrissKoerper(region, p, s.spiel + s.wand + DECKUNG, PT, PT + 60, `${R} · über der Trennfläche`, { remove: [mitte] });
    umrissKoerper(region, p, -s.auflage, -p.unterraum, 0.01, `${R} · Raum unter der Platine`, { remove: ziel });
    umrissKoerper(region, p, s.spiel, 0, PT + 1, `${R} · Platinentasche`, { remove: ziel });
    const x0 = seite * (14.5 - p.kabelspalt - KABEL.inMitte);
    const x1 = seite * (14.5 + KABEL.inHaelfte);
    rechteckKoerper(region, p,
      [{ mitte: [(x0 + x1) / 2, (KABEL.y[0] + KABEL.y[1]) / 2], breite: Math.abs(x1 - x0), hoehe: KABEL.y[1] - KABEL.y[0] }],
      -p.unterraum, PT + 1, `${R} · Kabeldurchlass`, { remove: ziel });
    rechteckKoerper(region, p,
      schalter.filter(t => t.teil === region).map(t => {
        const w = (t.drehung * Math.PI) / 180;
        return {
          mitte: [t.mitte[0] + sc[0] * Math.cos(w) - sc[1] * Math.sin(w), t.mitte[1] + sc[0] * Math.sin(w) + sc[1] * Math.cos(w)],
          breite: sg.max[0] - sg.min[0] + 2 * FREIRAUM,
          hoehe: sg.max[1] - sg.min[1] + 2 * FREIRAUM,
          drehung: t.drehung,
        };
      }),
      -p.unterraum, 0.01, `${R} · Freiraum Socket`, { remove: [haelfte] });
  }

  // Mitte, im Rahmen der umgedrehten Platine: KiCad-X ist gespiegelt.
  umrissKoerper('mitte', p, -s.auflage, -p.unterraum, 0.01, 'Mitte · Raum unter der Platine', { remove: alle });
  umrissKoerper('mitte', p, s.spiel, 0, PT + 1, 'Mitte · Platinentasche', { remove: alle });
  rechteckKoerper('mitte', p,
    [{ mitte: [0, (HELIOS_PINS.y[0] + HELIOS_PINS.y[1]) / 2], breite: 2 * HELIOS_PINS.x, hoehe: HELIOS_PINS.y[1] - HELIOS_PINS.y[0] }],
    -p.unterraum, 0.01, 'Mitte · Freiraum Helios-Stiftleisten', { remove: [mitte] });
  const schrauben = bohrungen.filter(b => b.teil === 'mitte').map(b => [-b.mitte[0], b.mitte[1]]);
  const reset = bauteile.find(b => b.ref === 'SW37');
  kreisKoerper('mitte', p, schrauben, SCHRAUBE.dom, -p.unterraum, 0, 'Mitte · Schraubdom', { add: [mitte] });
  // Von der Tischseite: Schraubenköpfe sitzen beim Tenting tief im Sockel, die Senkung
  // reicht deshalb vom Tisch bis knapp unter den Boden der Mitte.
  kreisKoerper('mitte', p, schrauben, SCHRAUBE.loch, -zh - 1, 1, 'Mitte · Schraubenloch', { remove: alle });
  kreisKoerper('mitte', p, schrauben, SCHRAUBE.kopf, -zh - 1, unten + SCHRAUBE.kopftiefe, 'Mitte · Schraubenkopf', { remove: alle });
  kreisKoerper('mitte', p, [[-reset.mitte[0], reset.mitte[1]]], RESET_LOCH, -zh - 1, 1, 'Mitte · Reset-Zugang', { remove: alle });

  color('#4a4f57', ...alle);
});
