#!/usr/bin/env node
/**
 * Print files for the keycaps and the encoder knob (STEP and STL).
 *
 * Run from the repository root (FluidCAD must be linked under case/fluidcad/node_modules):
 *
 *     node case/fluidcad/tools/keycap-files.mjs [tunic|grey]   # one theme, default both
 *
 * Themes (themes.js): Tunic has beige caps, a hexagon on the home caps, thumbs in the eye
 * colours and a knob with a blue eye inlay; neutral grey has grey caps, three dots on the
 * home caps and a knob without an eye. The geometry differs only in the homing mark and the
 * eye; the colours go into the names of the 3MF objects.
 *
 * The caps are rendered from keycap.part.js in a private FluidCAD server (an open editor is
 * not affected) and turned into print orientation: standing on the front edge, top surface
 * facing -Y, the integrated support on the bed behind it. The knob comes from
 * encoder-knob.part.js and is turned onto its flat top; its eye inlay gets the same move, so
 * the two files line up as one object with two parts in the slicer.
 *
 * Print groups: for printing by object (OrcaSlicer: print sequence "by object"), the caps
 * stand in rings, top surfaces outwards, their support frames joined in the middle, so each
 * group is one stable object. Four caps form a square (the pinwheel of the original
 * clusters: the frames cross in a grid), six caps a hexagon (the frames are joined by a flat
 * hexagonal ring). A full set is seven groups, all in the base colour or any group in an
 * accent colour:
 *   2 × home row: square of 3 finger caps and the index finger home cap
 *   4 × finger: hexagon of 6 finger caps, the keys around the home rows
 *   1 × thumbs: hexagon of the 6 thumb caps
 *
 * Output in case/fluidcad/print/keycaps/<theme>/ (not tracked in Git), binary STL:
 *   keycap-group-home-row, keycap-group-finger, keycap-group-thumbs (.stl): one group each
 *   keycaps-set.3mf: the seven groups as separate objects on one plate
 *   keycap-finger, keycap-home-<mark>, keycap-thumb (.step/.stl): single caps, for printing
 *     each cap in its own colour
 *   encoder-knob.step/.stl; with an eye inlay also encoder-knob-eye.stl and
 *     encoder-knob-with-eye.step
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEMES } from '../themes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const PRINT = path.join(WORKSPACE, 'print', 'keycaps');
let OUTPUT = PRINT;

const chosen = process.argv[2] ? [process.argv[2]] : Object.keys(THEMES);
if (!chosen.every(t => t in THEMES)) {
  console.error(`Give the theme as one of: ${Object.keys(THEMES).join(', ')}`);
  process.exit(1);
}
// Square of four (the original clusters): pocket floor of each cap `distance` from the
// centre, shifted sideways by `shift`, so the caps interlock like a pinwheel.
const SQUARE = { distance: 11.35, shift: 2 };
// Hexagon of six: smallest distance at which neighbouring caps keep `gap` at their inner
// corners (rim 1 mm behind the pocket floor, half width 9.15 mm); the ring joining the cross
// bars is one layer pair thick.
const HEXAGON = { gap: 1.5, ring: 0.4 };
// Gap between the groups in keycaps-set.3mf; the slicer can rearrange them.
const GROUP_GAP = 12;

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

function size(shape) {
  const { lo, hi } = bounds(shape);
  return `${(hi[0] - lo[0]).toFixed(1)} × ${(hi[1] - lo[1]).toFixed(1)} × ${(hi[2] - lo[2]).toFixed(1)} mm`;
}

/** Triangles of a shape (9 coordinates each). The binding writes ASCII STL only. */
function triangles(shape) {
  new oc.BRepMesh_IncrementalMesh(shape, 0.02, false, 0.2, false);
  new oc.StlAPI_Writer().Write(shape, '/out.stl', new oc.Message_ProgressRange());
  const text = Buffer.from(oc.FS.readFile('/out.stl')).toString('latin1');
  const v = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m; (m = re.exec(text));) v.push(+m[1], +m[2], +m[3]);
  return Float64Array.from(v);
}

