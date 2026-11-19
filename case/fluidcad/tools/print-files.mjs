#!/usr/bin/env node
/**
 * Print files for the slicer (STEP and STL): the bottom shell as ONE solid, the top shell as
 * its three print parts (left and right top plate, middle cover), each turned onto its flat
 * top face so it lies on the bed.
 *
 * Run from the repository root (FluidCAD must be linked under case/fluidcad/node_modules):
 *
 *     node case/fluidcad/tools/print-files.mjs [center wedge thickness in mm, default 15]
 *
 * In the model the bottom shell consists of three bodies that overlap at the seams (left
 * half, right half, middle; see bottom-shell.part.js). FluidCAD's own union loses parts of
 * tilted bodies. This script renders the shells in a private FluidCAD server (an open
 * editor is not affected), fuses the bottom shell with OpenCascade and a fuzzy tolerance,
 * and checks that exactly one valid solid results. The top shell parts stay separate; each
 * is rotated so that its largest flat face (the top) points down, and moved onto z = 0.
 *
 * Output in case/fluidcad/print/ (not tracked in Git), ASCII STL:
 *   bottom-shell-wedge<mm>.step/.stl
 *   top-plate-left-wedge<mm>, top-plate-right-wedge<mm>, middle-cover-wedge<mm> (.step/.stl)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const OUTPUT = path.join(WORKSPACE, 'print');
const FUZZY = 1e-3;

const wedge = Number(process.argv[2] ?? 15);
if (!Number.isFinite(wedge) || wedge < 0) {
  console.error('Give the wedge thickness as a number in mm, e.g. 15');
  process.exit(1);
}

const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
const lib = name => pathToFileURL(path.join(fluidcad, 'bin', 'lib', name)).href;
const { startEphemeralServer, postForBuffer, findFreePort } = await import(lib('server-client.js'));
const { default: init } = await import(pathToFileURL(path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js')).href);
const oc = await init({ pthreadPoolSize: 2 });

/** STEP of the shell at the requested wedge thickness, from a private server. */
async function render(shell) {
  const port = await findFreePort(3500);
  const server = await startEphemeralServer({
    workspacePath: WORKSPACE,
    entry: path.join(WORKSPACE, `${shell}.part.js`),
    port,
    deadlineAt: Date.now() + 600000,
  });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/set-param`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Center wedge thickness (mm)', value: wedge }),
    });
    if (!r.ok) throw new Error(`Parameter not set: HTTP ${r.status} ${await r.text()}`);
    const e = await postForBuffer(port, '/api/export', { format: 'step', shapeIds: 'all' });
    if (!e.ok) throw new Error(`Export failed: HTTP ${e.status} ${e.buffer?.toString().slice(0, 300)}`);
    return e.buffer;
  } finally {
    server.kill();
  }
}

const volume = s => {
  const g = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(s, g);
  return g.Mass();
};

function solids(shape) {
  const list = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  for (; ex.More(); ex.Next()) list.push(ex.Current());
  return list;
}

function readSolids(step) {
  oc.FS.writeFile('/in.step', step);
  const r = new oc.STEPControl_Reader();
  r.ReadFile('/in.step');
  r.TransferRoots(new oc.Message_ProgressRange());
  return solids(r.OneShape());
}

/** Fuses all solids into one. */
function fuse(parts) {
  if (parts.length < 2) return { shape: parts[0], parts: parts.length };
  const args = new oc.TopTools_ListOfShape();
  args.Append(parts[0]);
  const tools = new oc.TopTools_ListOfShape();
  for (const t of parts.slice(1)) tools.Append(t);
  const op = new oc.BRepAlgoAPI_Fuse();
  op.SetArguments(args);
  op.SetTools(tools);
  op.SetFuzzyValue(FUZZY);
  op.Build(new oc.Message_ProgressRange());
  if (!op.IsDone()) throw new Error('Fuse failed');
  const shape = op.Shape();
  const n = solids(shape).length;
  if (n !== 1) throw new Error(`Fuse produced ${n} solids instead of one`);
  if (!new oc.BRepCheck_Analyzer(shape, true, false).IsValid()) throw new Error('Fused solid is invalid');
  return { shape, parts: parts.length };
}

/**
 * Turns a solid onto its largest flat face (coplanar faces summed up) and puts it on
 * z = 0, centred in X and Y.
 */
function layFlat(shape) {
  const groups = new Map();
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    const f = oc.TopoDS.Face(ex.Current());
    const ad = new oc.BRepAdaptor_Surface(f, true);
    if (ad.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) continue;
    const ax = ad.Plane().Axis();
    let n = [ax.Direction().X(), ax.Direction().Y(), ax.Direction().Z()];
    if (f.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = n.map(v => -v);
    const o = ax.Location();
    const d = n[0] * o.X() + n[1] * o.Y() + n[2] * o.Z();
    const key = [...n.map(v => v.toFixed(3)), d.toFixed(2)].join(',');
    const g = new oc.GProp_GProps();
    oc.BRepGProp.SurfaceProperties(f, g, false, false);
    const e = groups.get(key) ?? { n, area: 0 };
    e.area += g.Mass();
    groups.set(key, e);
  }
  const { n } = [...groups.values()].sort((a, b) => b.area - a.area)[0];
  // Rotate n onto -Z.
  const trsf = new oc.gp_Trsf();
  const axis = [n[1] * -1 - n[2] * 0, n[2] * 0 - n[0] * -1, 0]; // n × (0, 0, -1)
  const s = Math.hypot(...axis);
  const angle = Math.atan2(s, -n[2]);
  if (s > 1e-9) trsf.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(axis[0], axis[1], axis[2])), angle);
  else if (n[2] > 0) trsf.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(1, 0, 0)), Math.PI);
  let turned = new oc.BRepBuilderAPI_Transform(shape, trsf, true).Shape();
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(turned, b, false);
  const [lo, hi] = [b.CornerMin(), b.CornerMax()];
  const move = new oc.gp_Trsf();
  move.SetTranslation(new oc.gp_Vec(-(lo.X() + hi.X()) / 2, -(lo.Y() + hi.Y()) / 2, -lo.Z()));
  turned = new oc.BRepBuilderAPI_Transform(turned, move, true).Shape();
  return turned;
}

function size(shape) {
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(shape, b, true);
  const [lo, hi] = [b.CornerMin(), b.CornerMax()];
  return `${(hi.X() - lo.X()).toFixed(1)} × ${(hi.Y() - lo.Y()).toFixed(1)} × ${(hi.Z() - lo.Z()).toFixed(1)} mm`;
}

function write(shape, base) {
  const w = new oc.STEPControl_Writer();
  w.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  w.Write('/out.step');
  fs.writeFileSync(`${base}.step`, oc.FS.readFile('/out.step'));
  new oc.BRepMesh_IncrementalMesh(shape, 0.02, false, 0.2, false);
  new oc.StlAPI_Writer().Write(shape, '/out.stl', new oc.Message_ProgressRange());
  fs.writeFileSync(`${base}.stl`, oc.FS.readFile('/out.stl'));
}

fs.mkdirSync(OUTPUT, { recursive: true });
const report = (name, shape, extra, t0) => {
  const base = path.join(OUTPUT, `${name}-wedge${wedge}`);
  write(shape, base);
  console.log(`${name}: ${extra}${(volume(shape) / 1000).toFixed(1)} cm³, ${size(shape)}, ` +
    `${((Date.now() - t0) / 1000).toFixed(0)} s -> ${path.relative(process.cwd(), base)}.step/.stl`);
};
{
  const t0 = Date.now();
  const { shape, parts } = fuse(readSolids(await render('bottom-shell')));
  report('bottom-shell', shape, `${parts} bodies -> 1, `, t0);
}
{
  const t0 = Date.now();
  const parts = readSolids(await render('top-shell'));
  if (parts.length !== 3) throw new Error(`top shell: ${parts.length} solids instead of 3`);
  const centreX = s => {
    const g = new oc.GProp_GProps();
    oc.BRepGProp.VolumeProperties(s, g);
    return g.CentreOfMass().X();
  };
  const [left, middle, right] = parts.sort((a, b) => centreX(a) - centreX(b));
  for (const [name, shape] of [['top-plate-left', left], ['middle-cover', middle], ['top-plate-right', right]]) {
    if (!new oc.BRepCheck_Analyzer(shape, true, false).IsValid()) throw new Error(`${name} is invalid`);
    report(name, layFlat(shape), '', t0);
  }
}
process.exit(0);
