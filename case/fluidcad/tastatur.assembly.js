import { assembly, configurations, insert, param } from 'fluidcad/core';
import { bestueckung } from './bestueckung.part.js';
import { oberschale } from './oberschale.part.js';
import { platinen } from './platinen.part.js';
import { unterschale } from './unterschale.part.js';

// Molekula ohne Magnetverbinder: ein durchgehendes Gehäuse aus Ober- und Unterschale,
// MCU und Encoder in der Mitte, Tenting der Hälften fest eingedruckt.
//
// Die Konfigurationen sind Startpunkte zum Ausprobieren. Im Panel „Assembly Parameters“
// lassen sich die Werte frei ändern und als neue Konfiguration speichern.
export const tastatur = assembly('Molekula · Tastatur', () => {
  configurations({
    Flach: { 'Tenting (°)': 0 },
    'Tenting 5°': { 'Tenting (°)': 5 },
    'Tenting 10°': { 'Tenting (°)': 10 },
    'Tenting 15°': { 'Tenting (°)': 15 },
    'Tenting 20°': { 'Tenting (°)': 20 },
    'Prüfung – Tenting 20°, Tasten gedrückt': { 'Tenting (°)': 20, 'Tasten gedrückt': true },
  });
  const werte = {
    'Tenting (°)': param('Tenting (°)', 0, 'number', { min: 0, max: 35, step: 1 }),
    'Kippachse innen (mm)': param('Kippachse innen (mm)', 0, 'number', { min: 0, max: 30, step: 0.5 }),
    'Kabelspalt (mm)': param('Kabelspalt (mm)', 3, 'number', { min: 1, max: 15, step: 0.5 }),
    'Bodenstärke (mm)': param('Bodenstärke (mm)', 1.6, 'number', { min: 1.2, max: 3, step: 0.1 }),
    'Raum unter den Platinen (mm)': param('Raum unter den Platinen (mm)', 2.5, 'number', { min: 2, max: 6, step: 0.1 }),
  };
  const zeigeOben = param('Oberschale zeigen', true, 'checkbox');
  const zeigeBestueckung = param('Bestückung zeigen', true, 'checkbox');
  const gedrueckt = param('Tasten gedrückt', false, 'checkbox');
  const detail = param('Detailmodelle (langsam)', false, 'checkbox');

  insert(unterschale, werte).grounded().name('Unterschale');
  insert(platinen, werte).grounded().name('Platinen');
  if (zeigeOben) insert(oberschale, werte).grounded().name('Oberschale').transparent(0.35);
  if (zeigeBestueckung) {
    insert(bestueckung, { ...werte, 'Tasten gedrückt': gedrueckt, 'Detailmodelle (langsam)': detail }).grounded().name('Bestückung');
  }
});
