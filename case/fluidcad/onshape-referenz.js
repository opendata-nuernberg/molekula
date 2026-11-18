// Automatisch erzeugt von werkzeuge/onshape_referenz.mjs aus case/onshape/molekula.step.
// Nicht von Hand ändern: Skript erneut ausführen und den Diff prüfen.
// Koordinaten in mm im KiCad-Rahmen der jeweiligen Hälfte (wie pcb-referenz.js),
// Höhen z ab der Oberseite der Hauptplatine.

// Hauptplatine im Onshape-Modell: Oberseite (Bezug für alle Höhen) und Stärke.
export const onshapeHauptplatine = {"oberseite":0,"dicke":1.51};
// Lage der Hälften im Onshape-Modell: Onshape-XY = Drehung(drehung°) · KiCad-XY + verschiebung.
// Aus den Schalterausschnitten der Deckel eingepasst, rest = größte Abweichung in mm.
export const haelften = {"links":{"drehung":-36,"verschiebung":[-81.0141,31.4383],"rest":0},"rechts":{"drehung":0,"verschiebung":[-33.5,16],"rest":0}};
// Einbaulage der Magnetverbinder-Platinen im fertigen Gehäuse, je im Rahmen ihrer Hälfte.
// achsen: Bild der KiCad-Achsen der Platine. bohrungen: Mitte auf der Plattenmittelebene.
// huellen: Hüllquader in KiCad-Koordinaten der flachen Platine (z = 0 Unterseite).
export const verbinder = {"verbinderLinks":{"haelfte":"links","drehungZ":-72,"ursprung":[54.6182,-107.1313,-62.4],"achsen":{"x":[0.309,-0.9511,0],"y":[0,0,-1],"z":[0.9511,0.309,0]},"bohrungen":{"H4":[32.5118,-36.5059,2.5],"H3":[19.8421,2.4875,2.5]},"oberkante":6.4,"unterkante":-1.4,"nasenUnterkante":-2.4,"dickeOnshape":1.51,"huellen":{"ffc":{"onshape":"mag_con_left","min":[-89.85,-66.8,-4.61],"max":[-78.15,-63,-0.045],"seite":"unten","seiteKicad":"unten"},"magnet":{"onshape":"mag_left","min":[-112.45,-70.4,1.64],"max":[-82.55,-59.4,7.64],"seite":"oben","seiteKicad":"oben"},"gegenplatte":{"onshape":"pcb_mag_right","min":[-118.9,-68.8,13.245],"max":[-70.1,-60,14.755]}}},"verbinderRechts":{"haelfte":"rechts","drehungZ":72,"ursprung":[-52.2216,-107.91,-62.4],"achsen":{"x":[0.309,0.9511,0],"y":[0,0,-1],"z":[-0.9511,0.309,0]},"bohrungen":{"H1":[-17.4455,1.7087,2.5],"H2":[-30.1152,-37.2846,2.5]},"oberkante":6.4,"unterkante":-1.4,"nasenUnterkante":-2.4,"dickeOnshape":1.51,"huellen":{"ffc":{"onshape":"mag_con_right","min":[78.15,-66.8,-4.61],"max":[89.85,-63,-0.045],"seite":"unten","seiteKicad":"unten"},"magnet":{"onshape":"mag_right","min":[82.55,-70.4,1.66],"max":[112.45,-59.4,8.66],"seite":"oben","seiteKicad":"unten"},"gegenplatte":{"onshape":"mag_left","min":[70.1,-70.4,7.16],"max":[118.9,-59.4,14.755]}}}};
// MCU-Mittelteil im Onshape-Modell, eingepasst über H5–H7. Es sitzt dort in der rechten
// Hälfte: KiCad-XY der Hälfte = Drehung(drehung°) · KiCad-XY des Mittelteils + verschiebung.
export const mitte = {"haelfte":"rechts","drehung":-18,"verschiebung":[6.9243,8.3007],"rest":0};
