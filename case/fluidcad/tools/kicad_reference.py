#!/usr/bin/env python3
"""Generates ../pcb-reference.js from pcb/pcb.kicad_pcb.

Run from the repository root:

    python3 case/fluidcad/tools/kicad_reference.py

The script reads Edge.Cuts, mounting holes and footprint positions straight
from the KiCad file. It splits the shipped panel at its breakaway tabs into
its five boards and checks that every tab sits exactly on the expected edges.
If the board differs, it stops with a message instead of silently writing a
wrong reference.

Output coordinates: millimetres, origin on the centre line at the top edge of
the panel (KiCad 199.92 / 36.99), X to the right, Y up.
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / 'pcb' / 'pcb.kicad_pcb'
TARGET = Path(__file__).resolve().parents[1] / 'pcb-reference.js'

ORIGIN = (199.92, 36.99)
DIGITS = 6

# Breakaway tabs of the panel in KiCad coordinates: x0, x1, y0, y1.
# Two opposite sides lie on the existing outline, the other two are the
# separation edges. The boards are separated flush on both sides.
TABS = {
    'left-connector-outer': (95.92, 97.92, 94.99, 97.99),
    'left-connector-inner': (114.92, 116.92, 88.99, 97.99),
    'left-middle-top': (185.42, 188.42, 57.99, 59.99),
    'left-middle-bottom': (185.42, 188.42, 82.99, 84.99),
    'right-middle-top': (211.42, 214.42, 57.99, 59.99),
    'right-middle-bottom': (211.42, 214.42, 82.99, 84.99),
    'right-connector-inner': (284.42, 286.42, 88.99, 97.99),
    'right-connector-outer': (301.92, 303.92, 94.99, 97.99),
}

BOARDS = {
    # Name: title and a point that lies unambiguously on the board (KiCad coordinates).
    'left': ('Left half', (90.42, 54.99)),
    'connectorLeft': ('Magnetic connector left', (90.0, 101.89)),
    'middle': ('MCU middle board', (199.92, 48.99)),
    'connectorRight': ('Magnetic connector right', (310.0, 101.89)),
    'right': ('Right half', (309.42, 54.99)),
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
    # KiCad sometimes stores 318.919999 instead of 318.92. Round to 0.1 µm.
    return (round(float(node[1]), 4), round(float(node[2]), 4))


def key(p):
    return (round(p[0], 3), round(p[1], 3))


def fail(msg):
    sys.exit(f'kicad_reference: {msg}')


def read_edges(board):
    edges = []
    for n in board:
        if not (isinstance(n, list) and n[0] in ('gr_line', 'gr_arc')):
            continue
        layer = kid(n, 'layer')
        if not layer or layer[1] != 'Edge.Cuts':
            continue
        e = {'start': pt(kid(n, 'start')), 'end': pt(kid(n, 'end'))}
        if n[0] == 'gr_arc':
            e['mid'] = pt(kid(n, 'mid'))
        edges.append(e)
    return edges


def remove_tabs(edges):
    for name, (x0, x1, y0, y1) in TABS.items():
        corners = {key(p) for p in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))}
        sides = [i for i, e in enumerate(edges)
                 if 'mid' not in e and {key(e['start']), key(e['end'])} <= corners]
        if len(sides) != 2:
            fail(f'tab {name}: found {len(sides)} outline edges instead of 2')
        a, b = (edges[i] for i in sides)
        horizontal = a['start'][1] == a['end'][1]
        for i in sorted(sides, reverse=True):
            edges.pop(i)
        if horizontal:
            edges.append({'start': (x0, y0), 'end': (x0, y1)})
            edges.append({'start': (x1, y0), 'end': (x1, y1)})
        else:
            edges.append({'start': (x0, y0), 'end': (x1, y0)})
            edges.append({'start': (x0, y1), 'end': (x1, y1)})
    return edges


def chain(edges):
    remaining = list(edges)
    loops = []
    while remaining:
        first = remaining.pop(0)
        loop = [first]
        end = key(first['end'])
        while end != key(first['start']):
            for i, e in enumerate(remaining):
                if key(e['start']) == end:
                    break
                if key(e['end']) == end:
                    e = dict(e, start=e['end'], end=e['start'])
                    break
            else:
                fail(f'outline not closed at {end}')
            remaining.pop(i)
            loop.append(e)
            end = key(e['end'])
        loops.append(loop)
    return loops


def area(loop):
    s = 0.0
    for (ax, ay), (bx, by) in chords(loop):
        s += ax * by - bx * ay
    return s / 2


def chords(loop):
    """Edges as chords; arcs are split into two chords through their midpoint."""
    for e in loop:
        if 'mid' in e:
            yield e['start'], e['mid']
            yield e['mid'], e['end']
        else:
            yield e['start'], e['end']


def contains(loop, p):
    """Point in polygon over the chords. Good enough for probe points away from the edge."""
    x, y = p
    inside = False
    for (ax, ay), (bx, by) in chords(loop):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def local(p):
    return [round(p[0] - ORIGIN[0], DIGITS), round(ORIGIN[1] - p[1], DIGITS)]


def as_steps(loop):
    # Counter-clockwise in local coordinates (Y mirrored).
    if area(loop) > 0:
        loop = [dict(e, start=e['end'], end=e['start']) for e in reversed(loop)]
    steps = []
    for e in loop:
        s = local(e['end'])
        if 'mid' in e:
            s += local(e['mid'])
        steps.append(s)
    return local(loop[0]['start']), steps


def footprints(board):
    for f in kids(board, 'footprint'):
        at = kid(f, 'at')
        props = {p[1]: p[2] for p in kids(f, 'property')}
        models = []
        for m in kids(f, 'model'):
            if 'hide' in m:
                continue
            models.append({
                'file': m[1].split('/')[-1],
                'offset': [float(v) for v in kid(kid(m, 'offset'), 'xyz')[1:4]],
                'rotation': [float(v) for v in kid(kid(m, 'rotate'), 'xyz')[1:4]],
            })
        yield {
            'ref': props.get('Reference'),
            'value': props.get('Value'),
            'footprint': f[1].split(':')[-1],
            'kicad': [float(at[1]), float(at[2])],
            'rotation': float(at[3]) if len(at) > 3 else 0.0,
            'side': 'bottom' if kid(f, 'layer')[1] == 'B.Cu' else 'top',
            'pads': kids(f, 'pad'),
            'models': models,
        }


def main():
    board = parse(SOURCE.read_text())
    thickness = float(kid(kid(board, 'general'), 'thickness')[1])
    loops = chain(remove_tabs(read_edges(board)))
    if len(loops) != len(BOARDS):
        fail(f'{len(loops)} boards instead of {len(BOARDS)} after separating')

    boards = {}
    for name, (title, probe) in BOARDS.items():
        hits = [s for s in loops if contains(s, probe)]
        if len(hits) != 1:
            fail(f'board {name}: probe point lies in {len(hits)} outlines')
        start, steps = as_steps(hits[0])
        boards[name] = {'title': title, 'start': start, 'steps': steps, '_outline': hits[0]}

    def board_of(p):
        for name, b in boards.items():
            if contains(b['_outline'], p):
                return name
        fail(f'footprint at {p} is on no board')

    holes, switches, components = [], [], []
    for f in footprints(board):
        b = board_of(f['kicad'])
        if f['footprint'].startswith('Hole_'):
            pad = f['pads'][0]
            holes.append({'ref': f['ref'], 'board': b, 'center': local(f['kicad']),
                          'drill': float(kid(pad, 'drill')[1]),
                          'pad': float(kid(pad, 'size')[1])})
        elif f['footprint'].startswith('Switch_'):
            switches.append({'ref': f['ref'], 'board': b, 'center': local(f['kicad']),
                             'rotation': f['rotation'], 'footprint': f['footprint']})
        elif not f['ref'].startswith('D'):
            components.append({'ref': f['ref'], 'value': f['value'], 'board': b,
                               'center': local(f['kicad']), 'rotation': f['rotation'],
                               'side': f['side'], 'footprint': f['footprint'],
                               'models': f['models']})

    for b in boards.values():
        del b['_outline']
    tabs = {n: {'from': local((x0, y1)), 'to': local((x1, y0))}
            for n, (x0, x1, y0, y1) in TABS.items()}
    ordered = lambda xs: sorted(xs, key=lambda x: (len(x['ref']), x['ref']))

    def js(name, value, comment):
        return f'// {comment}\nexport const {name} = {json.dumps(value, ensure_ascii=False)};\n'

    TARGET.write_text(
        '// Generated by tools/kicad_reference.py from pcb/pcb.kicad_pcb.\n'
        '// Do not edit by hand: run the script again and review the diff.\n'
        f'// Coordinates in mm. Origin KiCad {ORIGIN[0]} / {ORIGIN[1]}, X to the right, Y up.\n\n'
        + js('boardThickness', thickness, 'Board thickness from the board setup.')
        + js('boards', boards, 'Outlines of the separated boards. Step: [x, y], or [x, y, midX, midY] for arcs.')
        + js('tabs', tabs, 'Removed breakaway tabs of the panel as rectangles (from = bottom left, to = top right).')
        + js('holes', ordered(holes), 'Mounting holes for M2 press-fit nuts, diameters in mm.')
        + js('switches', ordered(switches), 'Switch positions, rotation in degrees counter-clockwise.')
        + js('components', ordered(components), 'Other components with their linked 3D models from zzeneg/zzkeeb.')
    )
    for name, b in boards.items():
        print(f'{name:16} {len(b["steps"]):3} edges')
    print(f'{len(holes)} holes, {len(switches)} switches, {len(components)} components -> {TARGET.relative_to(REPO)}')


if __name__ == '__main__':
    main()
