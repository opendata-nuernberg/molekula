#!/usr/bin/env node
/**
 * Print files: top and bottom shell as ONE solid each (STEP and STL) for the slicer.
 *
 * Run from the repository root (FluidCAD must be linked under case/fluidcad/node_modules):
 *
 *     node case/fluidcad/tools/print-files.mjs [center wedge thickness in mm, default 15]
 *
 * In the model every shell consists of three bodies that overlap at the seams (left half,
 * right half, middle; see bottom-shell.part.js). FluidCAD's own union loses parts of
 * tilted bodies. This script renders the shells in a private FluidCAD server (an open
 * editor is not affected), fuses the bodies with OpenCascade and a fuzzy tolerance, and
 * checks that exactly one valid solid results.
 *
 * Output: case/fluidcad/print/<shell>-wedge<mm>.step and .stl (ASCII), not tracked in Git.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const OUTPUT = path.join(WORKSPACE, 'print');
const FUZZY = 1e-3;
const SHELLS = ['bottom-shell', 'top-shell'];

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

/** Fuses all solids of a STEP into one. */
function fuse(step) {
  oc.FS.writeFile('/in.step', step);
  const r = new oc.STEPControl_Reader();
  r.ReadFile('/in.step');
  r.TransferRoots(new oc.Message_ProgressRange());
  const parts = solids(r.OneShape());
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
for (const shell of SHELLS) {
  const t0 = Date.now();
  const { shape, parts } = fuse(await render(shell));
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(shape, b, true);
  const [lo, hi] = [b.CornerMin(), b.CornerMax()];
  const base = path.join(OUTPUT, `${shell}-wedge${wedge}`);
  write(shape, base);
  console.log(
    `${shell}: ${parts} bodies -> 1, ${(volume(shape) / 1000).toFixed(1)} cm³, ` +
      `${(hi.X() - lo.X()).toFixed(1)} × ${(hi.Y() - lo.Y()).toFixed(1)} × ${(hi.Z() - lo.Z()).toFixed(1)} mm, ` +
      `${((Date.now() - t0) / 1000).toFixed(0)} s -> ${path.relative(process.cwd(), base)}.step/.stl`,
  );
}
process.exit(0);
