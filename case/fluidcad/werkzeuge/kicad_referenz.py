#!/usr/bin/env python3
"""Erzeugt ../pcb-referenz.js aus pcb/pcb.kicad_pcb.

Aufruf aus dem Repo-Wurzelverzeichnis:

    python3 case/fluidcad/werkzeuge/kicad_referenz.py

Das Skript liest Edge.Cuts, Bohrungen und Footprint-Lagen direkt aus der
KiCad-Datei. Es trennt das ausgelieferte Panel an den Stegen in seine fünf
Platinenteile und prüft dabei, ob jeder Steg genau an den erwarteten Kanten
sitzt. Weicht die Platine ab, bricht es mit einer Meldung ab, statt still eine
falsche Referenz zu schreiben.

Koordinaten in der Ausgabe: Millimeter, Ursprung auf der Mittelachse an der
Oberkante des Panels (KiCad 199.92 / 36.99), X nach rechts, Y nach oben.
"""

import json
import math
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
QUELLE = REPO / 'pcb' / 'pcb.kicad_pcb'
ZIEL = Path(__file__).resolve().parents[1] / 'pcb-referenz.js'

URSPRUNG = (199.92, 36.99)
RUNDEN = 6

# Stege des Panels in KiCad-Koordinaten: x0, x1, y0, y1.
# Zwei gegenüberliegende Seiten liegen auf der vorhandenen Kontur, die anderen
# beiden sind die Trennkanten. Getrennt wird bündig an beiden Teilen.
STEGE = {
    'links-verbinder-aussen': (95.92, 97.92, 94.99, 97.99),
    'links-verbinder-innen': (114.92, 116.92, 88.99, 97.99),
    'links-mitte-oben': (185.42, 188.42, 57.99, 59.99),
    'links-mitte-unten': (185.42, 188.42, 82.99, 84.99),
    'rechts-mitte-oben': (211.42, 214.42, 57.99, 59.99),
    'rechts-mitte-unten': (211.42, 214.42, 82.99, 84.99),
    'rechts-verbinder-innen': (284.42, 286.42, 88.99, 97.99),
    'rechts-verbinder-aussen': (301.92, 303.92, 94.99, 97.99),
}

TEILE = {
    # Name: Punkt, der eindeutig im Teil liegt (KiCad-Koordinaten).
    'links': ('Linke Hälfte', (90.42, 54.99)),
    'verbinderLinks': ('Magnetverbinder links', (90.0, 101.89)),
    'mitte': ('MCU-Mittelteil', (199.92, 48.99)),
    'verbinderRechts': ('Magnetverbinder rechts', (310.0, 101.89)),
    'rechts': ('Rechte Hälfte', (309.42, 54.99)),
}


def parse(text):
    stack = [[]]
    for m in re.finditer(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()]+', text):
        t = m.group(0)
        if t == '(':
            stack.append([])
        elif t == ')':
            node = stack.pop()
            stack[-1].append(node)
        else:
            stack[-1].append(t[1:-1] if t.startswith('"') else t)
    return stack[0][0]


def kids(node, name):
    return [c for c in node if isinstance(c, list) and c and c[0] == name]


def kid(node, name):
    found = kids(node, name)
    return found[0] if found else None


def pt(node):
    # KiCad speichert teils 318.919999 statt 318.92. Auf 0,1 µm runden.
    return (round(float(node[1]), 4), round(float(node[2]), 4))


def key(p):
    return (round(p[0], 3), round(p[1], 3))


def fail(msg):
    sys.exit(f'kicad_referenz: {msg}')


def lese_kanten(board):
    kanten = []
    for n in board:
        if not (isinstance(n, list) and n[0] in ('gr_line', 'gr_arc')):
            continue
        layer = kid(n, 'layer')
        if not layer or layer[1] != 'Edge.Cuts':
            continue
        k = {'start': pt(kid(n, 'start')), 'end': pt(kid(n, 'end'))}
        if n[0] == 'gr_arc':
            k['mid'] = pt(kid(n, 'mid'))
        kanten.append(k)
    return kanten