/** Binary STL of triangle sets, each moved by [dx, dy]: a fifth of the size of ASCII. */
function binaryStl(sets) {
  const n = sets.reduce((sum, { tris }) => sum + tris.length / 9, 0);
  const out = Buffer.alloc(84 + 50 * n);
  out.write('Molekula keycaps', 0, 'latin1');
  out.writeUInt32LE(n, 80);
  let o = 84;
  for (const { tris, at = [0, 0] } of sets) {
    for (let i = 0; i < tris.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(i, i + 9);
      const [ux, uy, uz, wx, wy, wz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      [nx / l, ny / l, nz / l, ax + at[0], ay + at[1], az, bx + at[0], by + at[1], bz, cx + at[0], cy + at[1], cz]
        .forEach((x, k) => out.writeFloatLE(x, o + 4 * k));
      o += 50;
    }
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
  const tris = triangles(shape);
  fs.writeFileSync(`${base}.stl`, binaryStl([{ tris }]));
  console.log(`${name}: ${(volume(shape) / 1000).toFixed(2)} cm³, ${size(shape)} -> ${path.relative(process.cwd(), base)}${step ? '.step/' : '.'}stl`);
  return tris;
}

/** Triangles turned by `deg` about the vertical axis. */
function turned(tris, deg) {
  const [c, sn] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const out = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i] * c - tris[i + 1] * sn;
    out[i + 1] = tris[i] * sn + tris[i + 1] * c;
    out[i + 2] = tris[i + 2];
  }
  return out;
}

/** Flat ring between two concentric regular polygons (apothems r0 < r1), as triangles. */
function polygonRing(n, r0, r1, height, startDeg) {
  const corner = (r, k, z) => {
    const a = ((startDeg + (k * 360) / n) * Math.PI) / 180;
    const R = r / Math.cos(Math.PI / n);
    return [R * Math.cos(a), R * Math.sin(a), z];
  };
  const t = [];
  const quad = (p, q, r, u) => t.push(...p, ...q, ...r, ...p, ...r, ...u);
  for (let k = 0; k < n; k++) {
    const [i0, i1, o0, o1] = [corner(r0, k, 0), corner(r0, k + 1, 0), corner(r1, k, 0), corner(r1, k + 1, 0)];
    const [I0, I1, O0, O1] = [corner(r0, k, height), corner(r0, k + 1, height), corner(r1, k, height), corner(r1, k + 1, height)];
    quad(i0, i1, o1, o0); // bottom, facing down
    quad(I0, O0, O1, I1); // top
    quad(o0, o1, O1, O0); // outside
    quad(i1, i0, I0, I1); // inside
  }
  return Float64Array.from(t);
}

/**
 * A print group: the caps in a ring, top surfaces outwards. A cap as exported has its pocket
 * floor at y = 0, its top towards -Y and its frame towards +Y, ending at y = frameEnd.
 * Four caps: the pinwheel of the original clusters. Six caps: a hexagon, the cross bars at
 * the ends of the frames joined by a flat ring.
 */
function group(caps, frameEnd, width) {
  const n = caps.length;
  let distance = SQUARE.distance;
  let shift = SQUARE.shift;
  if (n === 6) {
    // Inner corner of a cap at (width / 2, distance - 1) keeps gap / 2 from the 30° line
    // between two neighbours.
    const half = Math.PI / 6;
    distance = 1 + (HEXAGON.gap / 2 + (width / 2) * Math.cos(half)) / Math.sin(half);
    shift = 0;
  } else if (n !== 4) {
    throw new Error(`groups of ${n} caps are not laid out`);
  }
  const sets = caps.map((tris, i) => {
    const phi = -90 + (i * 360) / n; // outward direction of this cap
    const [ux, uy] = [Math.cos((phi * Math.PI) / 180), Math.sin((phi * Math.PI) / 180)];
    // Turn so that the top (-Y) faces outwards, then move the pocket floor out.
    return { tris: turned(tris, phi + 90), at: [distance * ux + shift * uy, distance * uy - shift * ux] };
  });
  if (n === 6) {
    // Ring under the cross bars (frameEnd - 1 … frameEnd from the pocket floor), sides
    // facing the caps.
    sets.push({ tris: polygonRing(6, distance - frameEnd, distance - frameEnd + 1, HEXAGON.ring, -90 + 30) });
  }
  return sets;
}

