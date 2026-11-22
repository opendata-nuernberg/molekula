/**
 * STL helpers shared by the print file scripts.
 *
 * OpenCascade's STL writer only writes ASCII here, and a fused or chamfered solid can carry
 * edges shorter than a micrometre. Their mesh nodes do not coincide exactly, so the ASCII
 * STL has open edges, and slicers have to repair it. The scripts therefore read the
 * triangles back, weld vertices that lie closer than WELD, drop the triangles that collapse,
 * and write binary STL, which is also a fifth of the size.
 */

const WELD = 1e-3;

/** Triangles of a shape, meshed by OpenCascade, as a flat array of 9 numbers each. */
export function triangles(oc, shape) {
  new oc.BRepMesh_IncrementalMesh(shape, 0.02, false, 0.2, false);
  new oc.StlAPI_Writer().Write(shape, '/out.stl', new oc.Message_ProgressRange());
  const text = Buffer.from(oc.FS.readFile('/out.stl')).toString('latin1');
  const v = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m; (m = re.exec(text));) v.push(+m[1], +m[2], +m[3]);
  return weld(Float64Array.from(v));
}

/** Moves vertices closer than `tol` onto one, and drops triangles that become degenerate. */
export function weld(tris, tol = WELD) {
  const cells = new Map();
  const cell = (x, y, z) => `${Math.floor(x / tol)},${Math.floor(y / tol)},${Math.floor(z / tol)}`;
  const snap = (x, y, z) => {
    const [cx, cy, cz] = [Math.floor(x / tol), Math.floor(y / tol), Math.floor(z / tol)];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let k = -1; k <= 1; k++) {
          for (const p of cells.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
            if (Math.hypot(p[0] - x, p[1] - y, p[2] - z) < tol) return p;
          }
        }
      }
    }
    const p = [x, y, z];
    const key = cell(x, y, z);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
    return p;
  };
  const out = [];
  for (let i = 0; i < tris.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map(o => snap(tris[i + o], tris[i + o + 1], tris[i + o + 2]));
    if (a !== b && b !== c && a !== c) out.push(...a, ...b, ...c);
  }
  return Float64Array.from(out);
}

/** Binary STL of triangle sets, each moved by `at` = [dx, dy]. */
export function binaryStl(sets, header = 'Molekula') {
  const n = sets.reduce((sum, { tris }) => sum + tris.length / 9, 0);
  const out = Buffer.alloc(84 + 50 * n);
  out.write(header.slice(0, 80), 0, 'latin1');
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