def entferne_stege(kanten):
    for name, (x0, x1, y0, y1) in STEGE.items():
        ecken = {key(p) for p in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))}
        seiten = [i for i, k in enumerate(kanten)
                  if 'mid' not in k and {key(k['start']), key(k['end'])} <= ecken]
        if len(seiten) != 2:
            fail(f'Steg {name}: {len(seiten)} statt 2 Konturkanten gefunden')
        a, b = (kanten[i] for i in seiten)
        horizontal = a['start'][1] == a['end'][1]
        for i in sorted(seiten, reverse=True):
            kanten.pop(i)
        if horizontal:
            kanten.append({'start': (x0, y0), 'end': (x0, y1)})
            kanten.append({'start': (x1, y0), 'end': (x1, y1)})
        else:
            kanten.append({'start': (x0, y0), 'end': (x1, y0)})
            kanten.append({'start': (x0, y1), 'end': (x1, y1)})
    return kanten


def verkette(kanten):
    offen = list(kanten)
    schleifen = []
    while offen:
        erste = offen.pop(0)
        schleife = [erste]
        ende = key(erste['end'])
        while ende != key(erste['start']):
            for i, k in enumerate(offen):
                if key(k['start']) == ende:
                    break
                if key(k['end']) == ende:
                    k = dict(k, start=k['end'], end=k['start'])
                    break
            else:
                fail(f'Kontur bei {ende} nicht geschlossen')
            offen.pop(i)
            schleife.append(k)
            ende = key(k['end'])
        schleifen.append(schleife)
    return schleifen


def flaeche(schleife):
    s = 0.0
    for (ax, ay), (bx, by) in sehnen(schleife):
        s += ax * by - bx * ay
    return s / 2


def sehnen(schleife):
    """Kanten als Sehnen, Bögen über ihren Mittelpunkt in zwei Sehnen geteilt."""
    for k in schleife:
        if 'mid' in k:
            yield k['start'], k['mid']
            yield k['mid'], k['end']
        else:
            yield k['start'], k['end']


def enthaelt(schleife, p):
    """Punkt-in-Polygon über die Sehnen. Reicht für Prüfpunkte, die nicht direkt am Rand liegen."""
    x, y = p
    innen = False
    for (ax, ay), (bx, by) in sehnen(schleife):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            innen = not innen
    return innen


def lokal(p):
    return [round(p[0] - URSPRUNG[0], RUNDEN), round(URSPRUNG[1] - p[1], RUNDEN)]


def als_schritte(schleife):
    # Gegen den Uhrzeigersinn in lokalen Koordinaten (Y gespiegelt).
    if flaeche(schleife) > 0:
        schleife = [dict(k, start=k['end'], end=k['start']) for k in reversed(schleife)]
    schritte = []
    for k in schleife:
        s = lokal(k['end'])
        if 'mid' in k:
            s += lokal(k['mid'])
        schritte.append(s)
    return lokal(schleife[0]['start']), schritte


def footprints(board):
    for f in kids(board, 'footprint'):
        at = kid(f, 'at')
        props = {p[1]: p[2] for p in kids(f, 'property')}
        modelle = []
        for m in kids(f, 'model'):
            if 'hide' in m:
                continue
            modelle.append({
                'datei': m[1].split('/')[-1],
                'versatz': [float(v) for v in kid(kid(m, 'offset'), 'xyz')[1:4]],
                'drehung': [float(v) for v in kid(kid(m, 'rotate'), 'xyz')[1:4]],
            })
        yield {
            'ref': props.get('Reference'),
            'wert': props.get('Value'),
            'footprint': f[1].split(':')[-1],
            'kicad': [float(at[1]), float(at[2])],
            'drehung': float(at[3]) if len(at) > 3 else 0.0,
            'seite': 'unten' if kid(f, 'layer')[1] == 'B.Cu' else 'oben',
            'pads': kids(f, 'pad'),
            'modelle': modelle,
        }


