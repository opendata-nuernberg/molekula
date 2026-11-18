import { arc, line } from 'fluidcad/core';

/**
 * Zeichnet eine Kontur aus pcb-referenz.js in die aktuelle Skizze.
 * Ein Schritt ist [x, y] für eine Linie oder [x, y, mitteX, mitteY] für einen
 * Bogen durch den KiCad-Zwischenpunkt.
 * @param {number[]} start
 * @param {number[][]} schritte
 */
export function trace(start, schritte) {
  let [x, y] = start;
  return schritte.map(([endX, endY, midX, midY]) => {
    /** @type {[number, number]} */
    const from = [x, y];
    /** @type {[number, number]} */
    const to = [endX, endY];
    x = endX;
    y = endY;
    if (midX === undefined) return line(from, to);

    // Kreis durch Start, Zwischenpunkt und Ende. Die Determinante gibt auch die Drehrichtung.
    const ax = midX - from[0];
    const ay = midY - from[1];
    const bx = endX - from[0];
    const by = endY - from[1];
    const determinant = 2 * (ax * by - ay * bx);
    const aSquared = ax * ax + ay * ay;
    const bSquared = bx * bx + by * by;
    /** @type {[number, number]} */
    const center = [
      from[0] + (by * aSquared - ay * bSquared) / determinant,
      from[1] + (ax * bSquared - bx * aSquared) / determinant,
    ];
    const edge = arc(from, to, center);
    return determinant < 0 ? edge.cw() : edge;
  });
}

/**
 * Geschlossener Linienzug durch die gegebenen Ecken.
 * @param {[number, number][]} ecken
 */
export function geschlossen(ecken) {
  return ecken.map((p, i) => line(p, ecken[(i + 1) % ecken.length]));
}

/**
 * Eckpunkte eines gedrehten Rechtecks um eine Mitte, Drehung in Grad gegen den Uhrzeigersinn.
 * @param {number[]} mitte
 * @param {number} breite
 * @param {number} hoehe
 * @param {number} drehung
 */
export function rechteck(mitte, breite, hoehe, drehung) {
  const w = (drehung * Math.PI) / 180;
  const [c, s] = [Math.cos(w), Math.sin(w)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const dx = (u * breite) / 2;
    const dy = (v * hoehe) / 2;
    /** @type {[number, number]} */
    const p = [mitte[0] + dx * c - dy * s, mitte[1] + dx * s + dy * c];
    return p;
  });
}
