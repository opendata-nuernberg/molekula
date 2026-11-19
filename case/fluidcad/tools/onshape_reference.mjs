#!/usr/bin/env node
/**
 * Generates ../onshape-reference.js from the Onshape export case/onshape/molekula.step.
 *
 * Run from the repository root (FluidCAD must be linked under case/fluidcad/node_modules):
 *
 *     node case/fluidcad/tools/onshape_reference.mjs [path/to.step]
 *
 * The export is a Part Studio with all bodies in world coordinates. The script
 *
 * 1. finds the switch cut-outs in the covers top_left/top_right and fits the KiCad
 *    switch positions from pcb-reference.js rigidly into them. This gives the placement
 *    KiCad -> Onshape for each half (rotation about Z and translation);
 * 2. determines the mounted position of the magnetic connector boards: hole axes, board
 *    plane, top and bottom edge, and the remaining tab stubs. The stubs map the holes to
 *    the KiCad holes and decide which edge is at the bottom, so the mapping follows from
 *    the geometry instead of being assumed;
 * 3. converts everything into the KiCad frame of the respective half. Heights count from
 *    the top of the main board.
 *
 * If something does not fit (fit residual, hole spacing, tab stubs), the script stops with
 * a message instead of writing a wrong reference.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const REPO = path.resolve(WORKSPACE, '..', '..');
const SOURCE = path.resolve(process.argv[2] ?? path.join(REPO, 'case', 'onshape', 'molekula.step'));
const TARGET = path.join(WORKSPACE, 'onshape-reference.js');
const DIGITS = 4;

// Section height through the switch cut-outs in the cover, above the top of the main board.
const SECTION_Z = 1.0;
// Radius of the mounting holes (Ø 2.65 mm) with tolerance.
const HOLE_R = [1.2, 1.45];

const CONNECTORS = {
  connectorLeft: {
    half: 'left',
    cover: 'top_left',
    plate: 'mag_left', // Board and magnetic socket are one body in Onshape.
    ffc: 'mag_con_left',
    magnet: 'mag_left',
    matingBoard: 'pcb_mag_right',
  },
  connectorRight: {
    half: 'right',
    cover: 'top_right',
    plate: 'pcb_mag_right',
    ffc: 'mag_con_right',
    magnet: 'mag_right',
    matingBoard: 'mag_left',
  },
};

function fail(text) {
  console.error(`Abort: ${text}`);
  process.exit(1);
}

// ---------------------------------------------------------------- KiCad reference

function kicadReference() {
  const text = fs.readFileSync(path.join(WORKSPACE, 'pcb-reference.js'), 'utf8');
  const values = {};
  for (const m of text.matchAll(/^export const (\w+) = (.*);$/gm)) values[m[1]] = JSON.parse(m[2]);
  return values;
}

// ---------------------------------------------------------------- Reading STEP

/** Root names in transfer order (PRODUCT_DEFINITION in file order). */
function productNames(text) {
  const ents = new Map();
  for (const m of text.matchAll(/\n#(\d+)=([\s\S]*?);\s*(?=\n#|\nENDSEC)/g)) ents.set(Number(m[1]), m[2]);
  const ref = (s, i) => Number(s.split(',')[i].match(/#(\d+)/)[1]);
  return [...ents.entries()]
    .filter(([, v]) => v.startsWith('PRODUCT_DEFINITION('))
    .sort(([a], [b]) => a - b)
    .map(([, v]) => {
      const formation = ents.get(ref(v, 2));
      const product = ents.get(ref(formation, 2));
      return product.match(/'([^']*)'/)[1];
    });
}

async function loadOcct() {
  const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
  const entry = path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js');
  if (!fs.existsSync(entry)) fail(`OpenCascade not found: ${entry}`);
  const { default: init } = await import(pathToFileURL(entry).href);
  return init({ pthreadPoolSize: 2 });
}

// ---------------------------------------------------------------- Vectors

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = a => Math.hypot(...a);
const unit = a => mul(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const round = v => (Array.isArray(v) ? v.map(round) : Math.round(v * 10 ** DIGITS) / 10 ** DIGITS + 0);

// ---------------------------------------------------------------- Main

const kicad = kicadReference();
const stepText = fs.readFileSync(SOURCE, 'latin1');
const names = productNames(stepText);
const oc = await loadOcct();
oc.FS.writeFile('/source.step', fs.readFileSync(SOURCE));
const reader = new oc.STEPControl_Reader();
if (reader.ReadFile('/source.step') !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) fail('cannot read STEP');
if (reader.NbRootsForTransfer() !== names.length) fail(`${reader.NbRootsForTransfer()} roots but ${names.length} product names`);

const shapeCache = new Map();
function shapeOf(name) {
  if (!shapeCache.has(name)) {
    const i = names.indexOf(name);
    if (i < 0) fail(`body ${name} missing from the export`);
    reader.ClearShapes();
    reader.TransferOneRoot(i + 1);
    shapeCache.set(name, reader.OneShape());
  }
  return shapeCache.get(name);
}

const pt = p => [p.X(), p.Y(), p.Z()];

function bbox(shape) {
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(shape, b, false);
  return { min: pt(b.CornerMin()), max: pt(b.CornerMax()) };
}

/** Faces of a body with type, area, centroid and the nodes of their mesh. */
function faces(name) {
  const shape = shapeOf(name);
  new oc.BRepMesh_IncrementalMesh(shape, 0.05, false, 0.2, false);
  const list = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    const f = oc.TopoDS.Face(ex.Current());
    const ad = new oc.BRepAdaptor_Surface(f, true);
    const g = new oc.GProp_GProps();
    oc.BRepGProp.SurfaceProperties(f, g, false, false);
    const e = { area: g.Mass(), centroid: pt(g.CentreOfMass()), nodes: nodesOf(f) };
    const type = ad.GetType();
    if (type === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
      e.type = 'plane';
      e.normal = pt(ad.Plane().Axis().Direction());
      if (f.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) e.normal = mul(e.normal, -1);
    } else if (type === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
      const z = ad.Cylinder();
      e.type = 'cylinder';
      e.radius = z.Radius();
      e.axis = pt(z.Axis().Direction());
      e.location = pt(z.Axis().Location());
    } else e.type = 'other';
    list.push(e);
  }
  return list;
}

function nodesOf(face) {
  const loc = new oc.TopLoc_Location();
  const t = oc.BRep_Tool.Triangulation(face, loc, 0);
  if (!t) return [];
  const tr = loc.Transformation();
  const p = [];
  for (let k = 1; k <= t.NbNodes(); k++) p.push(pt(t.Node(k).Transformed(tr)));
  return p;
}

function triangles(name) {
  const shape = shapeOf(name);
  new oc.BRepMesh_IncrementalMesh(shape, 0.05, false, 0.2, false);
  const tris = [];
  const nodes = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    const loc = new oc.TopLoc_Location();
    const t = oc.BRep_Tool.Triangulation(oc.TopoDS.Face(ex.Current()), loc, 0);
    if (!t) continue;
    const tr = loc.Transformation();
    const p = [];
    for (let k = 1; k <= t.NbNodes(); k++) p.push(pt(t.Node(k).Transformed(tr)));
    nodes.push(...p);
    for (let k = 1; k <= t.NbTriangles(); k++) {
      const d = t.Triangle(k);
      tris.push([p[d.Value(1) - 1], p[d.Value(2) - 1], p[d.Value(3) - 1]]);
    }
  }
  return { tris, nodes };
}

/** Section of a mesh with the plane z = h, joined into closed loops. */
function sectionLoops(tris, h) {
  const segs = [];
  for (const t of tris) {
    const d = t.map(p => p[2] - h);
    const s = [];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      if (d[a] < 0 !== d[b] < 0) {
        const f = d[a] / (d[a] - d[b]);
        s.push([t[a][0] + f * (t[b][0] - t[a][0]), t[a][1] + f * (t[b][1] - t[a][1])]);
      }
    }
    if (s.length === 2) segs.push(s);
  }
  const key = p => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
  const neighbours = new Map();
  segs.forEach((s, i) => s.forEach(p => {
    const k = key(p);
    if (!neighbours.has(k)) neighbours.set(k, []);
    neighbours.get(k).push(i);
  }));
  const seen = new Set();
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (seen.has(i)) continue;
    const stack = [i];
    const points = [];
    while (stack.length) {
      const j = stack.pop();
      if (seen.has(j)) continue;
      seen.add(j);
      for (const p of segs[j]) {
        points.push(p);
        for (const m of neighbours.get(key(p))) if (!seen.has(m)) stack.push(m);
      }
    }
    loops.push(points);
  }
  return loops;
}

