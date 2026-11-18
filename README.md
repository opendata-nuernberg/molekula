# Molekula · 38 Tasten

Molekula ist eine teilbare ergonomische Tastatur mit 19 Tasten pro Seite, einem minY-Raster von 19 × 16 mm und einem RP2040 Helios 16M. Dieser Fork von Molekula2 ergänzt je eine Position in der oberen Fingerreihe. Die beiden äußeren Tasten bleiben erhalten. Ein Encoder und der Anschluss für ein nice!view sind auf der Zentralplatine vorgesehen.

| Ordner | Inhalt |
| --- | --- |
| [pcb/](pcb/) | KiCad-Projekt, Schaltplan, Platine und Bibliothekstabellen für den 38-Tasten-Fork |
| [production/](production/) | Gerber- und Bohrdaten als Fertigungspaket sowie BOM und Platzierungsdaten für die SMD-Bestückung |
| [case/](case/) | Vorhandene 38-Tasten-Druckprojekte für Choc auf Artisan und P1S |
| [keycaps/](keycaps/) | Sculpted-Choc-Kappen und separates Daumenmodell |

## Platine und Fertigung

Öffne [`pcb/pcb.kicad_pro`](pcb/pcb.kicad_pro) in KiCad 9. Für Bibliothekszugriff und die referenzierten 3D-Modelle muss `ZZKEEB` auf eine lokale Bibliothek mit `zzkeeb.pretty`, `zzkeeb.kicad_sym` und `models/` zeigen. Die Bibliothek liegt außerhalb dieses Repos.

Das [Fertigungspaket](production/pcb.zip) enthält die Paneldaten für beide Tastenplatinen, die Zentralplatine und zwei Magnetverbinderplatinen. Die fünf Platinen werden für die Montage getrennt. [BOM](production/bom.csv) und [Positionen](production/positions.csv) liegen zusätzlich als CSV vor. Die BOM deckt die SMD-Bestückung mit Dioden und FFC-Buchsen ab. Schalter, Hotswap-Sockel, MCU und Gehäuseteile sind separat zu beschaffen. Bei Änderungen am KiCad-Projekt die Fertigungsdaten gemeinsam aktualisieren.

## Gehäuse und Firmware

Die [Artisan](case/keyboard_artisan.3mf)- und [P1S](case/keyboard_p1s.3mf)-Projekte enthalten Gehäuse-Oberteile mit 19 Schalteröffnungen je Seite. Die [mechanische Referenz](DESIGN.md) beschreibt, wie aus dem Fork-Board das schlankere FluidCAD-Gehäuse abgeleitet und geprüft werden kann.

Ein Firmware-Build für Helios und die 38er-Matrix ist in diesem Repo nicht enthalten. Vor dem Flashen müssen Controller, Pinbelegung und beide zusätzlichen Positionen mit dem [Schaltplan](pcb/pcb.kicad_sch) abgeglichen sein.

## Herkunft

Dieses Projekt basiert auf [Molekula von Evgenii Vilkov (zzeneg)](https://github.com/zzeneg/molekula). Es steht unter der [MIT-Lizenz](LICENSE). Die früheren Gehäuse-, Bild- und Vergleichsdateien sind in der Git-Historie unter dem Ausgangsstand `78ca099` auffindbar.
