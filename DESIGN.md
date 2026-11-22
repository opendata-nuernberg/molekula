# Mechanical reference for FluidCAD

The geometry for this Molekula comes from [pcb.kicad_pcb](pcb/pcb.kicad_pcb). The original Molekula2 had 36 keys. The fork moves `SW1` and `SW23` into the top row and uses `SW39` and `SW40` for the outer positions. The old case series belongs to the 36-key layout. In both [3MF print projects](case/) the 19 openings per side were matched to the 38-key board in XY. The fit of the complete assembly in Z was not checked.

## Reference points

All dimensions in millimetres. The table uses the KiCad drill origin `(199.92 | 36.99)`, X to the right and Y up. Coordinates refer to the manufacturing panel.

| Feature | Reference |
| --- | --- |
| Board | 1.60 mm thick. Outer panel outline 276.50 × 87.23 mm. `Edge.Cuts` contains 98 lines, 37 arcs and two circles. |
| Finger positions | Five columns per side at `abs(X) = 33.5 / 52.5 / 71.5 / 90.5 / 109.5`. From the inside out, the top row starts at `Y = −16 / −14 / −8 / −12 / −18`. The two following rows are 16 mm lower each. `SW39/40` sit at `(±128.50 \| −34.00)`. |
| Thumb positions | Left `SW16–18` at `(−56.50 \| −70.00)`, `(−36.30 \| −71.80)`, `(−16.70 \| −77.00)` with 0°, −10°, −20°. On the right, `SW34–36` are mirrored with opposite angles. |
| Mounting | Seven plated Ø 2.65 mm holes for M2 solder nuts. `H1/H2` at `(+115 \| −64.90)` and `(+74 \| −64.90)`, `H3/H4` mirrored on the left. `H5/H6` at `(±14.50 \| −3.00)`, `H7` at `(0 \| −67.50)`. |
| Centre | Reset `SW37` at `(0 \| −12.00)`, encoder `SW38` at `(0 \| −57.50)`, Helios `J13` and nice!view `J6`. |

## Building in FluidCAD

1. Keep track of the board revision and the drill origin. Take over the closed outlines from `Edge.Cuts` with lines, arcs and cut-outs. For both halves, the centre and both magnetic connectors, check the separated outlines including remaining breakaway tabs against the real panel. Record position and orientation of every board in the mounted assembly. [`tools/kicad_reference.py`](case/fluidcad/tools/kicad_reference.py) does this and writes [`pcb-reference.js`](case/fluidcad/pcb-reference.js).
2. Generate a STEP for cross-checking from the same board file with `kicad-cli pcb export step --board-only --drill-origin`. Take switch axes and mounting points from the footprints. Compare the STEP reference and the sketches at the seven H points, the offset thumb positions and one asymmetric connector opening.
3. Treat PCB clearance, plate thickness, ledge height, wall thickness and floor clearance as case parameters. In the case, account for the real envelopes of Helios, headers and USB plug, hotswap sockets and solder joints, encoder and knob, FFC connectors and cable bends, and magnetic connectors. Check reset access, screws and tool paths. nice!view and the battery/JST option need their own clearances when populated.
4. Before release, check keycaps at full travel, inserting and removing the switches, cable assembly and the position of the separated boards. The 32 finger positions have MX/KS/Choc footprints, the six thumb positions KS/Choc footprints. The current case uses Kailh Choc v1 with hotswap sockets and custom keycaps. The Helios footprint still refers to a Splinky 3D model; measure the real Helios assembly for the USB cut-out.

## Which files belong to the fork?

`pcb/` holds the editable electrical sources, `production/` the matching manufacturing exports. Case sources and print exports belong together in `case/`: the split case with magnetic connectors as Onshape STEP and 3MF print projects, and the unibody case as the FluidCAD model in `case/fluidcad/`. Images for the project page should show the built 38-key version. For alternative upstream boards and outdated print versions, the Git history serves as reference.