function writeGroup(name, sets) {
  fs.writeFileSync(path.join(OUTPUT, `${name}.stl`), binaryStl(sets));
  console.log(`${name}: ${sets.length} parts -> ${path.relative(process.cwd(), path.join(OUTPUT, name))}.stl`);
}

/** One mesh with shared vertices from triangle sets. */
function mesh(sets) {
  const index = new Map();
  const vertices = [];
  const faces = [];
  for (const { tris, at = [0, 0] } of sets) {
    for (let i = 0; i < tris.length; i += 9) {
      const f = [0, 1, 2].map(k => {
        const p = [tris[i + 3 * k] + at[0], tris[i + 3 * k + 1] + at[1], tris[i + 3 * k + 2]];
        const key = p.map(v => v.toFixed(5)).join(',');
        if (!index.has(key)) { index.set(key, vertices.length); vertices.push(p); }
        return index.get(key);
      });
      if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) faces.push(f);
    }
  }
  return { vertices, faces };
}

/** CRC-32 for the ZIP container of a 3MF. */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Uncompressed ZIP of { name: Buffer }. */
function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name);
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(n.length, 26);
    local.push(head, n, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

/** 3MF with each group as its own object, laid out in rows around the plate centre. */
function write3mf(name, groups, plate = [256, 256]) {
  const objects = groups.map((g, i) => {
    const { vertices, faces } = mesh(g.sets);
    const xs = vertices.map(v => v[0]);
    const ys = vertices.map(v => v[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const v = vertices.map(p => `<vertex x="${p[0].toFixed(5)}" y="${(p[1]).toFixed(5)}" z="${p[2].toFixed(5)}"/>`).join('');
    const t = faces.map(f => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('');
    return { id: i + 1, name: g.name, box, xml: `<object id="${i + 1}" name="${g.name}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>` };
  });
  // Rows from front to back, as many groups per row as fit.
  const rows = [];
  let row = [];
  let rowWidth = 0;
  for (const o of objects) {
    const w = o.box[2] - o.box[0];
    if (row.length && rowWidth + GROUP_GAP + w > plate[0] - 20) { rows.push(row); row = []; rowWidth = 0; }
    rowWidth += (row.length ? GROUP_GAP : 0) + w;
    row.push(o);
  }
  rows.push(row);
  const depths = rows.map(r => Math.max(...r.map(o => o.box[3] - o.box[1])));
  const total = depths.reduce((s, d) => s + d, 0) + GROUP_GAP * (rows.length - 1);
  const items = [];
  let y = (plate[1] - total) / 2;
  rows.forEach((r, k) => {
    const width = r.reduce((s, o) => s + o.box[2] - o.box[0], 0) + GROUP_GAP * (r.length - 1);
    let x = (plate[0] - width) / 2;
    for (const o of r) {
      const tx = x - o.box[0];
      const ty = y - o.box[1];
      items.push(`<item objectid="${o.id}" transform="1 0 0 0 1 0 0 0 1 ${tx.toFixed(3)} ${ty.toFixed(3)} 0"/>`);
      x += o.box[2] - o.box[0] + GROUP_GAP;
    }
    y += depths[k] + GROUP_GAP;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects.map(o => o.xml).join('')}</resources><build>${items.join('')}</build></model>`;
  const files = {
    '[Content_Types].xml': Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': Buffer.from(model),
  };
  fs.writeFileSync(path.join(OUTPUT, `${name}.3mf`), zip(files));
  console.log(`${name}: ${groups.length} objects in ${rows.length} rows -> ${path.relative(process.cwd(), path.join(OUTPUT, name))}.3mf`);
}
const copies = (x, n) => Array(n).fill(x);

// Key frame -> print orientation: turned by 90° about X, the front edge (-Y) onto the bed.
// The key's Z becomes -Y: the frame of the integrated support ends at y = 8 (SUPPORT in
// keycap.part.js), the caps are 18.3 mm wide.
const FRAME_END = 8;
const WIDTH = 18.3;
const standUp = rotation([1, 0, 0], Math.PI / 2);
const flip = rotation([1, 0, 0], Math.PI);
const COLOUR_NAMES = { '#d8c9a3': 'beige', '#3aa7e6': 'blue', '#e5458f': 'pink', '#8fcf3e': 'green', '#8d9093': 'grey' };
const colourName = c => COLOUR_NAMES[c.toLowerCase()] ?? c;

/** One cap in print orientation: X centred, Y = 0 at the pocket floor, on the bed. */
async function cap(values) {
  const found = readSolids(await render('keycap.part.js', values));
  if (found.length !== 1) throw new Error(`keycap: ${found.length} solids instead of one`);
  const b = bounds(moved(found[0], standUp));
  return moved(found[0], translation(0, 0, -b.lo[2]).Multiplied(standUp));
}

// The finger and thumb caps are the same in every theme; only the home caps differ.
const plain = {
  finger: await cap({ Profile: 'finger', 'Homing mark': 'none' }),
  thumb: await cap({ Profile: 'thumb', 'Homing mark': 'none' }),
};
const homes = {};

for (const id of chosen) {
  const theme = THEMES[id];
  OUTPUT = path.join(PRINT, id);
  fs.mkdirSync(OUTPUT, { recursive: true });
  console.log(`\n${theme.title} -> ${path.relative(process.cwd(), OUTPUT)}`);

  homes[theme.mark] ??= await cap({ Profile: 'finger', 'Homing mark': theme.mark });
  const caps = {
    finger: write(plain.finger, 'keycap-finger'),
    home: write(homes[theme.mark], `keycap-home-${theme.mark}`),
    thumb: write(plain.thumb, 'keycap-thumb'),
  };

  // Print groups. Caps in print orientation: pocket floor at y = 0, frame end at y = FRAME_END.
  const homeRow = group([...copies(caps.finger, 3), caps.home], FRAME_END, WIDTH);
  const finger = group(copies(caps.finger, 6), FRAME_END, WIDTH);
  const thumbs = group(copies(caps.thumb, 6), FRAME_END, WIDTH);
  writeGroup('keycap-group-home-row', homeRow);
  writeGroup('keycap-group-finger', finger);
  writeGroup('keycap-group-thumbs', thumbs);
  const base = colourName(theme.caps);
  write3mf('keycaps-set', [
    { name: `Finger 1 (${base})`, sets: finger }, { name: `Finger 2 (${base})`, sets: finger },
    { name: `Home row left (${base})`, sets: homeRow },
    { name: `Finger 3 (${base})`, sets: finger }, { name: `Finger 4 (${base})`, sets: finger },
    { name: `Home row right (${base})`, sets: homeRow },
    { name: `Thumbs (${colourName(theme.thumbs[0])})`, sets: thumbs },
  ]);

  // Knob: the larger solid is the knob, the smaller one the eye inlay, if there is one.
  const knobSolids = readSolids(await render('encoder-knob.part.js', {
    'Eye on the top': theme.eye, 'Knob colour': theme.knob, 'Eye colour': theme.eyeColour,
  })).sort((a, b) => volume(b) - volume(a));
  if (knobSolids.length !== (theme.eye === 'inlay' ? 2 : 1)) throw new Error(`knob: ${knobSolids.length} solids`);
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
}
process.exit(0);
