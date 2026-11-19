#!/usr/bin/env node
/**
 * Erzeugt ../huellen.js: vereinfachte Hüllkörper der Bauteile aus den FluidCAD-Importen.
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis (FluidCAD muss unter case/fluidcad/node_modules verlinkt sein):
 *
 *     node case/fluidcad/werkzeuge/huellen.mjs
 *
 * Die Detailmodelle (imports/*.brep) sind für das Modell zu schwer: Hunderte Flächen pro
 * Schalter, bei 38 Plätzen. Für Freiräume reicht eine gestufte Hülle. Das Skript
 * vernetzt jede Gruppe von Körpern, schneidet sie in dünne Scheiben entlang z, nimmt
 * pro Scheibe das achsparallele Rechteck um alle Dreiecksanteile darin und fasst
 * benachbarte Scheiben zusammen, solange keine Kante um mehr als TOLERANZ wächst.
 * Jede Stufe ist das umschließende Rechteck ihrer Scheiben, die Hülle liegt also immer
 * auf der sicheren Seite.
 *
 * Koordinaten der Ausgabe: wie im jeweiligen Import (mm, Modellrahmen).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HIER, '..');
const ZIEL = path.join(WORKSPACE, 'huellen.js');
const SCHEIBE = 0.1;
const TOLERANZ = 0.5;
// Dünnere Stufen werden mit dem Nachbarn vereinigt, der dabei am wenigsten wächst.
const MIN_HOEHE = 0.5;
const RUNDEN = 2;

// Hülle -> Import und die Körper daraus (0-basiert, Reihenfolge wie load()).
const GRUPPEN = {
  schalter: { import: 'choc-v1-mit-keycap', koerper: [1], titel: 'Choc v1 mit Stößel' },
  kappe: { import: 'choc-v1-mit-keycap', koerper: [2], titel: 'Tastenkappe' },
  sockel: { import: 'choc-v1-mit-keycap', koerper: [0, 3, 4], titel: 'Hotswap-Socket' },
  // Gewindebuchse und Welle sind rund: Stufen ab rundAb als Zylinder statt Quader.
  encoder: { import: 'ec11-15f', titel: 'EC11 mit 15-mm-Welle', rundAb: 4.5 },
  helios: { import: 'helios-stiftleisten', titel: 'Helios auf Stiftleisten' },
  reset: { import: 'skqg-reset', titel: 'Reset-Taster SKQG' },
  ffc: { import: 'ffc-12-horizontal', titel: 'FFC-Buchse 12-polig' },
};

async function ladeOcct() {
  const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
  const eintrag = path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js');
  const { default: init } = await import(pathToFileURL(eintrag).href);
  return init({ pthreadPoolSize: 2 });
}

const oc = await ladeOcct();

function koerperAus(name) {
  const datei = path.join(WORKSPACE, 'imports', `${name}.brep`);
  oc.FS.writeFile(`/${name}.brep`, fs.readFileSync(datei));
  const form = new oc.TopoDS_Shape();
  oc.BRepTools.Read(form, `/${name}.brep`, new oc.BRep_Builder(), new oc.Message_ProgressRange());
  const liste = [];
  const ex = new oc.TopExp_Explorer(form, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  for (; ex.More(); ex.Next()) liste.push(ex.Current());
  return liste;
}

function dreiecke(form) {
  new oc.BRepMesh_IncrementalMesh(form, 0.05, false, 0.2, false);
  const tris = [];
  const ex = new oc.TopExp_Explorer(form, oc.TopAbs_ShapeEnum.TopAbs_FACE);
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

/** Punkte eines Dreiecks, beschnitten auf z0 <= z <= z1 (Sutherland-Hodgman). */
function beschneiden(tri, z0, z1) {
  const clip = (poly, innen, schnitt) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (innen(a)) out.push(a);
      if (innen(a) !== innen(b)) out.push(schnitt(a, b));
    }
    return out;
  };
  const bei = z => (a, b) => {
    const f = (z - a[2]) / (b[2] - a[2]);
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), z];
  };
  let poly = clip(tri, p => p[2] >= z0, bei(z0));
  if (poly.length) poly = clip(poly, p => p[2] <= z1, bei(z1));
  return poly;
}

