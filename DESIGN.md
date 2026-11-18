# Mechanische Referenz für FluidCAD

Die Geometrie für unsere Molekula kommt aus [pcb.kicad_pcb](pcb/pcb.kicad_pcb). Das ursprüngliche Molekula2 hatte 36 Tasten. Der Fork setzt `SW1` und `SW23` in die obere Reihe und belegt die äußeren Positionen mit `SW39` und `SW40`. Die alte Gehäuseserie gehört zum 36er-Layout. In beiden [3MF-Druckprojekten](case/) wurden die 19 Öffnungen je Seite mit dem 38er-Board in XY abgeglichen. Die Passung der vollständigen Baugruppe in Z wurde dabei nicht geprüft.

## Bezugspunkte

Alle Maße in Millimetern. Die Tabelle verwendet den KiCad-Bohrursprung `(199,92 | 36,99)`, X nach rechts und Y nach oben. Die Koordinaten beziehen sich auf das Fertigungspanel.

| Merkmal | Referenz |
| --- | --- |
| Platine | 1,60 mm dick. Äußere Panelkontur 276,50 × 87,23 mm. `Edge.Cuts` enthält 98 Geraden, 37 Bögen und zwei Kreise. |
| Fingerpositionen | Fünf Spalten je Seite bei `abs(X) = 33,5 / 52,5 / 71,5 / 90,5 / 109,5`. Von innen nach außen beginnt die obere Reihe bei `Y = −16 / −14 / −8 / −12 / −18`. Die zwei folgenden Reihen liegen jeweils 16 mm tiefer. `SW39/40` liegen bei `(±128,50 \| −34,00)`. |
| Daumenpositionen | Links `SW16–18` bei `(−56,50 \| −70,00)`, `(−36,30 \| −71,80)`, `(−16,70 \| −77,00)` mit 0°, −10°, −20°. Rechts liegen `SW34–36` spiegelbildlich mit entgegengesetzten Winkeln. |
| Befestigung | Sieben metallisierte Ø-2,65-mm-Bohrungen für M2-Lötmuttern. `H1/H2` bei `(+115 \| −64,90)` und `(+74 \| −64,90)`, `H3/H4` spiegelbildlich links. `H5/H6` bei `(±14,50 \| −3,00)`, `H7` bei `(0 \| −67,50)`. |
| Zentrale | Reset `SW37` bei `(0 \| −12,00)`, Encoder `SW38` bei `(0 \| −57,50)`, Helios `J13` und nice!view `J6`. |

## Aufbau in FluidCAD

1. Board-Revision und Bohrursprung mitführen. Die geschlossenen Konturen aus `Edge.Cuts` mit Geraden, Kreisbögen und Ausschnitten übernehmen. Für die beiden Seiten, die Zentrale und beide Magnetverbinder die getrennten Konturen einschließlich verbleibender Abbruchstege am realen Panel prüfen. Lage und Orientierung jeder Platine in der montierten Baugruppe festhalten.
2. Aus derselben Board-Datei mit `kicad-cli pcb export step --board-only --drill-origin` einen STEP zum Gegenprüfen erzeugen. Schalterachsen und Befestigungspunkte aus den Footprints übernehmen. Die STEP-Referenz und die Skizzen an den sieben H-Punkten, den versetzten Daumenpositionen und einer asymmetrischen Verbinderöffnung vergleichen.
3. PCB-Spiel, Plattenstärke, Auflagehöhe, Wandstärke und Bodenabstand als Gehäuseparameter behandeln. Im Gehäuse die tatsächlichen Hüllmaße von Helios, Headern und USB-Stecker, Hotswap-Sockeln und Lötstellen, Encoder und Knopf, FFC-Steckern und Kabelbögen sowie Magnetverbindern berücksichtigen. Reset-Zugang, Schrauben und Werkzeugwege prüfen. nice!view und die Akku-/JST-Option brauchen bei Bestückung eigene Freiräume.
4. Vor der Freigabe Tastenkappen bei vollem Hub, Einsetzen und Entnehmen der Schalter, Kabelmontage und die Lage der getrennten Platinen prüfen. Die 32 Fingerpositionen haben MX/KS/Choc-Footprints, die sechs Daumenpositionen KS/Choc-Footprints. Für den ersten Gehäusestand die genaue Schalter-, Sockel- und Kappenkombination festlegen. Der Helios-Footprint verweist noch auf ein Splinky-3D-Modell. Für den USB-Ausschnitt die tatsächliche Helios-Baugruppe vermessen.

## Welche Dateien gehören zum Fork?

`pcb/` enthält die bearbeitbaren elektrischen Quellen, `production/` die zugehörigen Fertigungsexporte. Gehäusequellen und Druckexporte gehören zusammen nach `case/`, sobald der FluidCAD-Entwurf vorliegt. Bilder für die Projektseite sollen die aufgebaute 38-Tasten-Version zeigen. Für alternative Upstream-Platinen und veraltete Druckstände dient die Git-Historie als Referenz.
