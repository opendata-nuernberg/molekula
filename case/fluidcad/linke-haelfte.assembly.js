import { assembly, insert } from 'fluidcad/core';
import { leftCase } from './linke-gehaeusehaelfte.part.js';
import { magnetverbinderLinks } from './magnetverbinder-links.part.js';
import { schalterLinks } from './schalter-links.part.js';

// Linke Hälfte: Unterschale, Schalter mit Kappen und Socket, Magnetverbinder-Platine in
// Einbaulage. Alle Teile stehen im KiCad-Rahmen der linken Hälfte, die Hauptplatine liegt
// bei z = 0 … platinenstaerke. Die Höhenlage der Unterschale dazu ist noch nicht festgelegt:
// ihr Boden überschneidet sich deshalb mit allem unterhalb der Platine.
export const linkeHaelfte = assembly('Molekula · linke Hälfte', () => {
  insert(leftCase).grounded().name('Unterschale links');
  insert(magnetverbinderLinks).grounded().name('Magnetverbinder links');
  insert(schalterLinks).grounded().name('Schalter links');
});
