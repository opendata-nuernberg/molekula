import { circle, color, extrude, load, param, part, plane, sketch, translate } from 'fluidcad/core';
import { huellen } from './huellen.js';
import { geschlossen, rechteck } from './kontur.js';
import { lage, layoutParameter, modellLage, platzieren } from './layout.js';
import { bauteile, platinenstaerke, schalter } from './pcb-referenz.js';

// Bestückung der Tastatur ohne Magnetverbinder, zum Prüfen auf Überschneidungen.
//
// Standard sind die gestuften Hüllquader aus huellen.js (werkzeuge/huellen.mjs): wenige
// einfache Körper, schnell im Browser. Mit „Detailmodelle“ kommen stattdessen die
// importierten Originale (imports/, siehe imports/QUELLEN.md) für eine Endkontrolle.
//
// Schaltermodell: Ursprung Schaltermitte, z = 0 Platinenoberseite. Im Onshape-Modell liegt
// die Socket-Oberseite 2,0 mm unter der Platinenoberseite; er wird an die Unterseite der
// 1,6-mm-Platine gesetzt.

const SOCKEL_OBERSEITE_IM_MODELL = 2.0;
const HUB = 3.0;

// Bauteil -> [Hülle/Import, Modelldatei im Footprint].
const BAUTEILE = {
  J13: ['helios', 'splinky-headers.step'],
  SW37: ['reset', 'Button_SW_SPST_SKQG_WithoutStem.STEP'],
  SW38: ['encoder', 'EC11-THT-15F-black.step'],
  J2: ['ffc', 'FPC-12.stp'],
  J3: ['ffc', 'FPC-12.stp'],
  J4: ['ffc', 'FPC-12.stp'],
  J5: ['ffc', 'FPC-12.stp'],
};

const FARBEN = { schalter: '#e07b39', kappe: '#d9d4c7', sockel: '#3a3a3a', encoder: '#555b66', helios: '#1f6f8b', reset: '#888888', ffc: '#c9c9c9' };

/**
 * Hülle als gestufte Quader an mehreren Stellen: je Stufe eine Skizze mit allen Rechtecken.
 * @param {string} name
 * @param {number} dz Verschiebung in z (Modellrahmen -> Platinenrahmen)
 * @param {{ mitte: number[], drehung: number }[]} orte
 */
function stufenkoerper(name, dz, orte) {
  return huellen[name].stufen.map((s, i) => {
    const b = s.max[0] - s.min[0];
    const h = s.max[1] - s.min[1];
    const c = [(s.max[0] + s.min[0]) / 2, (s.max[1] + s.min[1]) / 2];
    const skizze = sketch(plane('xy', { offset: s.z[0] + dz }), () => {
      for (const o of orte) {
        const w = (o.drehung * Math.PI) / 180;
        const m = [o.mitte[0] + c[0] * Math.cos(w) - c[1] * Math.sin(w), o.mitte[1] + c[0] * Math.sin(w) + c[1] * Math.cos(w)];
        if (huellen[name].rundAb !== undefined && s.z[0] >= huellen[name].rundAb) circle(m, Math.max(b, h));
        else geschlossen(rechteck(m, b, h, o.drehung));
      }
    }).name(`${huellen[name].titel} · Stufe ${i + 1}`);
    const k = extrude(s.z[1] - s.z[0], skizze).new().name(`${huellen[name].titel} · Stufe ${i + 1}`);
    color(FARBEN[name], k);
    return k;
  });
}

export const bestueckung = part('Molekula · Bestückung', () => {
  const p = layoutParameter();
  const gedrueckt = param('Tasten gedrückt', false, 'checkbox');
  const detail = param('Detailmodelle (langsam)', false, 'checkbox');

  const proRegion = { links: [], mitte: [], rechts: [] };

  for (const region of ['links', 'rechts']) {
    const orte = schalter.filter(s => s.teil === region);
    if (detail) {
      for (const s of orte) {
        const koerper = load('choc-v1-mit-keycap').include(1).name(`${s.ref} · Schalter`);
        const kappe = load('choc-v1-mit-keycap').include(2).name(`${s.ref} · Kappe`);
        const sockel = load('choc-v1-mit-keycap').include(0, 3, 4).name(`${s.ref} · Socket`);
        if (gedrueckt) translate(0, 0, -HUB, kappe);
        platzieren([{ r: ['z', s.drehung] }], koerper, kappe, sockel);
        translate(s.mitte[0], s.mitte[1], platinenstaerke, koerper, kappe);
        translate(s.mitte[0], s.mitte[1], SOCKEL_OBERSEITE_IM_MODELL, sockel);
        proRegion[region].push(koerper, kappe, sockel);
      }
    } else {
      proRegion[region].push(
        ...stufenkoerper('schalter', platinenstaerke, orte),
        ...stufenkoerper('kappe', platinenstaerke - (gedrueckt ? HUB : 0), orte),
        ...stufenkoerper('sockel', SOCKEL_OBERSEITE_IM_MODELL, orte),
      );
    }
  }

  for (const [ref, [name, datei]] of Object.entries(BAUTEILE)) {
    const b = bauteile.find(t => t.ref === ref);
    const m = b?.modelle.find(mm => mm.datei === datei);
    if (!m || !(b.teil in proRegion)) continue;
    const koerper = detail
      ? [load(huellen[name].import).name(`${ref} · ${b.wert}`)]
      : stufenkoerper(name, 0, [{ mitte: [0, 0], drehung: 0 }]);
    platzieren(modellLage(b, m), ...koerper);
    proRegion[b.teil].push(...koerper);
  }

  for (const [region, koerper] of Object.entries(proRegion)) platzieren(lage(region, p), ...koerper);
});
