#!/usr/bin/env python3
"""Schriftzug „Werkbank“ als SVG-Pfade (Instrument Sans, 650, Laufweite -0.035em).
Für den Splash: erscheint sofort, ohne dass die Webschrift geladen sein muss.
Aufruf: python3 scripts/make-wordmark.py > src/wordmark.svg (wird in index.html eingesetzt)"""
import io, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import uharfbuzz as hb

SRC = 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-standard-normal.woff2'
TEXT, WGHT, TRACK = 'Werkbank', 650, -0.035
f = TTFont(SRC)
axes = {a.axisTag: a for a in f['fvar'].axes}
loc = {'wght': WGHT}
if 'wdth' in axes: loc['wdth'] = 100
inst = instancer.instantiateVariableFont(f, loc)
inst.flavor = None
buf = io.BytesIO(); inst.save(buf); data = buf.getvalue()
upem = inst['head'].unitsPerEm
face = hb.Face(data); font = hb.Font(face)
b = hb.Buffer(); b.add_str(TEXT); b.guess_segment_properties()
hb.shape(font, b, {'kern': True, 'liga': True})
gs = inst.getGlyphSet(); order = inst.getGlyphOrder()
pen = SVGPathPen(gs, ntos=lambda v: "%d" % round(v))
bp = BoundsPen(gs)
x = 0
track = TRACK * upem
for info, pos in zip(b.glyph_infos, b.glyph_positions):
    name = order[info.codepoint]
    tp = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, 0))
    gs[name].draw(tp)
    gs[name].draw(TransformPen(bp, (1, 0, 0, -1, x + pos.x_offset, 0)))
    x += pos.x_advance + track
x -= track
x0, y0, x1, y1 = bp.bounds
d = pen.getCommands()
sys.stdout.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{round(x0)} {round(y0)} {round(x1 - x0)} {round(y1 - y0)}" class="sp-word" role="img" aria-label="{TEXT}"><path fill="currentColor" d="{d}"/></svg>\n')
