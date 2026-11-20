# Keycaps

Sculpted Choc v1 keycaps for the minY grid of 19 × 16 mm. There are four profiles. All of them are built to print standing on one edge, with an integrated support under the stem, so the slicer needs no supports.

![The four profiles in print orientation: front, back, top face and side](../images/keycaps-profiles.png)

| File | Contents |
| --- | --- |
| [choc-sculpted.step](choc-sculpted.step) | The four profiles as separate solids (`choc_caps_print_ready`, every part named `cap_default_rounded`), lying side by side in print orientation |
| [choc-thumb.stl](choc-thumb.stl) | Not only the thumb cap: the same four profiles as a print cluster, one cap of each, turned outward, with their support frames meeting in the middle |

The print projects [keyboard_p1s.3mf](../case/keyboard_p1s.3mf) (Bambu P1S) and [keyboard_artisan.3mf](../case/keyboard_artisan.3mf) (Snapmaker Artisan) contain the same four meshes on several plates, singly, in grids and as clusters of four.

This page records the geometry measured from these files, as the basis for rebuilding the caps in CAD.

## Profiles

| Profile | Use | Volume | PLA | Top surface |
| --- | --- | --- | --- | --- |
| default | home row | 913 mm³ | 1.1 g | dished, level |
| home | home row, index finger | 914 mm³ | 1.1 g | like default, plus three homing dots |
| slope | top and bottom row | 1453 mm³ | 1.8 g | dished, tilted by about 14° |
| thumb | thumb keys | 1225 mm³ | 1.5 g | dished more deeply, tilted by about 11° |

The names come from the parts in `keyboard_artisan.3mf`. In `keyboard_p1s.3mf` the cluster of four is called `home_thumb_normal_edge`.

A full set for the 38 keys, assuming top and bottom row get the slope profile and the outer home-row key gets the default profile:

| Profile | Per half | Total |
| --- | --- | --- |
| slope | 10 | 20 |
| default | 5 | 10 |
| home | 1 | 2 |
| thumb | 3 | 6 |

Together that is about 47 cm³, or 59 g of PLA. The old 36-key set in `keyboard_p1s.3mf` (plates 7–9) has 20 slope, 9 default, 1 home and 6 thumb caps. The half set in `keyboard_artisan.3mf` has 11 slope caps instead of 10.

## Geometry

Key coordinates: X across the key (along the row), Y along the column, Z up. Z = 0 is the floor of the pocket on the underside of the cap. In print orientation, X stays, Z points sideways (to −Y in the files), and the key's Y becomes the print height: the cap stands on one of its Y edges, on the thick edge for slope and thumb.

### Body

- Footprint 18.3 × 15.3 mm (X × Y), corner radius 3.0 mm. That leaves a gap of 0.7 mm to the neighbours in both directions.
- Side walls are vertical. The top edge is rounded with a radius of about 2 mm all around.
- The cap is solid. The underside has a pocket 1.0 mm deep, so the rim reaches down to Z = −1.0.
  - The pocket walls are chamfered at 45° (about 1 mm wide), so they print without support when the cap stands on its edge.
  - The rim is about 1.7 mm wide at the Y edges and about 0.6 mm wide plus the chamfer at the X edges.

### Top surface

Heights above the pocket floor. "Edge" means 6 mm from the centre across X; outside that the surface rounds over into the side wall.

| Profile | Centre | 2 mm from the thick edge | 2 mm from the thin edge | Dish depth across X | Tilt along Y |
| --- | --- | --- | --- | --- | --- |
| default, home | 2.50 | 2.81 | 2.80 | 0.54 | none |
| slope | 4.51 | 6.17 | 3.41 | 0.53 | 14.1° |
| thumb | 3.50 | 4.85 | 2.76 | 0.79 | 10.8° |

- The dish is curved in both directions: across X about R 30 mm, along Y about R 45–50 mm (measured on default, depth 0.31 mm over ±5.65 mm).
- For slope and thumb the dish lies on a tilted plane. The thick edge stands on the print bed.
- Homing dots (home only): three domes on the centre line across X, at X = −2, 0 and +2 mm, Ø 1.2 mm at the base and 0.5 mm high.

### Stem (Choc v1)

- Two legs, 1.3 mm wide in X and 2.7 mm long in Y, centred at X = ±2.9 mm (5.8 mm apart) and in the middle of the cap in Y.
- They are 4.0 mm long from the pocket floor.
- Vertical edges are chamfered by 0.2 mm, and the tips by 0.15 mm.

### Integrated support

The cap prints standing on edge, so the underside of the stem legs overhangs by 4 mm. The integrated support carries it:

- **Wall:** 1.0 mm thick and 7.1 mm wide (covering both legs). It stands at 3–4 mm from the pocket floor and rises from the bed to the underside of the legs (6.3 mm print height). Its top edges are chamfered by 0.2 mm, so it touches the legs on a strip only 0.6 mm wide and breaks off cleanly.
- **Frame on the bed:** 0.4 mm high (two layers). It has two rails 1.0 mm wide at X = ±5.2…6.2 mm, running from the cap rim to 8 mm from the pocket floor. A cross bar joins them at the end, and a foot 12.4 mm wide sits under the wall. The frame ties the cap and the wall together so neither tips over.
- **Material:** about 55 mm³ per cap, around 4–6 % of the cap. That is far less than slicer supports for a cap printed upside down.

The legs therefore bridge only from the pocket floor to the wall, about 3.2 mm.

## Print settings used so far

Both projects use 0.12 mm layers (first layer 0.2 mm), 4 walls, 35 % infill, no brim and supports only where painted ("normal (manual)"), so the integrated support is the only one.

| Project | Filament |
| --- | --- |
| P1S | Translucent PETG in brown `#C9A381` and blue `#61B0FF`, matte black PLA for the test plates |
| Artisan | Matte black PLA |
