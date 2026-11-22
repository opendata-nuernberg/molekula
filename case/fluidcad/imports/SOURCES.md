# Import sources

When a STEP file is imported, FluidCAD stores the intermediate result here (`.brep`, colours, units). `load('<name>')` reads these files.

| Import | Source |
| --- | --- |
| `choc-v1-with-keycap` | `case/onshape/switch-with-keycap.step`: Kailh Choc v1, hotswap socket and custom keycap, exported from Onshape |
| `ec11-15f` | zzkeeb `kicad/models/EC11-THT-15F-black.step` |
| `helios-headers` | zzkeeb `kicad/models/splinky-headers.step` |
| `skqg-reset` | zzkeeb `kicad/models/Button_SW_SPST_SKQG_WithoutStem.STEP` |
| `ffc-12-horizontal` | zzkeeb `kicad/models/FPC-12.stp` |

The zzkeeb models come from <https://github.com/zzeneg/zzkeeb> and are licensed under that project's MIT license.

To re-import: with the editor running, send the STEP file via `POST /api/import-file` with `{ fileName, data: <base64> }`, or import it in the editor. The name without extension is the name for `load()`.