function huelle(tris) {
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const t of tris) for (const p of t) {
    zmin = Math.min(zmin, p[2]);
    zmax = Math.max(zmax, p[2]);
  }
  const n = Math.max(1, Math.ceil((zmax - zmin) / SCHEIBE));
  const scheiben = Array.from({ length: n }, (_, i) => ({ z: [zmin + i * SCHEIBE, Math.min(zmax, zmin + (i + 1) * SCHEIBE)], min: [Infinity, Infinity], max: [-Infinity, -Infinity] }));
  for (const t of tris) {
    const tz0 = Math.min(t[0][2], t[1][2], t[2][2]);
    const tz1 = Math.max(t[0][2], t[1][2], t[2][2]);
    const i0 = Math.max(0, Math.floor((tz0 - zmin) / SCHEIBE));
    const i1 = Math.min(n - 1, Math.floor((tz1 - zmin) / SCHEIBE));
    for (let i = i0; i <= i1; i++) {
      const s = scheiben[i];
      for (const p of beschneiden(t, s.z[0], s.z[1])) {
        s.min[0] = Math.min(s.min[0], p[0]);
        s.min[1] = Math.min(s.min[1], p[1]);
        s.max[0] = Math.max(s.max[0], p[0]);
        s.max[1] = Math.max(s.max[1], p[1]);
      }
    }
  }
  const stufen = [];
  for (const s of scheiben.filter(s => Number.isFinite(s.min[0]))) {
    const letzte = stufen.at(-1);
    const passt = letzte
      && Math.abs(letzte.z[1] - s.z[0]) < 1e-6
      && [0, 1].every(k => Math.abs(letzte.min[k] - s.min[k]) <= TOLERANZ && Math.abs(letzte.max[k] - s.max[k]) <= TOLERANZ);
    if (passt) {
      letzte.z[1] = s.z[1];
      letzte.min = letzte.min.map((v, k) => Math.min(v, s.min[k]));
      letzte.max = letzte.max.map((v, k) => Math.max(v, s.max[k]));
    } else stufen.push({ z: [...s.z], min: [...s.min], max: [...s.max] });
  }
  const flaeche = s => (s.max[0] - s.min[0]) * (s.max[1] - s.min[1]);
  const vereinigt = (a, b) => ({ z: [Math.min(a.z[0], b.z[0]), Math.max(a.z[1], b.z[1])], min: a.min.map((v, k) => Math.min(v, b.min[k])), max: a.max.map((v, k) => Math.max(v, b.max[k])) });
  for (;;) {
    const i = stufen.findIndex(s => s.z[1] - s.z[0] < MIN_HOEHE);
    if (i < 0 || stufen.length < 2) break;
    const kandidaten = [i - 1, i + 1].filter(j => j >= 0 && j < stufen.length);
    const j = kandidaten.sort((a, b) => flaeche(vereinigt(stufen[i], stufen[a])) - flaeche(vereinigt(stufen[i], stufen[b])))[0];
    const [lo, hi] = [Math.min(i, j), Math.max(i, j)];
    stufen.splice(lo, 2, vereinigt(stufen[lo], stufen[hi]));
  }
  // Nach außen runden, damit die Hülle nicht durch Rundung kleiner wird.
  const ab = v => Math.floor(v * 10 ** RUNDEN) / 10 ** RUNDEN;
  const auf = v => Math.ceil(v * 10 ** RUNDEN) / 10 ** RUNDEN;
  return stufen.map(s => ({ z: [ab(s.z[0]), auf(s.z[1])], min: s.min.map(ab), max: s.max.map(auf) }));
}

const cache = new Map();
const ergebnis = {};
for (const [name, g] of Object.entries(GRUPPEN)) {
  if (!cache.has(g.import)) cache.set(g.import, koerperAus(g.import));
  const alle = cache.get(g.import);
  const auswahl = g.koerper ? g.koerper.map(i => alle[i]) : alle;
  const tris = auswahl.flatMap(dreiecke);
  ergebnis[name] = { titel: g.titel, import: g.import, ...(g.rundAb !== undefined && { rundAb: g.rundAb }), stufen: huelle(tris) };
  console.log(`${name}: ${ergebnis[name].stufen.length} Stufen`);
}

const ausgabe = `// Automatisch erzeugt von werkzeuge/huellen.mjs aus den FluidCAD-Importen (imports/*.brep).
// Nicht von Hand ändern: Skript erneut ausführen und den Diff prüfen.
// Gestufte Hüllquader der Bauteile im Modellrahmen des Imports, mm.
// Jede Stufe: z = [unten, oben], min/max = Rechteck in XY. Mit rundAb: Stufen ab dieser Höhe sind
// Zylinder um die Rechteckmitte (Durchmesser = größere Seite). Toleranz ${TOLERANZ} mm, Scheiben ${SCHEIBE} mm, Stufen mindestens ${MIN_HOEHE} mm hoch.

export const huellen = ${JSON.stringify(ergebnis, null, 1)};
`;
fs.writeFileSync(ZIEL, ausgabe);
console.log(`geschrieben: ${path.relative(path.resolve(WORKSPACE, '..', '..'), ZIEL)}`);
process.exit(0);
