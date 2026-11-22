#!/usr/bin/env node
/**
 * Generates ../envelopes.js: simplified envelope bodies of the components from the
 * FluidCAD imports.
 *
 * Run from the repository root (FluidCAD must be linked under case/fluidcad/node_modules):
 *
 *     node case/fluidcad/tools/envelopes.mjs
 *
 * The detailed models (imports/*.brep) are too heavy for the model: hundreds of faces per
 * switch, at 38 positions. A stepped envelope is enough for clearances. The script meshes
 * every group of bodies, slices it into thin layers along z, takes the axis-aligned
 * rectangle around all triangle parts in each layer, and merges neighbouring layers as
 * long as no edge grows by more than TOLERANCE. Every step is the bounding rectangle of
 * its layers, so the envelope always errs on the safe side.
 *
 * Output coordinates: as in the respective import (mm, model frame).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const TARGET = path.join(WORKSPACE, 'envelopes.js');
const LAYER = 0.1;
const TOLERANCE = 0.5;
// Thinner steps are merged with the neighbour that grows the least.
const MIN_HEIGHT = 0.5;
const DIGITS = 2;

// Envelope -> import and its bodies (0-based, in load() order).
const GROUPS = {
  switch: { import: 'choc-v1-with-keycap', bodies: [1], title: 'Choc v1 with stem' },
  keycap: { import: 'choc-v1-with-keycap', bodies: [2], title: 'Keycap' },
  socket: { import: 'choc-v1-with-keycap', bodies: [0, 3, 4], title: 'Hotswap socket' },
  // Threaded bushing and shaft are round: steps from roundFrom up become cylinders instead of boxes.
  encoder: { import: 'ec11-15f', title: 'EC11 with 15 mm shaft', roundFrom: 4.5 },
  helios: { import: 'helios-headers', title: 'Helios on headers' },
  reset: { import: 'skqg-reset', title: 'Reset button SKQG' },
  ffc: { import: 'ffc-12-horizontal', title: 'FFC socket 12-pin' },
};

async function loadOcct() {
  const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
  const entry = path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js');
  const { default: init } = await import(pathToFileURL(entry).href);
  return init({ pthreadPoolSize: 2 });
}

const oc = await loadOcct();

function bodiesOf(name) {
  const file = path.join(WORKSPACE, 'imports', `${name}.brep`);
  oc.FS.writeFile(`/${name}.brep`, fs.readFileSync(file));
  const shape = new oc.TopoDS_Shape();
  oc.BRepTools.Read(shape, `/${name}.brep`, new oc.BRep_Builder(), new oc.Message_ProgressRange());
  const list = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  for (; ex.More(); ex.Next()) list.push(ex.Current());
  return list;
}

function triangles(shape) {
  new oc.BRepMesh_IncrementalMesh(shape, 0.05, false, 0.2, false);
  const tris = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    const loc = new oc.TopLoc_Location();
    const t = oc.BRep_Tool.Triangulation(oc.TopoDS.Face(ex.Current()), loc, 0);
    if (!t) continue;
    const tr = loc.Transformation();
    const p = [];
    for (let k = 1; k <= t.NbNodes(); k++) {
      const q = t.Node(k).Transformed(tr);
      p.push([q.X(), q.Y(), q.Z()]);
    }
    for (let k = 1; k <= t.NbTriangles(); k++) {
      const d = t.Triangle(k);
      tris.push([p[d.Value(1) - 1], p[d.Value(2) - 1], p[d.Value(3) - 1]]);
    }
  }
  return tris;
}

/** Points of a triangle clipped to z0 <= z <= z1 (Sutherland–Hodgman). */
function clipZ(tri, z0, z1) {
  const clip = (poly, inside, intersect) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) out.push(intersect(a, b));
    }
    return out;
  };
  const at = z => (a, b) => {
    const f = (z - a[2]) / (b[2] - a[2]);
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), z];
  };
  let poly = clip(tri, p => p[2] >= z0, at(z0));
  if (poly.length) poly = clip(poly, p => p[2] <= z1, at(z1));
  return poly;
}