def main():
    board = parse(QUELLE.read_text())
    staerke = float(kid(kid(board, 'general'), 'thickness')[1])
    schleifen = verkette(entferne_stege(lese_kanten(board)))
    if len(schleifen) != len(TEILE):
        fail(f'{len(schleifen)} Platinenteile statt {len(TEILE)} nach dem Trennen')

    teile = {}
    for name, (titel, probe) in TEILE.items():
        treffer = [s for s in schleifen if enthaelt(s, probe)]
        if len(treffer) != 1:
            fail(f'Teil {name}: Prüfpunkt liegt in {len(treffer)} Konturen')
        start, schritte = als_schritte(treffer[0])
        teile[name] = {'titel': titel, 'start': start, 'schritte': schritte, '_kontur': treffer[0]}

    def teil_von(p):
        for name, t in teile.items():
            if enthaelt(t['_kontur'], p):
                return name
        fail(f'Footprint bei {p} liegt auf keinem Platinenteil')

    bohrungen, schalter, bauteile = [], [], []
    for f in footprints(board):
        teil = teil_von(f['kicad'])
        if f['footprint'].startswith('Hole_'):
            pad = f['pads'][0]
            bohrungen.append({'ref': f['ref'], 'teil': teil, 'mitte': lokal(f['kicad']),
                              'bohrung': float(kid(pad, 'drill')[1]),
                              'pad': float(kid(pad, 'size')[1])})
        elif f['footprint'].startswith('Switch_'):
            schalter.append({'ref': f['ref'], 'teil': teil, 'mitte': lokal(f['kicad']),
                             'drehung': f['drehung'], 'footprint': f['footprint']})
        elif not f['ref'].startswith('D'):
            bauteile.append({'ref': f['ref'], 'wert': f['wert'], 'teil': teil,
                             'mitte': lokal(f['kicad']), 'drehung': f['drehung'],
                             'seite': f['seite'], 'footprint': f['footprint'],
                             'modelle': f['modelle']})

    for t in teile.values():
        del t['_kontur']
    stege = {n: {'von': lokal((x0, y1)), 'bis': lokal((x1, y0))}
             for n, (x0, x1, y0, y1) in STEGE.items()}
    sortiert = lambda xs: sorted(xs, key=lambda x: (len(x['ref']), x['ref']))

    def js(name, wert, kommentar):
        return f'// {kommentar}\nexport const {name} = {json.dumps(wert, ensure_ascii=False)};\n'

    ZIEL.write_text(
        '// Automatisch erzeugt von werkzeuge/kicad_referenz.py aus pcb/pcb.kicad_pcb.\n'
        '// Nicht von Hand ändern: Skript erneut ausführen und den Diff prüfen.\n'
        f'// Koordinaten in mm. Ursprung KiCad {URSPRUNG[0]} / {URSPRUNG[1]}, X nach rechts, Y nach oben.\n\n'
        + js('platinenstaerke', staerke, 'Platinenstärke laut Board-Setup.')
        + js('teile', teile, 'Konturen der getrennten Platinenteile. Schritt: [x, y] oder [x, y, mitteX, mitteY] für Bögen.')
        + js('stege', stege, 'Entfernte Stege des Panels als Rechteck (von = links unten, bis = rechts oben).')
        + js('bohrungen', sortiert(bohrungen), 'Befestigungsbohrungen für M2-Einpressmuttern, Durchmesser in mm.')
        + js('schalter', sortiert(schalter), 'Schalterpositionen, Drehung in Grad gegen den Uhrzeigersinn.')
        + js('bauteile', sortiert(bauteile), 'Weitere Bauteile mit ihren verlinkten 3D-Modellen aus zzeneg/zzkeeb.')
    )
    for name, t in teile.items():
        print(f'{name:16} {len(t["schritte"]):3} Kanten')
    print(f'{len(bohrungen)} Bohrungen, {len(schalter)} Schalter, {len(bauteile)} Bauteile -> {ZIEL.relative_to(REPO)}')


if __name__ == '__main__':
    main()
