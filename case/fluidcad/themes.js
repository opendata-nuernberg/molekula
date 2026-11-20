// Colour themes for the keycaps and the encoder knob. tools/keycap-files.mjs writes one set
// of print files per theme; the parts use the Tunic theme as their defaults.
//
// - tunic: the look of the case. Beige caps like the shells, the index finger home caps
//   marked with a hexagon like the eyes on the middle cover, the thumb caps in the eye
//   colours, and the knob with a blue eye inlay.
// - grey: neutral. All caps and the knob in one grey, three dots on the home caps, a knob
//   without an eye.
export const THEMES = {
  tunic: {
    title: 'Tunic',
    caps: '#d8c9a3',
    thumbs: ['#3aa7e6', '#e5458f', '#8fcf3e'],
    mark: 'hexagon',
    knob: '#d8c9a3',
    eye: 'inlay',
    eyeColour: '#3aa7e6',
  },
  grey: {
    title: 'Neutral grey',
    caps: '#8d9093',
    thumbs: ['#8d9093'],
    mark: 'dots',
    knob: '#8d9093',
    eye: 'none',
    eyeColour: '#8d9093',
  },
};
