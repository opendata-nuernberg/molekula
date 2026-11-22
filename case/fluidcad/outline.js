import { arc, line } from 'fluidcad/core';

/**
 * Draws an outline from pcb-reference.js into the current sketch.
 * A step is [x, y] for a line or [x, y, midX, midY] for an arc through the
 * KiCad midpoint.
 * @param {number[]} start
 * @param {number[][]} steps
 */
export function trace(start, steps) {
  let [x, y] = start;
  return steps.map(([endX, endY, midX, midY]) => {
    /** @type {[number, number]} */
    const from = [x, y];
    /** @type {[number, number]} */
    const to = [endX, endY];
    x = endX;
    y = endY;
    if (midX === undefined) return line(from, to);

    // Circle through start, midpoint and end. The determinant also gives the direction.
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
 * Closed polyline through the given corners.
 * @param {[number, number][]} corners
 */
export function closed(corners) {
  return corners.map((p, i) => line(p, corners[(i + 1) % corners.length]));
}

/**
 * Corners of a rotated rectangle around a center, rotation in degrees counter-clockwise.
 * @param {number[]} center
 * @param {number} width
 * @param {number} height
 * @param {number} rotation
 */
export function rectangle(center, width, height, rotation) {
  const w = (rotation * Math.PI) / 180;
  const [c, s] = [Math.cos(w), Math.sin(w)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const dx = (u * width) / 2;
    const dy = (v * height) / 2;
    /** @type {[number, number]} */
    const p = [center[0] + dx * c - dy * s, center[1] + dx * s + dy * c];
    return p;
  });
}
