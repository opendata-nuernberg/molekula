#!/usr/bin/env node
/**
 * Erzeugt ../onshape-referenz.js aus dem Onshape-Export case/onshape/molekula.step.
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis (FluidCAD muss unter case/fluidcad/node_modules verlinkt sein):
 *
 *     node case/fluidcad/werkzeuge/onshape_referenz.mjs [pfad/zur.step]
 *
 * Der Export ist ein Part Studio mit allen Körpern in Weltkoordinaten. Das Skript
 *
 * 1. findet in den Deckeln top_left/top_right die Schalterausschnitte und passt
 *    die KiCad-Schalterlagen aus pcb-referenz.js starr ein. Daraus folgt für jede
 *    Hälfte die Lage KiCad -> Onshape (Drehung um Z und Verschiebung);
 * 2. bestimmt an den Magnetverbinder-Platinen die Lage im Gehäuse: Bohrungsachsen,
 *    Plattenebene, Ober- und Unterkante und die stehen gebliebenen Stegnasen. Über
 *    die Nasen ordnet es die Bohrungen den KiCad-Bohrungen zu und legt fest, welche
 *    Kante unten liegt. Die Zuordnung ergibt sich also aus der Geometrie und wird
 *    nicht angenommen;
 * 3. rechnet alles in den KiCad-Rahmen der jeweiligen Hälfte um. Höhen zählen ab der
 *    Oberseite der Hauptplatine.
 *
 * Passt etwas nicht (Restfehler der Einpassung, Bohrungsabstand, Stegnasen),
 * bricht das Skript mit einer Meldung ab, statt eine falsche Referenz zu schreiben.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HIER, '..');
const REPO = path.resolve(WORKSPACE, '..', '..');
const QUELLE = path.resolve(process.argv[2] ?? path.join(REPO, 'case', 'onshape', 'molekula.step'));
const ZIEL = path.join(WORKSPACE, 'onshape-referenz.js');
const RUNDEN = 4;

// Schnitthöhe durch die Schalterausschnitte im Deckel, über der Oberseite der Hauptplatine.
const SCHNITT_Z = 1.0;
// Radius der Befestigungsbohrungen (Ø 2,65 mm) mit Toleranz.
const BOHRUNG_R = [1.2, 1.45];

const VERBINDER = {
  verbinderLinks: {
    haelfte: 'links',
    deckel: 'top_left',
    platte: 'mag_left', // Platine und Magnetbuchse sind in Onshape ein Körper.
    ffc: 'mag_con_left',
    magnet: 'mag_left',
    gegenplatte: 'pcb_mag_right',
  },
  verbinderRechts: {
    haelfte: 'rechts',
    deckel: 'top_right',
    platte: 'pcb_mag_right',
    ffc: 'mag_con_right',
    magnet: 'mag_right',
    gegenplatte: 'mag_left',
  },
};

function fehler(text) {
  console.error(`Abbruch: ${text}`);
  process.exit(1);
}

// ---------------------------------------------------------------- KiCad-Referenz

function kicadReferenz() {
  const text = fs.readFileSync(path.join(WORKSPACE, 'pcb-referenz.js'), 'utf8');
  const werte = {};
  for (const m of text.matchAll(/^export const (\w+) = (.*);$/gm)) werte[m[1]] = JSON.parse(m[2]);
  return werte;
}

// ---------------------------------------------------------------- STEP lesen

/** Namen der Wurzeln in Transfer-Reihenfolge (PRODUCT_DEFINITION in Dateireihenfolge). */
function produktNamen(text) {
  const ents = new Map();
  for (const m of text.matchAll(/\n#(\d+)=([\s\S]*?);\s*(?=\n#|\nENDSEC)/g)) ents.set(Number(m[1]), m[2]);
  const ref = (s, i) => Number(s.split(',')[i].match(/#(\d+)/)[1]);
  return [...ents.entries()]
    .filter(([, v]) => v.startsWith('PRODUCT_DEFINITION('))
    .sort(([a], [b]) => a - b)
    .map(([, v]) => {
      const formation = ents.get(ref(v, 2));
      const produkt = ents.get(ref(formation, 2));
      return produkt.match(/'([^']*)'/)[1];
    });
}

async function ladeOcct() {
  const fluidcad = fs.realpathSync(path.join(WORKSPACE, 'node_modules', 'fluidcad'));
  const eintrag = path.join(fluidcad, '..', 'ocjs-fluidcad', 'dist', 'index.js');
  if (!fs.existsSync(eintrag)) fehler(`OpenCascade nicht gefunden: ${eintrag}`);
  const { default: init } = await import(pathToFileURL(eintrag).href);
  return init({ pthreadPoolSize: 2 });
}

// ---------------------------------------------------------------- Vektoren

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = a => Math.hypot(...a);
const unit = a => mul(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rund = v => (Array.isArray(v) ? v.map(rund) : Math.round(v * 10 ** RUNDEN) / 10 ** RUNDEN + 0);

// ---------------------------------------------------------------- Hauptteil

const kicad = kicadReferenz();
const stepText = fs.readFileSync(QUELLE, 'latin1');
const namen = produktNamen(stepText);
const oc = await ladeOcct();
oc.FS.writeFile('/quelle.step', fs.readFileSync(QUELLE));
const leser = new oc.STEPControl_Reader();
if (leser.ReadFile('/quelle.step') !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) fehler('STEP nicht lesbar');
if (leser.NbRootsForTransfer() !== namen.length) fehler(`${leser.NbRootsForTransfer()} Wurzeln, aber ${namen.length} Produktnamen`);

const formCache = new Map();
function form(name) {
  if (!formCache.has(name)) {
    const i = namen.indexOf(name);
    if (i < 0) fehler(`Körper ${name} fehlt im Export`);
    leser.ClearShapes();
    leser.TransferOneRoot(i + 1);
    formCache.set(name, leser.OneShape());
  }
  return formCache.get(name);
}

const pkt = p => [p.X(), p.Y(), p.Z()];

function bbox(shape) {
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(shape, b, false);
  return { min: pkt(b.CornerMin()), max: pkt(b.CornerMax()) };
}

/** Flächen eines Körpers mit Typ, Fläche, Schwerpunkt und den Knoten ihres Netzes. */
function flaechen(name) {
  const shape = form(name);
  new oc.BRepMesh_IncrementalMesh(shape, 0.05, false, 0.2, false);
  const liste = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    const f = oc.TopoDS.Face(ex.Current());
    const ad = new oc.BRepAdaptor_Surface(f, true);
    const g = new oc.GProp_GProps();
    oc.BRepGProp.SurfaceProperties(f, g, false, false);
    const e = { flaeche: g.Mass(), schwerpunkt: pkt(g.CentreOfMass()), knoten: knotenVon(f) };
    const typ = ad.GetType();
    if (typ === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
      e.typ = 'ebene';
      e.normale = pkt(ad.Plane().Axis().Direction());
      if (f.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) e.normale = mul(e.normale, -1);
    } else if (typ === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
      const z = ad.Cylinder();
      e.typ = 'zylinder';
      e.radius = z.Radius();
      e.achse = pkt(z.Axis().Direction());
      e.ort = pkt(z.Axis().Location());
    } else e.typ = 'sonst';
    liste.push(e);
  }
  return liste;
}

function knotenVon(face) {
  const loc = new oc.TopLoc_Location();
  const t = oc.BRep_Tool.Triangulation(face, loc, 0);
  if (!t) return [];
  const tr = loc.Transformation();
  const p = [];
  for (let k = 1; k <= t.NbNodes(); k++) p.push(pkt(t.Node(k).Transformed(tr)));
  return p;
}

function dreiecke(name) {
  const shape = form(name);
  new oc.BRepMesh_IncrementalMesh(shape, 0.05, false, 0.2, false);
  const tris = [];
  const knoten = [];
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    const loc = new oc.TopLoc_Location();
    const t = oc.BRep_Tool.Triangulation(oc.TopoDS.Face(ex.Current()), loc, 0);
    if (!t) continue;
    const tr = loc.Transformation();
    const p = [];
    for (let k = 1; k <= t.NbNodes(); k++) p.push(pkt(t.Node(k).Transformed(tr)));
    knoten.push(...p);
    for (let k = 1; k <= t.NbTriangles(); k++) {
      const d = t.Triangle(k);
      tris.push([p[d.Value(1) - 1], p[d.Value(2) - 1], p[d.Value(3) - 1]]);
    }
  }
  return { tris, knoten };
}

/** Schnitt eines Netzes mit der Ebene z = h, zu geschlossenen Zügen verbunden. */
function schnittZuege(tris, h) {
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
  const nachbarn = new Map();
  segs.forEach((s, i) => s.forEach(p => {
    const k = key(p);
    if (!nachbarn.has(k)) nachbarn.set(k, []);
    nachbarn.get(k).push(i);
  }));
  const gesehen = new Set();
  const zuege = [];
  for (let i = 0; i < segs.length; i++) {
    if (gesehen.has(i)) continue;
    const stapel = [i];
    const punkte = [];
    while (stapel.length) {
      const j = stapel.pop();
      if (gesehen.has(j)) continue;
      gesehen.add(j);
      for (const p of segs[j]) {
        punkte.push(p);
        for (const m of nachbarn.get(key(p))) if (!gesehen.has(m)) stapel.push(m);
      }
    }
    zuege.push(punkte);
  }
  return zuege;
}

/** Starre 2D-Einpassung der KiCad-Schalter in die Ausschnitte eines Deckels. */
function haelfteEinpassen(teil, deckel, zRef) {
  const soll = kicad.schalter.filter(s => s.teil === teil).map(s => s.mitte);
  const ist = schnittZuege(dreiecke(deckel).tris, zRef + SCHNITT_Z)
    .map(z => {
      const xs = z.map(p => p[0]);
      const ys = z.map(p => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      return { mitte: [(x0 + x1) / 2, (y0 + y1) / 2], groesse: [x1 - x0, y1 - y0] };
    })
    .filter(z => z.groesse.every(g => g > 13.5 && g < 20))
    .map(z => z.mitte);
  if (ist.length !== soll.length) fehler(`${deckel}: ${ist.length} Schalterausschnitte, KiCad hat ${soll.length} Schalter auf ${teil}`);

  const mittel = ps => ps.reduce((s, p) => add(s, p), [0, 0]).map(v => v / ps.length);
  const ks = mittel(soll);
  const is = mittel(ist);
  const dreh = (p, w) => [p[0] * Math.cos(w) - p[1] * Math.sin(w), p[0] * Math.sin(w) + p[1] * Math.cos(w)];
  const naechster = p => ist.reduce((b, q, i) => (norm(sub(p, q)) < b.d ? { d: norm(sub(p, q)), i } : b), { d: Infinity, i: -1 });
  let best = null;
  for (let g = 0; g < 360; g += 0.25) {
    const w = (g * Math.PI) / 180;
    const paare = soll.map(p => naechster(add(dreh(sub(p, ks), w), is)));
    const e = paare.reduce((s, q) => s + q.d, 0);
    if (!best || e < best.e) best = { e, paare };
  }
  const ziel = best.paare.map(q => ist[q.i]);
  if (new Set(best.paare.map(q => q.i)).size !== soll.length) fehler(`${deckel}: Zuordnung der Schalter nicht eindeutig`);
  const zs = mittel(ziel);
  let sc = 0;
  let ss = 0;
  soll.forEach((p, i) => {
    const a = sub(p, ks);
    const b = sub(ziel[i], zs);
    ss += a[0] * b[1] - a[1] * b[0];
    sc += a[0] * b[0] + a[1] * b[1];
  });
  const w = Math.atan2(ss, sc);
  const verschiebung = sub(zs, dreh(ks, w));
  const rest = Math.max(...soll.map((p, i) => norm(sub(add(dreh(p, w), verschiebung), ziel[i]))));
  if (rest > 0.02) fehler(`${deckel}: Restfehler der Einpassung ${rest.toFixed(3)} mm`);
  return { drehung: (w * 180) / Math.PI, verschiebung, rest };
}

const zRef = bbox(form('pcb_right')).max[2];
const hauptplatine = { oberseite: zRef, dicke: zRef - bbox(form('pcb_right')).min[2] };
const haelften = {
  links: haelfteEinpassen('links', 'top_left', zRef),
  rechts: haelfteEinpassen('rechts', 'top_right', zRef),
};

/** Onshape-Weltpunkt -> KiCad-Rahmen der Hälfte, z ab Oberseite Hauptplatine. */
function inHaelfte(h, p) {
  const w = (-h.drehung * Math.PI) / 180;
  const [x, y] = sub(p, h.verschiebung);
  return [x * Math.cos(w) - y * Math.sin(w), x * Math.sin(w) + y * Math.cos(w), p[2] - zRef];
}
function richtungInHaelfte(h, d) {
  const w = (-h.drehung * Math.PI) / 180;
  return [d[0] * Math.cos(w) - d[1] * Math.sin(w), d[0] * Math.sin(w) + d[1] * Math.cos(w), d[2]];
}

function verbinderAnalysieren(name, cfg) {
  const h = haelften[cfg.haelfte];
  const fl = flaechen(cfg.platte).map(f => ({
    ...f,
    schwerpunkt: inHaelfte(h, f.schwerpunkt),
    knoten: f.knoten.map(p => inHaelfte(h, p)),
    ...(f.normale && { normale: richtungInHaelfte(h, f.normale) }),
    ...(f.achse && { achse: richtungInHaelfte(h, f.achse), ort: inHaelfte(h, f.ort) }),
  }));

  // Bohrungen: zwei waagrechte Achsen, gleiche Richtung.
  const zyl = fl.filter(f => f.typ === 'zylinder' && f.radius > BOHRUNG_R[0] && f.radius < BOHRUNG_R[1]);
  const d = unit([zyl[0].achse[0], zyl[0].achse[1], 0]);
  if (Math.abs(zyl[0].achse[2]) > 1e-6) fehler(`${name}: Bohrungsachse nicht waagrecht`);
  const achsen = [];
  for (const z of zyl) {
    const quer = [-d[1], d[0], 0];
    const lage = dot(z.ort, quer);
    if (!achsen.some(a => Math.abs(a.lage - lage) < 0.01)) achsen.push({ lage, ort: z.ort, flaechen: [] });
    achsen.find(a => Math.abs(a.lage - lage) < 0.01).flaechen.push(z);
  }
  if (achsen.length !== 2) fehler(`${name}: ${achsen.length} Bohrungsachsen statt 2`);
  // Plattenstärke aus der Länge der Bohrungswände entlang der Achse.
  const entlang = achsen[0].flaechen.flatMap(f => f.knoten.map(p => dot(p, d)));
  const [s0, s1] = [Math.min(...entlang), Math.max(...entlang)];
  const dicke = s1 - s0;
  const mitteS = (s0 + s1) / 2;
  const bohrungMitte = a => add(sub(a.ort, mul(d, dot(a.ort, d))), mul(d, mitteS));

  // Kanten: waagrechte Flächen innerhalb der Plattenstärke.
  const inPlatte = f => {
    const s = f.knoten.map(p => dot(p, d));
    return Math.min(...s) > s0 - 0.01 && Math.max(...s) < s1 + 0.01;
  };
  const waagrecht = fl.filter(f => f.typ === 'ebene' && Math.abs(Math.abs(f.normale[2]) - 1) < 1e-6 && inPlatte(f));
  const oben = Math.max(...waagrecht.filter(f => f.normale[2] > 0).map(f => f.schwerpunkt[2]));
  const unten = waagrecht.filter(f => f.normale[2] < 0);
  const proHoehe = new Map();
  for (const f of unten) proHoehe.set(rund(f.schwerpunkt[2]), (proHoehe.get(rund(f.schwerpunkt[2])) ?? 0) + f.flaeche);
  const unterkante = [...proHoehe.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const nasen = unten.filter(f => f.schwerpunkt[2] < unterkante - 0.1);
  if (nasen.length !== 2) fehler(`${name}: ${nasen.length} Stegnasen statt 2`);
  const bohrZ = bohrungMitte(achsen[0])[2];
  if (Math.abs(bohrZ - (oben + unterkante) / 2) > 0.01) fehler(`${name}: Bohrungen nicht mittig zwischen den Kanten`);

  // Zuordnung über die Stegnasen.
  const kiBohr = kicad.bohrungen.filter(b => b.teil === name);
  const seite = name === 'verbinderLinks' ? 'links-verbinder' : 'rechts-verbinder';
  const kiStege = Object.entries(kicad.stege).filter(([k]) => k.startsWith(seite)).map(([, s]) => s);
  const kiStegX = kiStege.map(s => (s.von[0] + s.bis[0]) / 2);
  if (kiBohr.length !== 2 || kiStege.length !== 2) fehler(`${name}: KiCad-Referenz passt nicht`);
  const nasenOrt = nasen.map(f => f.schwerpunkt);
  let zuordnung = null;
  for (const [ia, ib] of [[0, 1], [1, 0]]) {
    // Achse A gehört zu kiBohr[ia]. KiCad +x zeigt von der kleineren zur größeren x-Bohrung.
    const A = bohrungMitte(achsen[0]);
    const B = bohrungMitte(achsen[1]);
    const xa = kiBohr[ia].mitte[0];
    const xb = kiBohr[ib].mitte[0];
    const u = unit(mul(sub(B, A), Math.sign(xb - xa)));
    const fehlerSumme = kiStegX.reduce((s, x) => s + Math.min(...nasenOrt.map(n => Math.abs(dot(sub(n, A), u) - (x - xa)))), 0);
    if (!zuordnung || fehlerSumme < zuordnung.fehler) zuordnung = { fehler: fehlerSumme, A, B, u, a: kiBohr[ia], b: kiBohr[ib] };
  }
  if (zuordnung.fehler > 0.2) fehler(`${name}: Stegnasen passen nicht zu den KiCad-Stegen (${zuordnung.fehler.toFixed(2)} mm)`);
  const abstand = norm(sub(zuordnung.B, zuordnung.A));
  const kiAbstand = Math.abs(zuordnung.b.mitte[0] - zuordnung.a.mitte[0]);
  if (Math.abs(abstand - kiAbstand) > 0.02) fehler(`${name}: Bohrungsabstand ${abstand.toFixed(3)} statt ${kiAbstand}`);

  // Die Stege sitzen auf der Kante zur Hälfte (größeres KiCad-y). Liegen die Nasen
  // unten, zeigt KiCad +y nach unten.
  const stegSeiteY = Math.sign(kiStege[0].von[1] + kiStege[0].bis[1] - 2 * zuordnung.a.mitte[1]);
  const v = [0, 0, Math.sign(nasenOrt[0][2] - bohrZ) * stegSeiteY];
  const u = zuordnung.u;
  const w = cross(u, v);
  if (Math.abs(Math.abs(dot(w, d)) - 1) > 1e-6) fehler(`${name}: Plattennormale passt nicht zu den Bohrungen`);

  // Bild des KiCad-Ursprungs: KiCad z = 0 ist die Unterseite der Platine.
  const kd = kicad.platinenstaerke;
  const ursprung = sub(sub(sub(zuordnung.A, mul(u, zuordnung.a.mitte[0])), mul(v, zuordnung.a.mitte[1])), mul(w, kd / 2));
  const inPlatine = p => {
    const q = sub(inHaelfte(h, p), ursprung);
    return [dot(q, u), dot(q, v), dot(q, w)];
  };
  const huelle = (teil, filter = () => true) => {
    const ps = dreiecke(teil).knoten.map(inPlatine).filter(filter);
    return { min: rund([0, 1, 2].map(i => Math.min(...ps.map(p => p[i])))), max: rund([0, 1, 2].map(i => Math.max(...ps.map(p => p[i])))) };
  };
  const ausserhalbPlatte = p => p[2] > kd / 2 + dicke / 2 + 0.01 || p[2] < kd / 2 - dicke / 2 - 0.01;
  const seiteVon = hl => (hl.min[2] + hl.max[2] > kd ? 'oben' : 'unten');
  const ffc = huelle(cfg.ffc);
  const magnet = huelle(cfg.magnet, ausserhalbPlatte);
  const kiFfc = kicad.bauteile.find(b => b.teil === name && b.footprint.includes('FFC'));
  const kiMag = kicad.bauteile.find(b => b.teil === name && b.footprint.includes('Magnetic'));

  return {
    haelfte: cfg.haelfte,
    // Rx(-90°), dann Rz(drehungZ), dann um ursprung verschieben: so kommt die flach
    // in KiCad-Koordinaten gebaute Platine (z = 0 Unterseite) in ihre Einbaulage.
    drehungZ: rund((Math.atan2(u[1], u[0]) * 180) / Math.PI),
    ursprung: rund(ursprung),
    achsen: { x: rund(u), y: rund(v), z: rund(w) },
    bohrungen: Object.fromEntries([[zuordnung.a.ref, rund(zuordnung.A)], [zuordnung.b.ref, rund(zuordnung.B)]]),
    oberkante: rund(oben),
    unterkante: rund(unterkante),
    nasenUnterkante: rund(Math.min(...nasenOrt.map(n => n[2]))),
    dickeOnshape: rund(dicke),
    huellen: {
      ffc: { onshape: cfg.ffc, ...ffc, seite: seiteVon(ffc), seiteKicad: kiFfc?.seite ?? null },
      magnet: { onshape: cfg.magnet, ...magnet, seite: seiteVon(magnet), seiteKicad: kiMag?.seite ?? null },
      gegenplatte: { onshape: cfg.gegenplatte, ...huelle(cfg.gegenplatte) },
    },
  };
}

const verbinder = Object.fromEntries(Object.entries(VERBINDER).map(([n, c]) => [n, verbinderAnalysieren(n, c)]));

/** Lage des MCU-Mittelteils über seine drei Bohrungen (H5–H7), im Rahmen der Hälfte, in der es sitzt. */
function mitteEinpassen(haelfte) {
  const h = haelften[haelfte];
  const soll = kicad.bohrungen.filter(b => b.teil === 'mitte');
  const ist = [];
  for (const f of flaechen('pcb_mcu')) {
    if (f.typ !== 'zylinder' || f.radius < BOHRUNG_R[0] || f.radius > BOHRUNG_R[1]) continue;
    if (Math.abs(Math.abs(f.achse[2]) - 1) > 1e-6) fehler('pcb_mcu: Bohrung nicht senkrecht');
    const p = inHaelfte(h, f.ort).slice(0, 2);
    if (!ist.some(q => norm(sub(p, q)) < 0.01)) ist.push(p);
  }
  if (ist.length !== soll.length) fehler(`pcb_mcu: ${ist.length} Bohrungen, KiCad hat ${soll.length}`);
  const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
  let best = null;
  for (const perm of perms([...ist.keys()])) {
    const K = soll.map(b => b.mitte);
    const T = perm.map(i => ist[i]);
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
    const dreh = p => [p[0] * Math.cos(w) - p[1] * Math.sin(w), p[0] * Math.sin(w) + p[1] * Math.cos(w)];
    const t = sub(tm, dreh(km));
    const rest = Math.max(...K.map((p, i) => norm(sub(add(dreh(p), t), T[i]))));
    if (!best || rest < best.rest) best = { drehung: (w * 180) / Math.PI, verschiebung: t, rest };
  }
  if (best.rest > 0.02) fehler(`pcb_mcu: Restfehler ${best.rest.toFixed(3)} mm`);
  return { haelfte, drehung: rund(best.drehung), verschiebung: rund(best.verschiebung), rest: rund(best.rest) };
}
const mitte = mitteEinpassen('rechts');

const ausgabe = `// Automatisch erzeugt von werkzeuge/onshape_referenz.mjs aus case/onshape/molekula.step.
// Nicht von Hand ändern: Skript erneut ausführen und den Diff prüfen.
// Koordinaten in mm im KiCad-Rahmen der jeweiligen Hälfte (wie pcb-referenz.js),
// Höhen z ab der Oberseite der Hauptplatine.

// Hauptplatine im Onshape-Modell: Oberseite (Bezug für alle Höhen) und Stärke.
export const onshapeHauptplatine = ${JSON.stringify({ oberseite: rund(hauptplatine.oberseite), dicke: rund(hauptplatine.dicke) })};
// Lage der Hälften im Onshape-Modell: Onshape-XY = Drehung(drehung°) · KiCad-XY + verschiebung.
// Aus den Schalterausschnitten der Deckel eingepasst, rest = größte Abweichung in mm.
export const haelften = ${JSON.stringify(Object.fromEntries(Object.entries(haelften).map(([k, h]) => [k, { drehung: rund(h.drehung), verschiebung: rund(h.verschiebung), rest: rund(h.rest) }])))};
// Einbaulage der Magnetverbinder-Platinen im fertigen Gehäuse, je im Rahmen ihrer Hälfte.
// achsen: Bild der KiCad-Achsen der Platine. bohrungen: Mitte auf der Plattenmittelebene.
// huellen: Hüllquader in KiCad-Koordinaten der flachen Platine (z = 0 Unterseite).
export const verbinder = ${JSON.stringify(verbinder)};
// MCU-Mittelteil im Onshape-Modell, eingepasst über H5–H7. Es sitzt dort in der rechten
// Hälfte: KiCad-XY der Hälfte = Drehung(drehung°) · KiCad-XY des Mittelteils + verschiebung.
export const mitte = ${JSON.stringify(mitte)};
`;
fs.writeFileSync(ZIEL, ausgabe);
console.log(`geschrieben: ${path.relative(REPO, ZIEL)}`);
for (const [k, h] of Object.entries(haelften)) console.log(`  Hälfte ${k}: Drehung ${h.drehung.toFixed(4)}°, Verschiebung ${h.verschiebung.map(v => v.toFixed(3)).join(' / ')}, Rest ${h.rest.toExponential(1)} mm`);
for (const [k, v] of Object.entries(verbinder)) {
  console.log(`  ${k}: Drehung Z ${v.drehungZ}°, Ursprung ${v.ursprung.join(' / ')}, Kanten ${v.unterkante} … ${v.oberkante}`);
  for (const [n, hl] of Object.entries(v.huellen)) if (hl.seite) console.log(`    ${n} (${hl.onshape}): Onshape ${hl.seite}, KiCad ${hl.seiteKicad}${hl.seite !== hl.seiteKicad ? '  <- abweichend' : ''}`);
}
console.log(`  Mittelteil in Hälfte ${mitte.haelfte}: Drehung ${mitte.drehung}°, Verschiebung ${mitte.verschiebung.join(' / ')}, Rest ${mitte.rest} mm`);
process.exit(0);
