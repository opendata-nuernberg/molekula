import { circle, extrude, offset, param, plane, sketch } from 'fluidcad/core';
import { geschlossen, rechteck, trace } from './kontur.js';
import { haelftenKippung, platinenHoehe } from './layout.js';
import { teile } from './pcb-referenz.js';

// Gemeinsame Bausteine für Unter- und Oberschale.
//
// Jeder Körper wird direkt in seiner Endlage skizziert und extrudiert: Für die Hälften liegt
// die Skizzenebene schon gekippt (siehe ebene()). So laufen alle Vereinigungen und
// Ausschnitte als .add()/.remove() beim Extrudieren. Dieser Weg arbeitet in FluidCAD mit
// einer kleinen Toleranz. fuse() und subtract() nachträglich verschobener Körper rechnen
// ohne Toleranz und scheitern an der gekippten Fuge still (Ergebnis bleibt unverändert).
//
// Koordinaten wie im Rahmen der jeweiligen Platine: KiCad-XY, z = 0 Platinenunterseite.
// Region 'welt': XY wie KiCad, z ab Tisch, ungekippt.

/** Gehäuseparameter, im Rumpf jedes Schalenteils aufgerufen. Werte sind Entwurfswerte. */
export function schalenParameter() {
  return {
    wand: param('Wandstärke (mm)', 1.8, 'number', { min: 1.2, max: 3, step: 0.1 }),
    spiel: param('PCB-Spiel je Seite (mm)', 0.6, 'number', { min: 0.2, max: 1.5, step: 0.1 }),
    auflage: param('Auflage unter der Platinenkante (mm)', 1.0, 'number', { min: 0.5, max: 3, step: 0.1 }),
    randhoehe: param('Randhöhe über Platine (mm)', 4, 'number', { min: 1, max: 12, step: 0.1 }),
    klemmrand: param('Klemmrand über der Platine (mm)', 0.8, 'number', { min: 0, max: 3, step: 0.1 }),
    lippe: param('Stärke Klemmlippe (mm)', 0.8, 'number', { min: 0.4, max: 2, step: 0.1 }),
    kappenspiel: param('Spiel um die Kappen (mm)', 0.75, 'number', { min: 0.3, max: 2, step: 0.05 }),
    deckelhoehe: param('Deckelhöhe Mitte über Platine (mm)', 9.5, 'number', { min: 4, max: 20, step: 0.1 }),
    deckelstaerke: param('Deckelstärke (mm)', 1.6, 'number', { min: 1, max: 3, step: 0.1 }),
  };
}

/**
 * Skizzenebene auf Höhe z0 im Rahmen einer Region, in Endlage, und die Verschiebung dx,
 * um die eine KiCad-X-Koordinate in der Skizze wandert (Y bleibt).
 *
 * FluidCADs plane('xy', { rotateY, offset }) legt den Ursprung auf (0, 0, offset) und dreht
 * die Ebene um diesen Punkt um Y. Für die Hälften gilt (layout.js): Welt = A + Ry(φ)·(X, y, z)
 * mit A = (ax, 0, zh) auf der Kippachse und X = x + verschiebung − ax. Gleichsetzen mit
 * (0, 0, o) + Ry(φ)·(u, y, 0) ergibt u = X + a, a = (ax + z0·sin φ)/cos φ,
 * o = zh + a·sin φ + z0·cos φ.
 */
export function ebene(region, p, z0) {
  if (region === 'welt') return { ebene: plane('xy', { offset: z0 }), dx: 0 };
  const zh = platinenHoehe(p);
  if (region === 'mitte') return { ebene: plane('xy', { offset: zh + z0 }), dx: 0 };
  const { phi, ax, verschiebung } = haelftenKippung(region, p);
  const w = (phi * Math.PI) / 180;
  const a = (ax + z0 * Math.sin(w)) / Math.cos(w);
  const o = zh + a * Math.sin(w) + z0 * Math.cos(w);
  return {
    ebene: Math.abs(phi) > 1e-9 ? plane('xy', { rotateY: phi, offset: o }) : plane('xy', { offset: o }),
    dx: verschiebung - ax + a,
  };
}

/**
 * Neuer Körper; mit modus { add: [...] } in diese Körper vereinigt, mit { remove: [...] }
 * aus ihnen ausgeschnitten. Ein Ausschnitt läuft wie cut() gegen die Skizzennormale: seine
 * Skizze liegt deshalb oben (z1), siehe start().
 */