function envelope(tris) {
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const t of tris) for (const p of t) {
    zmin = Math.min(zmin, p[2]);
    zmax = Math.max(zmax, p[2]);
  }
  const n = Math.max(1, Math.ceil((zmax - zmin) / LAYER));
  const layers = Array.from({ length: n }, (_, i) => ({ z: [zmin + i * LAYER, Math.min(zmax, zmin + (i + 1) * LAYER)], min: [Infinity, Infinity], max: [-Infinity, -Infinity] }));
  for (const t of tris) {
    const tz0 = Math.min(t[0][2], t[1][2], t[2][2]);
    const tz1 = Math.max(t[0][2], t[1][2], t[2][2]);
    const i0 = Math.max(0, Math.floor((tz0 - zmin) / LAYER));
    const i1 = Math.min(n - 1, Math.floor((tz1 - zmin) / LAYER));
    for (let i = i0; i <= i1; i++) {
      const s = layers[i];
      for (const p of clipZ(t, s.z[0], s.z[1])) {
        s.min[0] = Math.min(s.min[0], p[0]);
        s.min[1] = Math.min(s.min[1], p[1]);
        s.max[0] = Math.max(s.max[0], p[0]);
        s.max[1] = Math.max(s.max[1], p[1]);
      }
    }
  }
  const steps = [];
  for (const s of layers.filter(s => Number.isFinite(s.min[0]))) {
    const last = steps.at(-1);
    const fits = last
      && Math.abs(last.z[1] - s.z[0]) < 1e-6
      && [0, 1].every(k => Math.abs(last.min[k] - s.min[k]) <= TOLERANCE && Math.abs(last.max[k] - s.max[k]) <= TOLERANCE);
    if (fits) {
      last.z[1] = s.z[1];
      last.min = last.min.map((v, k) => Math.min(v, s.min[k]));
      last.max = last.max.map((v, k) => Math.max(v, s.max[k]));
    } else steps.push({ z: [...s.z], min: [...s.min], max: [...s.max] });
  }
  const area = s => (s.max[0] - s.min[0]) * (s.max[1] - s.min[1]);
  const merged = (a, b) => ({ z: [Math.min(a.z[0], b.z[0]), Math.max(a.z[1], b.z[1])], min: a.min.map((v, k) => Math.min(v, b.min[k])), max: a.max.map((v, k) => Math.max(v, b.max[k])) });
  for (;;) {
    const i = steps.findIndex(s => s.z[1] - s.z[0] < MIN_HEIGHT);
    if (i < 0 || steps.length < 2) break;
    const candidates = [i - 1, i + 1].filter(j => j >= 0 && j < steps.length);
    const j = candidates.sort((a, b) => area(merged(steps[i], steps[a])) - area(merged(steps[i], steps[b])))[0];
    const [lo, hi] = [Math.min(i, j), Math.max(i, j)];
    steps.splice(lo, 2, merged(steps[lo], steps[hi]));
  }
  // Round outward so rounding never makes the envelope smaller.
  const down = v => Math.floor(v * 10 ** DIGITS) / 10 ** DIGITS;
  const up = v => Math.ceil(v * 10 ** DIGITS) / 10 ** DIGITS;
  return steps.map(s => ({ z: [down(s.z[0]), up(s.z[1])], min: s.min.map(down), max: s.max.map(up) }));
}

const cache = new Map();
const result = {};
for (const [name, g] of Object.entries(GROUPS)) {
  if (!cache.has(g.import)) cache.set(g.import, bodiesOf(g.import));
  const all = cache.get(g.import);
  const selection = g.bodies ? g.bodies.map(i => all[i]) : all;
  const tris = selection.flatMap(triangles);
  result[name] = { title: g.title, import: g.import, ...(g.roundFrom !== undefined && { roundFrom: g.roundFrom }), steps: envelope(tris) };
  console.log(`${name}: ${result[name].steps.length} steps`);
}

const output = `// Generated by tools/envelopes.mjs from the FluidCAD imports (imports/*.brep).
// Do not edit by hand: run the script again and review the diff.
// Stepped envelope boxes of the components in the model frame of the import, mm.
// Every step: z = [bottom, top], min/max = rectangle in XY. With roundFrom: steps from this height
// up are cylinders around the rectangle centre (diameter = longer side). Tolerance ${TOLERANCE} mm, layers ${LAYER} mm, steps at least ${MIN_HEIGHT} mm high.

export const envelopes = ${JSON.stringify(result, null, 1)};
`;
fs.writeFileSync(TARGET, output);
console.log(`written: ${path.relative(path.resolve(WORKSPACE, '..', '..'), TARGET)}`);
process.exit(0);
