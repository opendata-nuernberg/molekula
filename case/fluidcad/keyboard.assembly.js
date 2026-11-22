import { assembly, configurations, insert, param } from 'fluidcad/core';
import { bottomShell } from './bottom-shell.part.js';
import { components } from './components.part.js';
import { encoderKnob } from './encoder-knob.part.js';
import { pcbs } from './pcbs.part.js';
import { topShell } from './top-shell.part.js';

// Molekula without magnetic connectors: one continuous case made of a top and a bottom
// shell, MCU and encoder in the middle, tenting of the halves printed in.
//
// Tenting is set by the wedge thickness at the middle: the middle and the inner edges sit
// that much higher than on the flat keyboard, the outer edges stand on the desk. The angle
// follows from it (15 mm ≈ 6.8°); the tilt runs from the outside in only. The splay turns
// each half about the top of its inner edge (12° per half by default, the old Molekula with
// magnetic connectors had 18°).
//
// The configurations are starting points for experiments. The "Assembly Parameters" panel
// lets you change the values freely and save them as a new configuration.
export const keyboard = assembly('Molekula · Keyboard', () => {
  configurations({
    Flat: { 'Center wedge thickness (mm)': 0 },
    'Wedge 10 mm': { 'Center wedge thickness (mm)': 10 },
    'Wedge 15 mm': { 'Center wedge thickness (mm)': 15 },
    'Wedge 20 mm': { 'Center wedge thickness (mm)': 20 },
    'Wedge 25 mm': { 'Center wedge thickness (mm)': 25 },
    'Check – wedge 25 mm, keys pressed': { 'Center wedge thickness (mm)': 25, 'Keys pressed': true },
  });
  const values = {
    'Center wedge thickness (mm)': param('Center wedge thickness (mm)', 15, 'number', { min: 0, max: 40, step: 0.5 }),
    'Pivot offset inward (mm)': param('Pivot offset inward (mm)', 0, 'number', { min: 0, max: 30, step: 0.5 }),
    'Splay per half (°)': param('Splay per half (°)', 12, 'number', { min: 0, max: 25, step: 0.5 }),
    'Cable gap (mm)': param('Cable gap (mm)', 3, 'number', { min: 1, max: 15, step: 0.5 }),
    'Floor thickness (mm)': param('Floor thickness (mm)', 1.6, 'number', { min: 1.2, max: 3, step: 0.1 }),
    'Space under the boards (mm)': param('Space under the boards (mm)', 2.5, 'number', { min: 2, max: 6, step: 0.1 }),
  };
  const showTop = param('Show top shell', true, 'checkbox');
  const showComponents = param('Show components', true, 'checkbox');
  const pressed = param('Keys pressed', false, 'checkbox');
  const detailed = param('Detailed models (slow)', false, 'checkbox');

  insert(bottomShell, values).grounded().name('Bottom shell');
  insert(pcbs, values).grounded().name('PCBs');
  if (showTop) {
    insert(topShell, values).grounded().name('Top shell').transparent(0.35);
    insert(encoderKnob, values).grounded().name('Encoder knob');
  }
  if (showComponents) {
    insert(components, { ...values, 'Keys pressed': pressed, 'Detailed models (slow)': detailed }).grounded().name('Components');
  }
});