function anwenden(e, modus) {
  if (modus?.add) return e.add().scope(...modus.add);
  if (modus?.remove) return e.remove().scope(...modus.remove);
  return e.new();
}

/** Höhe der Skizzenebene: unten für Körper, oben für Ausschnitte. */
const start = (modus, z0, z1) => (modus?.remove ? z1 : z0);

const verschiebe = (punkte, dx) => punkte.map(s => (s.length === 4 ? [s[0] + dx, s[1], s[2] + dx, s[3]] : [s[0] + dx, s[1]]));

/**
 * Umriss einer Platine, um abstand versetzt (positiv nach außen), als Prisma von z0 bis z1
 * im Rahmen von region. umriss: Schlüssel in teile (Standard: region).
 */
export function umrissKoerper(region, p, abstand, z0, z1, name, modus = null, umriss = region) {
  const teil = teile[umriss];
  const { ebene: e, dx } = ebene(region, p, start(modus, z0, z1));
  const skizze = sketch(e, () => {
    const kanten = trace(verschiebe([teil.start], dx)[0], verschiebe(teil.schritte, dx));
    if (Math.abs(abstand) > 1e-9) {
      kanten.forEach(k => k.guide());
      offset(abstand, ...kanten);
    }
  }).name(`${name} · Skizze`);
  return anwenden(extrude(z1 - z0, skizze), modus).name(name);
}

/**
 * Gedrehte Rechtecke, je ein eigener Körper (Boolesche Operationen verarbeiten von einem
 * Körper aus mehreren Teilen nur das erste), als Prismen von z0 bis z1.
 * @param {{ mitte: number[], breite: number, hoehe: number, drehung?: number }[]} rechtecke
 */
export function rechteckKoerper(region, p, rechtecke, z0, z1, name, modus = null) {
  return rechtecke.map((r, i) => {
    const { ebene: e, dx } = ebene(region, p, start(modus, z0, z1));
    const skizze = sketch(e, () => {
      geschlossen(rechteck([r.mitte[0] + dx, r.mitte[1]], r.breite, r.hoehe, r.drehung ?? 0));
    }).name(`${name} ${i + 1} · Skizze`);
    return anwenden(extrude(z1 - z0, skizze), modus).name(rechtecke.length > 1 ? `${name} ${i + 1}` : name);
  });
}

/** Kreise mit Durchmesser d, je ein eigener Körper, als Zylinder von z0 bis z1. */
export function kreisKoerper(region, p, mitten, d, z0, z1, name, modus = null) {
  return mitten.map((m, i) => {
    const { ebene: e, dx } = ebene(region, p, start(modus, z0, z1));
    const skizze = sketch(e, () => {
      circle([m[0] + dx, m[1]], d);
    }).name(`${name} ${i + 1} · Skizze`);
    return anwenden(extrude(z1 - z0, skizze), modus).name(mitten.length > 1 ? `${name} ${i + 1}` : name);
  });
}

/**
 * Brücke zwischen Mitte und Hälfte (Welt, ungekippt). Füllt den Spalt aus Panelsteg und
 * Kabelspalt zwischen den Außenwänden und reicht etwas in beide Taschen hinein; die
 * Innenräume werden danach wieder ausgeschnitten.
 * @param {number} seite -1 links, +1 rechts
 */
export function bruecke(seite, p, s, z0, z1, name, modus = null) {
  const xMitte = 11.5;
  const xHaelfte = 14.5 + p.kabelspalt + 1;
  const y = [-(63 + s.spiel + s.wand) + 0.1, -(8 - s.spiel - s.wand) - 0.1];
  return rechteckKoerper(
    'welt', p,
    [{ mitte: [(seite * (xMitte + xHaelfte)) / 2, (y[0] + y[1]) / 2], breite: xHaelfte - xMitte, hoehe: y[1] - y[0] }],
    z0, z1, name, modus,
  )[0];
}

/** Großer Quader in Weltkoordinaten. */
export function weltQuader(p, z0, z1, name, modus = null) {
  return rechteckKoerper('welt', p, [{ mitte: [0, -40], breite: 600, hoehe: 400 }], z0, z1, name, modus)[0];
}
