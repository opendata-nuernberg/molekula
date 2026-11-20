#!/usr/bin/env node
/**
 * Print files for the keycaps and the encoder knob (STEP and STL).
 *
 * Run from the repository root (FluidCAD must be linked under case/fluidcad/node_modules):
 *
 *     node case/fluidcad/tools/keycap-files.mjs [hexagon|dots]   # homing mark, default hexagon
 *
 * The caps are rendered from keycap.part.js in a private FluidCAD server (an open editor is
 * not affected) and turned into print orientation: standing on the front edge, top surface
 * facing -Y, the integrated support on the bed behind it. The knob comes from
 * encoder-knob.part.js and is turned onto its flat top; its eye inlay gets the same move, so
 * the two files line up as one object with two parts in the slicer.
 *
 * Output in case/fluidcad/print/keycaps/ (not tracked in Git), binary STL:
 *   keycap-finger, keycap-home-<mark>, keycap-thumb (.step/.stl): one cap each
 *   keycaps-beige.stl: 30 finger caps and the 2 home caps, the full set in the base colour
 *   keycaps-thumbs.stl: the 6 thumb caps in three rows of two (blue, pink, green from front
 *     to back, one cap per half each); split it into objects in the slicer to assign colours
 *   encoder-knob.step/.stl, encoder-knob-eye.stl, encoder-knob-with-eye.step
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const OUTPUT = path.join(WORKSPACE, 'print', 'keycaps');

const mark = process.argv[2] ?? 'hexagon';
if (!['hexagon', 'dots'].includes(mark)) {
  console.error('Give the homing mark as hexagon or dots');
  process.exit(1);
}
// Full set for 38 keys (see keycaps/README.md): per half 15 finger caps, 1 home cap on the
// index finger and 3 thumb caps.
const SET = { finger: 30, home: 2, thumb: 6 };
// Distance between the caps on the plate, in X and Y.
const PITCH = [21.5, 16];

const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
const lib = name => pathToFileURL(path.join(fluidcad, 'bin', 'lib', name)).href;
const { startEphemeralServer, postForBuffer, findFreePort } = await import(lib('server-client.js'));
const { default: init } = await import(pathToFileURL(path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js')).href);
const oc = await init({ pthreadPoolSize: 2 });

/** STEP of a part with the given parameter values, from a private server. */
async function render(file, values) {
  const port = await findFreePort(3500);
  const server = await startEphemeralServer({
    workspacePath: WORKSPACE,
    entry: path.join(WORKSPACE, file),
    port,
    deadlineAt: Date.now() + 600000,
  });
  try {
    for (const [label, value] of Object.entries(values)) {
      const r = await fetch(`http://127.0.0.1:${port}/api/set-param`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, value }),
      });
      if (!r.ok) throw new Error(`${label} not set: HTTP ${r.status} ${await r.text()}`);
    }
    const e = await postForBuffer(port, '/api/export', { format: 'step', shapeIds: 'all' });
    if (!e.ok) throw new Error(`Export failed: HTTP ${e.status} ${e.buffer?.toString().slice(0, 300)}`);
    return e.buffer;
  } finally {
    server.kill();
  }
}

function readSolids(step) {
  oc.FS.writeFile('/in.step', step);
  const r = new oc.STEPControl_Reader();
  r.ReadFile('/in.step');
  r.TransferRoots(new oc.Message_ProgressRange());
  const list = [];
  const ex = new oc.TopExp_Explorer(r.OneShape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  for (; ex.More(); ex.Next()) list.push(ex.Current());
  for (const s of list) if (!new oc.BRepCheck_Analyzer(s, true, false).IsValid()) throw new Error('invalid solid');
  return list;
}

const volume = s => {
  const g = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(s, g);
  return g.Mass();
};

function bounds(shape) {
  // Exact box: the plain one is loose around the torus of the top surface.
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.AddOptimal(shape, b, false, false);
  const [lo, hi] = [b.CornerMin(), b.CornerMax()];
  return { lo: [lo.X(), lo.Y(), lo.Z()], hi: [hi.X(), hi.Y(), hi.Z()] };
}

const rotation = (axis, angle) => {
  const t = new oc.gp_Trsf();
  t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(...axis)), angle);
  return t;
};
const translation = (x, y, z) => {
  const t = new oc.gp_Trsf();
  t.SetTranslation(new oc.gp_Vec(x, y, z));
  return t;
};
const moved = (shape, trsf) => new oc.BRepBuilderAPI_Transform(shape, trsf, true).Shape();

/** Applies the turn, then centres the result in X and Y and puts it on z = 0. */
function placed(shape, turn) {
  const b = bounds(moved(shape, turn));
  const move = translation(-(b.lo[0] + b.hi[0]) / 2, -(b.lo[1] + b.hi[1]) / 2, -b.lo[2]).Multiplied(turn);
  return { shape: moved(shape, move), move };
}

