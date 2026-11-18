import { load, part, rotate, translate } from 'fluidcad/core';
import { platinenstaerke, schalter } from './pcb-referenz.js';

// Choc v1 (Burnt Orange) mit Hotswap-Socket und eigener Tastenkappe auf allen Plätzen
// der linken Hälfte, zum Prüfen auf Überschneidungen mit dem Gehäuse.
// Quelle: case/onshape/switch-mit-keycap.step, in FluidCAD importiert als
// imports/choc-v1-mit-keycap.brep (Ursprung Schaltermitte, z = 0 Platinenoberseite).
//
// Körper im Import, 0-basiert: 0 und 4 Socket-Kontakte, 1 Schalter, 2 Tastenkappe, 3 Socket.
const MODELL = 'choc-v1-mit-keycap';
const SCHALTER_UND_KAPPE = [1, 2];
const SOCKEL = [0, 3, 4];
// Im Onshape-Modell liegt die Socket-Oberseite 2,0 mm unter der Platinenoberseite.
// Bei 1,6 mm Platine rückt der Socket um die Differenz nach oben an die Unterseite.
const SOCKEL_OBERSEITE_IM_MODELL = 2.0;

export const schalterLinks = part('Molekula · Schalter links (Choc v1 + Kappe)', () => {
  for (const s of schalter.filter(s => s.teil === 'links')) {
    const [x, y] = s.mitte;
    const oben = load(MODELL).include(...SCHALTER_UND_KAPPE).name(`${s.ref} · Schalter + Kappe`);
    const sockel = load(MODELL).include(...SOCKEL).name(`${s.ref} · Socket`);
    if (s.drehung) rotate('z', s.drehung, oben, sockel);
    translate(x, y, platinenstaerke, oben);
    translate(x, y, SOCKEL_OBERSEITE_IM_MODELL, sockel);
  }
});
