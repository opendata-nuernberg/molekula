#!/usr/bin/env node
/**
 * Druckdateien: Ober- und Unterschale als je EIN Körper (STEP und STL) für den Slicer.
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis (FluidCAD muss unter case/fluidcad/node_modules verlinkt sein):
 *
 *     node case/fluidcad/werkzeuge/druckdateien.mjs [Keildicke Mitte in mm, Standard 15]
 *
 * Im Modell besteht jede Schale aus drei Körpern, die sich an den Fugen überlappen (linke
 * Hälfte, rechte Hälfte, Mitte; siehe unterschale.part.js). FluidCADs eigene Vereinigung
 * verliert bei gekippten Körpern Teile. Dieses Skript rendert die Schalen in einem
 * privaten FluidCAD-Server (der offene Editor bleibt unberührt), vereinigt die Körper mit
 * OpenCascade und einer Fuzzy-Toleranz und prüft, dass genau ein gültiger Körper entsteht.
 *
 * Ausgabe: case/fluidcad/druck/<schale>-keil<mm>.step und .stl (ASCII), nicht in Git.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HIER, '..');
const AUSGABE = path.join(WORKSPACE, 'druck');
const FUZZY = 1e-3;
const SCHALEN = ['unterschale', 'oberschale'];

const keil = Number(process.argv[2] ?? 15);
if (!Number.isFinite(keil) || keil < 0) {
  console.error('Keildicke als Zahl in mm angeben, z. B. 15');
  process.exit(1);
}

const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
const lib = name => pathToFileURL(path.join(fluidcad, 'bin', 'lib', name)).href;
const { startEphemeralServer, postForBuffer, findFreePort } = await import(lib('server-client.js'));
const { default: init } = await import(pathToFileURL(path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js')).href);
const oc = await init({ pthreadPoolSize: 2 });

/** STEP der Schale bei der gewünschten Keildicke aus einem privaten Server. */
async function rendern(schale) {
  const port = await findFreePort(3500);
  const server = await startEphemeralServer({
    workspacePath: WORKSPACE,
    entry: path.join(WORKSPACE, `${schale}.part.js`),
    port,
    deadlineAt: Date.now() + 600000,
  });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/set-param`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Keildicke Mitte (mm)', value: keil }),
    });
    if (!r.ok) throw new Error(`Parameter nicht gesetzt: HTTP ${r.status} ${await r.text()}`);
    const e = await postForBuffer(port, '/api/export', { format: 'step', shapeIds: 'all' });
    if (!e.ok) throw new Error(`Export fehlgeschlagen: HTTP ${e.status} ${e.buffer?.toString().slice(0, 300)}`);
    return e.buffer;
  } finally {
    server.kill();
  }
}

const volumen = s => {
  const g = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(s, g);
  return g.Mass();
};

function koerper(form) {
  const liste = [];
  const ex = new oc.TopExp_Explorer(form, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  for (; ex.More(); ex.Next()) liste.push(ex.Current());
  return liste;
}

/** Vereinigt alle Körper eines STEP zu einem. */
function vereinigen(step) {
  oc.FS.writeFile('/ein.step', step);
  const r = new oc.STEPControl_Reader();
  r.ReadFile('/ein.step');
  r.TransferRoots(new oc.Message_ProgressRange());
  const teile = koerper(r.OneShape());
  if (teile.length < 2) return { form: teile[0], teile: teile.length };
  const args = new oc.TopTools_ListOfShape();
  args.Append(teile[0]);
  const tools = new oc.TopTools_ListOfShape();
  for (const t of teile.slice(1)) tools.Append(t);
  const fuse = new oc.BRepAlgoAPI_Fuse();
  fuse.SetArguments(args);
  fuse.SetTools(tools);
  fuse.SetFuzzyValue(FUZZY);
  fuse.Build(new oc.Message_ProgressRange());
  if (!fuse.IsDone()) throw new Error('Vereinigung fehlgeschlagen');
  const form = fuse.Shape();
  const n = koerper(form).length;
  if (n !== 1) throw new Error(`Vereinigung ergab ${n} Körper statt einem`);
  if (!new oc.BRepCheck_Analyzer(form, true, false).IsValid()) throw new Error('Vereinigter Körper ist ungültig');
  return { form, teile: teile.length };
}

function schreiben(form, basis) {
  const w = new oc.STEPControl_Writer();
  w.Transfer(form, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  w.Write('/aus.step');
  fs.writeFileSync(`${basis}.step`, oc.FS.readFile('/aus.step'));
  new oc.BRepMesh_IncrementalMesh(form, 0.02, false, 0.2, false);
  new oc.StlAPI_Writer().Write(form, '/aus.stl', new oc.Message_ProgressRange());
  fs.writeFileSync(`${basis}.stl`, oc.FS.readFile('/aus.stl'));
}

fs.mkdirSync(AUSGABE, { recursive: true });
for (const schale of SCHALEN) {
  const t0 = Date.now();
  const { form, teile } = vereinigen(await rendern(schale));
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(form, b, true);
  const [lo, hi] = [b.CornerMin(), b.CornerMax()];
  const basis = path.join(AUSGABE, `${schale}-keil${String(keil).replace('.', ',')}`);
  schreiben(form, basis);
  console.log(
    `${schale}: ${teile} Körper -> 1, ${(volumen(form) / 1000).toFixed(1)} cm³, ` +
      `${(hi.X() - lo.X()).toFixed(1)} × ${(hi.Y() - lo.Y()).toFixed(1)} × ${(hi.Z() - lo.Z()).toFixed(1)} mm, ` +
      `${((Date.now() - t0) / 1000).toFixed(0)} s -> ${path.relative(process.cwd(), basis)}.step/.stl`,
  );
}
process.exit(0);