/** Rigid 2D fit of the KiCad switches into the cut-outs of a cover. */
function fitHalf(board, cover, zRef) {
  const expected = kicad.switches.filter(s => s.board === board).map(s => s.center);
  const found = sectionLoops(triangles(cover).tris, zRef + SECTION_Z)
    .map(z => {
      const xs = z.map(p => p[0]);
      const ys = z.map(p => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      return { center: [(x0 + x1) / 2, (y0 + y1) / 2], size: [x1 - x0, y1 - y0] };
    })
    .filter(z => z.size.every(g => g > 13.5 && g < 20))
    .map(z => z.center);
  if (found.length !== expected.length) fail(`${cover}: ${found.length} switch cut-outs, KiCad has ${expected.length} switches on ${board}`);

  const mean = ps => ps.reduce((s, p) => add(s, p), [0, 0]).map(v => v / ps.length);
  const ks = mean(expected);
  const fs0 = mean(found);
  const rot = (p, w) => [p[0] * Math.cos(w) - p[1] * Math.sin(w), p[0] * Math.sin(w) + p[1] * Math.cos(w)];
  const nearest = p => found.reduce((b, q, i) => (norm(sub(p, q)) < b.d ? { d: norm(sub(p, q)), i } : b), { d: Infinity, i: -1 });
  let best = null;
  for (let g = 0; g < 360; g += 0.25) {
    const w = (g * Math.PI) / 180;
    const pairs = expected.map(p => nearest(add(rot(sub(p, ks), w), fs0)));
    const e = pairs.reduce((s, q) => s + q.d, 0);
    if (!best || e < best.e) best = { e, pairs };
  }
  const target = best.pairs.map(q => found[q.i]);
  if (new Set(best.pairs.map(q => q.i)).size !== expected.length) fail(`${cover}: switch mapping is ambiguous`);
  const ts = mean(target);
  let sc = 0;
  let ss = 0;
  expected.forEach((p, i) => {
    const a = sub(p, ks);
    const b = sub(target[i], ts);
    ss += a[0] * b[1] - a[1] * b[0];
    sc += a[0] * b[0] + a[1] * b[1];
  });
  const w = Math.atan2(ss, sc);
  const offset = sub(ts, rot(ks, w));
  const residual = Math.max(...expected.map((p, i) => norm(sub(add(rot(p, w), offset), target[i]))));
  if (residual > 0.02) fail(`${cover}: fit residual ${residual.toFixed(3)} mm`);
  return { rotation: (w * 180) / Math.PI, offset, residual };
}

const zRef = bbox(shapeOf('pcb_right')).max[2];
const mainBoard = { top: zRef, thickness: zRef - bbox(shapeOf('pcb_right')).min[2] };
const halves = {
  left: fitHalf('left', 'top_left', zRef),
  right: fitHalf('right', 'top_right', zRef),
};

/** Onshape world point -> KiCad frame of the half, z from the top of the main board. */
function inHalf(h, p) {
  const w = (-h.rotation * Math.PI) / 180;
  const [x, y] = sub(p, h.offset);
  return [x * Math.cos(w) - y * Math.sin(w), x * Math.sin(w) + y * Math.cos(w), p[2] - zRef];
}
function directionInHalf(h, d) {
  const w = (-h.rotation * Math.PI) / 180;
  return [d[0] * Math.cos(w) - d[1] * Math.sin(w), d[0] * Math.sin(w) + d[1] * Math.cos(w), d[2]];
}

function analyseConnector(name, cfg) {
  const h = halves[cfg.half];
  const fl = faces(cfg.plate).map(f => ({
    ...f,
    centroid: inHalf(h, f.centroid),
    nodes: f.nodes.map(p => inHalf(h, p)),
    ...(f.normal && { normal: directionInHalf(h, f.normal) }),
    ...(f.axis && { axis: directionInHalf(h, f.axis), location: inHalf(h, f.location) }),
  }));

  // Holes: two horizontal axes with the same direction.
  const cyl = fl.filter(f => f.type === 'cylinder' && f.radius > HOLE_R[0] && f.radius < HOLE_R[1]);
  const d = unit([cyl[0].axis[0], cyl[0].axis[1], 0]);
  if (Math.abs(cyl[0].axis[2]) > 1e-6) fail(`${name}: hole axis is not horizontal`);
  const axes = [];
  for (const z of cyl) {
    const across = [-d[1], d[0], 0];
    const pos = dot(z.location, across);
    if (!axes.some(a => Math.abs(a.pos - pos) < 0.01)) axes.push({ pos, location: z.location, faces: [] });
    axes.find(a => Math.abs(a.pos - pos) < 0.01).faces.push(z);
  }
  if (axes.length !== 2) fail(`${name}: ${axes.length} hole axes instead of 2`);
  // Board thickness from the length of the hole walls along the axis.
  const along = axes[0].faces.flatMap(f => f.nodes.map(p => dot(p, d)));
  const [s0, s1] = [Math.min(...along), Math.max(...along)];
  const thickness = s1 - s0;
  const midS = (s0 + s1) / 2;
  const holeCenter = a => add(sub(a.location, mul(d, dot(a.location, d))), mul(d, midS));

  // Edges: horizontal faces within the board thickness.
  const inPlate = f => {
    const s = f.nodes.map(p => dot(p, d));
    return Math.min(...s) > s0 - 0.01 && Math.max(...s) < s1 + 0.01;
  };
  const horizontal = fl.filter(f => f.type === 'plane' && Math.abs(Math.abs(f.normal[2]) - 1) < 1e-6 && inPlate(f));
  const top = Math.max(...horizontal.filter(f => f.normal[2] > 0).map(f => f.centroid[2]));
  const below = horizontal.filter(f => f.normal[2] < 0);
  const perHeight = new Map();
  for (const f of below) perHeight.set(round(f.centroid[2]), (perHeight.get(round(f.centroid[2])) ?? 0) + f.area);
  const bottomEdge = [...perHeight.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const stubs = below.filter(f => f.centroid[2] < bottomEdge - 0.1);
  if (stubs.length !== 2) fail(`${name}: ${stubs.length} tab stubs instead of 2`);
  const holeZ = holeCenter(axes[0])[2];
  if (Math.abs(holeZ - (top + bottomEdge) / 2) > 0.01) fail(`${name}: holes not centred between the edges`);

  // Mapping via the tab stubs.
  const kiHoles = kicad.holes.filter(b => b.board === name);
  const prefix = name === 'connectorLeft' ? 'left-connector' : 'right-connector';
  const kiTabs = Object.entries(kicad.tabs).filter(([k]) => k.startsWith(prefix)).map(([, s]) => s);
  const kiTabX = kiTabs.map(s => (s.from[0] + s.to[0]) / 2);
  if (kiHoles.length !== 2 || kiTabs.length !== 2) fail(`${name}: KiCad reference does not match`);
  const stubPos = stubs.map(f => f.centroid);
  let mapping = null;
  for (const [ia, ib] of [[0, 1], [1, 0]]) {
    // Axis A belongs to kiHoles[ia]. KiCad +x points from the smaller to the larger x hole.
    const A = holeCenter(axes[0]);
    const B = holeCenter(axes[1]);
    const xa = kiHoles[ia].center[0];
    const xb = kiHoles[ib].center[0];
    const u = unit(mul(sub(B, A), Math.sign(xb - xa)));
    const errorSum = kiTabX.reduce((s, x) => s + Math.min(...stubPos.map(n => Math.abs(dot(sub(n, A), u) - (x - xa)))), 0);
    if (!mapping || errorSum < mapping.error) mapping = { error: errorSum, A, B, u, a: kiHoles[ia], b: kiHoles[ib] };
  }
  if (mapping.error > 0.2) fail(`${name}: tab stubs do not match the KiCad tabs (${mapping.error.toFixed(2)} mm)`);
  const spacing = norm(sub(mapping.B, mapping.A));
  const kiSpacing = Math.abs(mapping.b.center[0] - mapping.a.center[0]);
  if (Math.abs(spacing - kiSpacing) > 0.02) fail(`${name}: hole spacing ${spacing.toFixed(3)} instead of ${kiSpacing}`);

  // The tabs sit on the edge toward the half (larger KiCad y). If the stubs are at the
  // bottom, KiCad +y points down.
  const tabSideY = Math.sign(kiTabs[0].from[1] + kiTabs[0].to[1] - 2 * mapping.a.center[1]);
  const v = [0, 0, Math.sign(stubPos[0][2] - holeZ) * tabSideY];
  const u = mapping.u;
  const w = cross(u, v);
  if (Math.abs(Math.abs(dot(w, d)) - 1) > 1e-6) fail(`${name}: board normal does not match the holes`);

  // Image of the KiCad origin: KiCad z = 0 is the bottom of the board.
  const kd = kicad.boardThickness;
  const origin = sub(sub(sub(mapping.A, mul(u, mapping.a.center[0])), mul(v, mapping.a.center[1])), mul(w, kd / 2));
  const inBoard = p => {
    const q = sub(inHalf(h, p), origin);
    return [dot(q, u), dot(q, v), dot(q, w)];
  };
  const envelope = (body, filter = () => true) => {
    const ps = triangles(body).nodes.map(inBoard).filter(filter);
    return { min: round([0, 1, 2].map(i => Math.min(...ps.map(p => p[i])))), max: round([0, 1, 2].map(i => Math.max(...ps.map(p => p[i])))) };
  };
  const outsidePlate = p => p[2] > kd / 2 + thickness / 2 + 0.01 || p[2] < kd / 2 - thickness / 2 - 0.01;
  const sideOf = hl => (hl.min[2] + hl.max[2] > kd ? 'top' : 'bottom');
  const ffc = envelope(cfg.ffc);
  const magnet = envelope(cfg.magnet, outsidePlate);
  const kiFfc = kicad.components.find(b => b.board === name && b.footprint.includes('FFC'));
  const kiMag = kicad.components.find(b => b.board === name && b.footprint.includes('Magnetic'));

  return {
    half: cfg.half,
    // Rx(-90°), then Rz(rotationZ), then translate by origin: this moves the board built
    // flat in KiCad coordinates (z = 0 bottom) into its mounted position.
    rotationZ: round((Math.atan2(u[1], u[0]) * 180) / Math.PI),
    origin: round(origin),
    axes: { x: round(u), y: round(v), z: round(w) },
    holes: Object.fromEntries([[mapping.a.ref, round(mapping.A)], [mapping.b.ref, round(mapping.B)]]),
    topEdge: round(top),
    bottomEdge: round(bottomEdge),
    stubBottomEdge: round(Math.min(...stubPos.map(n => n[2]))),
    thicknessOnshape: round(thickness),
    envelopes: {
      ffc: { onshape: cfg.ffc, ...ffc, side: sideOf(ffc), sideKicad: kiFfc?.side ?? null },
      magnet: { onshape: cfg.magnet, ...magnet, side: sideOf(magnet), sideKicad: kiMag?.side ?? null },
      matingBoard: { onshape: cfg.matingBoard, ...envelope(cfg.matingBoard) },
    },
  };
}

const connectors = Object.fromEntries(Object.entries(CONNECTORS).map(([n, c]) => [n, analyseConnector(n, c)]));

/** Position of the MCU middle board via its three holes (H5–H7), in the frame of the half it sits in. */
function fitMiddle(half) {
  const h = halves[half];
  const expected = kicad.holes.filter(b => b.board === 'middle');
  const found = [];
  for (const f of faces('pcb_mcu')) {
    if (f.type !== 'cylinder' || f.radius < HOLE_R[0] || f.radius > HOLE_R[1]) continue;
    if (Math.abs(Math.abs(f.axis[2]) - 1) > 1e-6) fail('pcb_mcu: hole is not vertical');
    const p = inHalf(h, f.location).slice(0, 2);
    if (!found.some(q => norm(sub(p, q)) < 0.01)) found.push(p);
  }
  if (found.length !== expected.length) fail(`pcb_mcu: ${found.length} holes, KiCad has ${expected.length}`);
  const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
  let best = null;
  for (const perm of perms([...found.keys()])) {
    const K = expected.map(b => b.center);
    const T = perm.map(i => found[i]);
    const km = mul(K.reduce((s, p) => add(s, p), [0, 0]), 1 / K.length);
    const tm = mul(T.reduce((s, p) => add(s, p), [0, 0]), 1 / T.length);
    let sc = 0;
    let ss = 0;
    K.forEach((p, i) => {
      const a = sub(p, km);
      const b = sub(T[i], tm);
      ss += a[0] * b[1] - a[1] * b[0];
      sc += a[0] * b[0] + a[1] * b[1];
    });
    const w = Math.atan2(ss, sc);
    const rot = p => [p[0] * Math.cos(w) - p[1] * Math.sin(w), p[0] * Math.sin(w) + p[1] * Math.cos(w)];
    const t = sub(tm, rot(km));
    const residual = Math.max(...K.map((p, i) => norm(sub(add(rot(p), t), T[i]))));
    if (!best || residual < best.residual) best = { rotation: (w * 180) / Math.PI, offset: t, residual };
  }
  if (best.residual > 0.02) fail(`pcb_mcu: residual ${best.residual.toFixed(3)} mm`);
  return { half, rotation: round(best.rotation), offset: round(best.offset), residual: round(best.residual) };
}
const middle = fitMiddle('right');

const output = `// Generated by tools/onshape_reference.mjs from case/onshape/molekula.step.
// Do not edit by hand: run the script again and review the diff.
// Coordinates in mm in the KiCad frame of the respective half (as in pcb-reference.js),
// heights z from the top of the main board.

// Main board in the Onshape model: top (reference for all heights) and thickness.
export const onshapeMainBoard = ${JSON.stringify({ top: round(mainBoard.top), thickness: round(mainBoard.thickness) })};
// Placement of the halves in the Onshape model: Onshape XY = Rot(rotation°) · KiCad XY + offset.
// Fitted from the switch cut-outs of the covers, residual = largest deviation in mm.
export const halves = ${JSON.stringify(Object.fromEntries(Object.entries(halves).map(([k, h]) => [k, { rotation: round(h.rotation), offset: round(h.offset), residual: round(h.residual) }])))};
// Mounted position of the magnetic connector boards in the finished case, each in the frame of its half.
// axes: image of the board's KiCad axes. holes: centre on the mid-plane of the board.
// envelopes: bounding boxes in KiCad coordinates of the flat board (z = 0 bottom).
export const connectors = ${JSON.stringify(connectors)};
// MCU middle board in the Onshape model, fitted via H5–H7. There it sits in the right
// half: KiCad XY of the half = Rot(rotation°) · KiCad XY of the middle board + offset.
export const middle = ${JSON.stringify(middle)};
`;
fs.writeFileSync(TARGET, output);
console.log(`written: ${path.relative(REPO, TARGET)}`);
for (const [k, h] of Object.entries(halves)) console.log(`  half ${k}: rotation ${h.rotation.toFixed(4)}°, offset ${h.offset.map(v => v.toFixed(3)).join(' / ')}, residual ${h.residual.toExponential(1)} mm`);
for (const [k, v] of Object.entries(connectors)) {
  console.log(`  ${k}: rotation Z ${v.rotationZ}°, origin ${v.origin.join(' / ')}, edges ${v.bottomEdge} … ${v.topEdge}`);
  for (const [n, hl] of Object.entries(v.envelopes)) if (hl.side) console.log(`    ${n} (${hl.onshape}): Onshape ${hl.side}, KiCad ${hl.sideKicad}${hl.side !== hl.sideKicad ? '  <- differs' : ''}`);
}
console.log(`  middle board in half ${middle.half}: rotation ${middle.rotation}°, offset ${middle.offset.join(' / ')}, residual ${middle.residual} mm`);
process.exit(0);
