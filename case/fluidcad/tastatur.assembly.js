import { assembly, configurations, insert, param } from 'fluidcad/core';
import { bestueckung } from './bestueckung.part.js';
import { oberschale } from './oberschale.part.js';
import { platinen } from './platinen.part.js';
import { unterschale } from './unterschale.part.js';

// Molekula ohne Magnetverbinder: ein durchgehendes Gehäuse aus Ober- und Unterschale,
// MCU und Encoder in der Mitte, Tenting der Hälften fest eingedruckt.
//
// Tenting wird über die Keildicke in der Mitte eingestellt: so viel liegen Mitte und
// Innenkanten höher als bei der flachen Tastatur, die Außenkanten stehen auf dem Tisch.
// Der Winkel folgt daraus (15 mm ≈ 6,8°), gekippt wird nur von außen nach innen.
//
// Die Konfigurationen sind Startpunkte zum Ausprobieren. Im Panel „Assembly Parameters“
// lassen sich die Werte frei ändern und als neue Konfiguration speichern.
export const tastatur = assembly('Molekula · Tastatur', () => {
  configurations({
    Flach: { 'Keildicke Mitte (mm)': 0 },
    'Keil 10 mm': { 'Keildicke Mitte (mm)': 10 },
    'Keil 15 mm': { 'Keildicke Mitte (mm)': 15 },
    'Keil 20 mm': { 'Keildicke Mitte (mm)': 20 },
    'Keil 25 mm': { 'Keildicke Mitte (mm)': 25 },
    'Prüfung – Keil 25 mm, Tasten gedrückt': { 'Keildicke Mitte (mm)': 25, 'Tasten gedrückt': true },
  });
  const werte = {
    'Keildicke Mitte (mm)': param('Keildicke Mitte (mm)', 15, 'number', { min: 0, max: 40, step: 0.5 }),
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
