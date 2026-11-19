import { param, rotate, translate } from 'fluidcad/core';
import { platinenstaerke, teile } from './pcb-referenz.js';

// Lage der drei Platinen in der fertigen Tastatur ohne Magnetverbinder.
//
// Weltkoordinaten: XY wie KiCad (pcb-referenz.js), z = 0 ist die Tischfläche.
// Jede Platine wird in ihrem eigenen Rahmen gebaut (KiCad-XY, z = 0 Platinenunterseite,
// z = platinenstaerke Oberseite) und dann mit einer Folge aus Verschiebungen und
// Drehungen um Weltachsen an ihren Platz gesetzt. Dieselbe Folge gilt für alles, was
// an der Platine hängt: Schalter, Bauteile und die Gehäuseteile der Region.
//
// - Mitte: umgedreht eingebaut (KiCad-B-Seite oben), damit Encoder und Helios oben liegen.
// - Hälften: um Kabelspalt nach außen gerückt und um eine Achse parallel zur
//   Innenkante gekippt (Tenting): die Innenkanten oben, die Außenseiten unten, wie ein
//   Dach. Alles wird so weit angehoben, dass die Außenkanten auf dem Tisch stehen; die
//   Mitte sitzt flach auf Höhe der Innenkanten.

/** Innenkante der Hälften in KiCad-X (±). */
export const INNENKANTE_X = 14.5;

/**
 * Layout-Parameter. Wird im Rumpf jedes Teils aufgerufen, damit alle Teile dieselben
 * Regler haben. Die Assembly reicht ihre Werte per insert(teil, { … }) durch.
 */
export function layoutParameter() {
  return {
    tenting: param('Tenting (°)', 0, 'number', { min: 0, max: 35, step: 1 }),
    kippachse: param('Kippachse innen (mm)', 0, 'number', { min: 0, max: 30, step: 0.5 }),
    kabelspalt: param('Kabelspalt (mm)', 3, 'number', { min: 1, max: 15, step: 0.5 }),
    boden: param('Bodenstärke (mm)', 1.6, 'number', { min: 1.2, max: 3, step: 0.1 }),
    unterraum: param('Raum unter den Platinen (mm)', 2.5, 'number', { min: 2, max: 6, step: 0.1 }),
  };
}

// Außenwand und Spiel der Schalen für die Berechnung der Anhebung (Entwurfswerte aus
// schale.js; ein etwas größerer Wert schadet nicht, der Keil wird am Tisch beschnitten).
const RAND_AUSSEN = 2.5;

/**
 * Anhebung beim Tenting: so viel, dass die Unterseite der Hälften an ihrer äußersten Stelle
 * gerade den Tisch erreicht.
 */
export function anhebung(p) {
  if (!(p.tenting > 0)) return 0;
  const w = (p.tenting * Math.PI) / 180;
  const zh0 = p.boden + p.unterraum;
  const { ax, verschiebung } = haelftenKippung('links', p);
  const t = teile.links;
  const xs = [t.start, ...t.schritte].flatMap(s => (s.length === 4 ? [s[0], s[2]] : [s[0]]));
  const dmax = Math.max(...xs.map(x => Math.abs(x + verschiebung - ax))) + RAND_AUSSEN;
  return Math.max(0, dmax * Math.sin(w) - zh0 * (1 - Math.cos(w)));
}

/** Höhe der Platinenunterseite über dem Tisch (Mitte und Kippachse der Hälften). */
export const platinenHoehe = p => p.boden + p.unterraum + anhebung(p);

/**
 * Schritte, die eine Platine aus ihrem Rahmen an ihren Platz bringen.
 * Ein Schritt ist { t: [x, y, z] } oder { r: ['x' | 'y' | 'z', grad] }.
 * @param {'links' | 'mitte' | 'rechts'} region
 */
export function lage(region, p) {
  const z = platinenHoehe(p);
  if (region === 'mitte') {
    const d = platinenstaerke / 2;
    return [{ t: [0, 0, -d] }, { r: ['y', 180] }, { t: [0, 0, d + z] }];
  }
  const { phi, ax, verschiebung } = haelftenKippung(region, p);
  return [
    { t: [verschiebung, 0, z] },
    { t: [-ax, 0, -z] },
    { r: ['y', phi] },
    { t: [ax, 0, z] },
  ];
}

/**
 * Kippung einer Hälfte: Winkel um Y (phi), Lage der Kippachse in X (ax, auf Höhe der
 * Platinenunterseite) und Verschiebung nach außen um den Kabelspalt.
 * @param {'links' | 'rechts'} region
 */
export function haelftenKippung(region, p) {
  const seite = region === 'links' ? -1 : 1;
  // Kippachse: parallel zur Innenkante auf Höhe der Platinenunterseite, von der
  // (verschobenen) Innenkante um kippachse zur Mitte hin versetzt. Bei 0 liegt die
  // Innenkante der Hälfte auf gleicher Höhe wie die Mittelplatine. Positiver Winkel um Y
  // senkt bei der rechten Hälfte die Außenseite (+X), bei der linken entsprechend negativ.
  return {
    phi: seite * p.tenting,
    ax: seite * (INNENKANTE_X + p.kabelspalt - p.kippachse),
    verschiebung: seite * p.kabelspalt,
  };
}

/** Wendet die Schritte auf FluidCAD-Körper an. Leere Schritte entfallen. */
export function platzieren(schritte, ...koerper) {
  for (const s of schritte) {
    if (s.t && s.t.some(v => Math.abs(v) > 1e-9)) translate(s.t[0], s.t[1], s.t[2], ...koerper);
    if (s.r && Math.abs(s.r[1]) > 1e-9) rotate(s.r[0], s.r[1], ...koerper);
  }
}

/** Dieselben Schritte als reine Rechnung für einen Punkt. */
export function punkt(schritte, p) {
  let [x, y, z] = p;
  for (const s of schritte) {
    if (s.t) {
      x += s.t[0];
      y += s.t[1];
      z += s.t[2];
    } else {
      const w = (s.r[1] * Math.PI) / 180;
      const [c, n] = [Math.cos(w), Math.sin(w)];
      if (s.r[0] === 'x') [y, z] = [y * c - z * n, y * n + z * c];
      if (s.r[0] === 'y') [x, z] = [x * c + z * n, -x * n + z * c];
      if (s.r[0] === 'z') [x, y] = [x * c - y * n, x * n + y * c];
    }
  }
  return [x, y, z];
}

/**
 * Lage eines KiCad-3D-Modells im Rahmen seiner Platine (z = 0 Unterseite).
 * KiCad dreht das Modell um X, Y, Z, verschiebt es um offset (Y nach oben) und setzt es
 * auf die Oberseite. Auf der Unterseite wird es zusätzlich um Y gespiegelt gedreht.
 * @param {{ mitte: number[], drehung: number, seite: string }} bauteil
 * @param {{ versatz: number[], drehung: number[] }} modell
 */
export function modellLage(bauteil, modell) {
  const [rx, ry, rz] = modell.drehung;
  const schritte = [];
  if (rx) schritte.push({ r: ['x', rx] });
  if (ry) schritte.push({ r: ['y', ry] });
  if (rz) schritte.push({ r: ['z', rz] });
  schritte.push({ t: modell.versatz });
  if (bauteil.seite === 'unten') schritte.push({ r: ['y', 180] });
  else schritte.push({ t: [0, 0, platinenstaerke] });
  schritte.push({ r: ['z', bauteil.drehung] });
  schritte.push({ t: [bauteil.mitte[0], bauteil.mitte[1], 0] });
  return schritte;
}
