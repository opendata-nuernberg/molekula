// Automatisch erzeugt von werkzeuge/huellen.mjs aus den FluidCAD-Importen (imports/*.brep).
// Nicht von Hand ändern: Skript erneut ausführen und den Diff prüfen.
// Gestufte Hüllquader der Bauteile im Modellrahmen des Imports, mm.
// Jede Stufe: z = [unten, oben], min/max = Rechteck in XY. Mit rundAb: Stufen ab dieser Höhe sind
// Zylinder um die Rechteckmitte (Durchmesser = größere Seite). Toleranz 0.5 mm, Scheiben 0.1 mm, Stufen mindestens 0.5 mm hoch.

export const huellen = {
 "schalter": {
  "titel": "Choc v1 mit Stößel",
  "import": "choc-v1-mit-keycap",
  "stufen": [
   {
    "z": [
     -3,
     0
    ],
    "min": [
     -6.4,
     -6.08
    ],
    "max": [
     6.4,
     1.6
    ]
   },
   {
    "z": [
     0,
     2.21
    ],
    "min": [
     -7.25,
     -6.9
    ],
    "max": [
     7.25,
     6.9
    ]
   },
   {
    "z": [
     2.2,
     3.11
    ],
    "min": [
     -7.5,
     -7.5
    ],
    "max": [
     7.5,
     7.5
    ]
   },
   {
    "z": [
     3.1,
     4.91
    ],
    "min": [
     -6.9,
     -6.9
    ],
    "max": [
     6.9,
     6.9
    ]
   },
   {
    "z": [
     4.9,
     5.6
    ],
    "min": [
     -6.4,
     -6.4
    ],
    "max": [
     6.4,
     6.4
    ]
   },
   {
    "z": [
     5.6,
     8.1
    ],
    "min": [
     -5.32,
     -3.42
    ],
    "max": [
     5.32,
     2.42
    ]
   }
  ]
 },
 "kappe": {
  "titel": "Tastenkappe",
  "import": "choc-v1-mit-keycap",
  "stufen": [
   {
    "z": [
     4.09,
     7.1
    ],
    "min": [
     -3.55,
     -1.48
    ],
    "max": [
     3.56,
     1.23
    ]
   },
   {
    "z": [
     7.1,
     10.8
    ],
    "min": [
     -9.15,
     -7.78
    ],
    "max": [
     9.16,
     7.53
    ]
   },
   {
    "z": [
     10.8,
     11.47
    ],
    "min": [
     -8.63,
     -7.2
    ],
    "max": [
     8.63,
     6.94
    ]
   }
  ]
 },
 "sockel": {
  "titel": "Hotswap-Socket",
  "import": "choc-v1-mit-keycap",
  "stufen": [
   {
    "z": [
     -3.74,
     -1.83
    ],
    "min": [
     -8.95,
     -8.21
    ],
    "max": [
     3.95,
     -1.35
    ]
   },
   {
    "z": [
     -1.84,
     -0.64
    ],
    "min": [
     -8.95,
     -7.35
    ],
    "max": [
     3.95,
     -2.25
    ]
   }
  ]
 },
 "encoder": {
  "titel": "EC11 mit 15-mm-Welle",
  "import": "ec11-15f",
  "rundAb": 4.5,
  "stufen": [
   {
    "z": [
     -3.5,
     1.31
    ],
    "min": [
     -6.2,
     -7.7
    ],
    "max": [
     6.2,
     7.2
    ]
   },
   {
    "z": [
     1.3,
     4.6
    ],
    "min": [
     -5.95,
     -6.3
    ],
    "max": [
     5.95,
     6
    ]
   },
   {
    "z": [
     4.59,
     9.61
    ],
    "min": [
     -3.5,
     -3.5
    ],
    "max": [
     3.5,
     3.5
    ]
   },
   {
    "z": [
     9.6,
     19
    ],
    "min": [
     -3,
     -3
    ],
    "max": [
     3,
     3
    ]
   },
   {
    "z": [
     19,
     19.5
    ],
    "min": [
     -2.5,
     -2.5
    ],
    "max": [
     2.5,
     2.44
    ]
   }
  ]
 },
 "helios": {
  "titel": "Helios auf Stiftleisten",
  "import": "helios-stiftleisten",
  "stufen": [
   {
    "z": [
     0,
     3.3
    ],
    "min": [
     -8.9,
     -29.15
    ],
    "max": [
     8.89,
     4.65
    ]
   },
   {
    "z": [
     3.3,
     4.2
    ],
    "min": [
     -8.9,
     -29.15
    ],
    "max": [
     8.89,
     3.88
    ]
   },
   {
    "z": [
     4.2,
     8.68
    ],
    "min": [
     -8.32,
     -28.57
    ],
    "max": [
     8.32,
     3.31
    ]
   }
  ]
 },
 "reset": {
  "titel": "Reset-Taster SKQG",
  "import": "skqg-reset",
  "stufen": [
   {
    "z": [
     -0.01,
     0.8
    ],
    "min": [
     -3.2,
     -2.61
    ],
    "max": [
     3.2,
     2.61
    ]
   },
   {
    "z": [
     0.79,
     1.51
    ],
    "min": [
     -2.46,
     -2.02
    ],
    "max": [
     2.46,
     2.46
    ]
   }
  ]
 },
 "ffc": {
  "titel": "FFC-Buchse 12-polig",
  "import": "ffc-12-horizontal",
  "stufen": [
   {
    "z": [
     -0.01,
     0.5
    ],
    "min": [
     -2.3,
     -5.25
    ],
    "max": [
     7.8,
     0.05
    ]
   },
   {
    "z": [
     0.49,
     2.11
    ],
    "min": [
     -2.4,
     -5.8
    ],
    "max": [
     7.9,
     -0.67
    ]
   }
  ]
 }
};
