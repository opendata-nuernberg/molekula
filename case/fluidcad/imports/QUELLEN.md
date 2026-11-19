# Herkunft der Importe

FluidCAD legt hier beim Import einer STEP-Datei den Zwischenstand ab (`.brep`, Farben, Einheiten). `load('<name>')` liest diese Dateien.

| Import | Quelle |
| --- | --- |
| `choc-v1-mit-keycap` | `case/onshape/switch-mit-keycap.step`: Kailh Choc v1, Hotswap-Socket und eigene Tastenkappe, aus Onshape exportiert |
| `ec11-15f` | zzkeeb `kicad/models/EC11-THT-15F-black.step` |
| `helios-stiftleisten` | zzkeeb `kicad/models/splinky-headers.step` |
| `skqg-reset` | zzkeeb `kicad/models/Button_SW_SPST_SKQG_WithoutStem.STEP` |
| `ffc-12-horizontal` | zzkeeb `kicad/models/FPC-12.stp` |

Die zzkeeb-Modelle stammen aus <https://github.com/zzeneg/zzkeeb> und stehen unter der MIT-Lizenz des Projekts.

Neu importieren: Bei laufendem Editor die STEP-Datei per `POST /api/import-file` mit `{ fileName, data: <base64> }` schicken oder sie im Editor importieren. Der Name ohne Endung ist der Name für `load()`.