function compound(shapes) {
  const c = new oc.TopoDS_Compound();
  const builder = new oc.BRep_Builder();
  builder.MakeCompound(c);
  for (const s of shapes) builder.Add(c, s);
  return c;
}

/** Shapes on a grid of `columns`, row after row from the front (-Y). */
function grid(shapes, columns) {
  const rows = Math.ceil(shapes.length / columns);
  return compound(shapes.map((shape, i) => {
    const [c, r] = [i % columns, Math.floor(i / columns)];
    return moved(shape, translation((c - (columns - 1) / 2) * PITCH[0], (r - (rows - 1) / 2) * PITCH[1], 0));
  }));
}
const copies = (shape, n) => Array(n).fill(shape);

function size(shape) {
  const { lo, hi } = bounds(shape);
  return `${(hi[0] - lo[0]).toFixed(1)} × ${(hi[1] - lo[1]).toFixed(1)} × ${(hi[2] - lo[2]).toFixed(1)} mm`;
}

/** The binding writes ASCII STL only; binary is about a fifth of the size. */
function binaryStl(ascii) {
  const text = Buffer.from(ascii).toString('latin1');
  const v = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m; (m = re.exec(text));) v.push(+m[1], +m[2], +m[3]);
  const n = v.length / 9;
  const out = Buffer.alloc(84 + 50 * n);
  out.write('Molekula keycaps', 0, 'latin1');
  out.writeUInt32LE(n, 80);
  for (let i = 0; i < n; i++) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = v.slice(9 * i, 9 * i + 9);
    const [ux, uy, uz, wx, wy, wz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const o = 84 + 50 * i;
    [nx / l, ny / l, nz / l, ax, ay, az, bx, by, bz, cx, cy, cz].forEach((x, k) => out.writeFloatLE(x, o + 4 * k));
  }
  return out;
}

function write(shape, name, { step = true } = {}) {
  const base = path.join(OUTPUT, name);
  if (step) {
    const w = new oc.STEPControl_Writer();
    w.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
    w.Write('/out.step');
    fs.writeFileSync(`${base}.step`, oc.FS.readFile('/out.step'));
  }
  new oc.BRepMesh_IncrementalMesh(shape, 0.02, false, 0.2, false);
  new oc.StlAPI_Writer().Write(shape, '/out.stl', new oc.Message_ProgressRange());
  fs.writeFileSync(`${base}.stl`, binaryStl(oc.FS.readFile('/out.stl')));
  console.log(`${name}: ${(volume(shape) / 1000).toFixed(2)} cm³, ${size(shape)} -> ${path.relative(process.cwd(), base)}${step ? '.step/' : '.'}stl`);
}

fs.mkdirSync(OUTPUT, { recursive: true });

// Key frame -> print orientation: turned by 90° about X, the front edge (-Y) onto the bed.
const standUp = rotation([1, 0, 0], Math.PI / 2);
const caps = {};
for (const [name, values] of [
  ['finger', { Profile: 'finger', 'Homing mark': 'none' }],
  [`home-${mark}`, { Profile: 'finger', 'Homing mark': mark }],
  ['thumb', { Profile: 'thumb', 'Homing mark': 'none' }],
]) {
  const found = readSolids(await render('keycap.part.js', values));
  if (found.length !== 1) throw new Error(`keycap ${name}: ${found.length} solids instead of one`);
  caps[name] = placed(found[0], standUp).shape;
  write(caps[name], `keycap-${name}`);
}

write(grid([...copies(caps.finger, SET.finger), ...copies(caps[`home-${mark}`], SET.home)], 8), 'keycaps-beige', { step: false });
write(grid(copies(caps.thumb, SET.thumb), 2), 'keycaps-thumbs', { step: false });

// Knob: the larger solid is the knob, the smaller one the eye.
const knobSolids = readSolids(await render('encoder-knob.part.js', {})).sort((a, b) => volume(b) - volume(a));
if (knobSolids.length < 1 || knobSolids.length > 2) throw new Error(`knob: ${knobSolids.length} solids`);
const flip = rotation([1, 0, 0], Math.PI);
const knob = placed(knobSolids[0], flip);
write(knob.shape, 'encoder-knob');
if (knobSolids[1]) {
  const eye = moved(knobSolids[1], knob.move);
  write(eye, 'encoder-knob-eye', { step: false });
  const w = new oc.STEPControl_Writer();
  w.Transfer(compound([knob.shape, eye]), oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  w.Write('/out.step');
  fs.writeFileSync(path.join(OUTPUT, 'encoder-knob-with-eye.step'), oc.FS.readFile('/out.step'));
  console.log('encoder-knob-with-eye: knob and eye in one STEP');
}
process.exit(0);
