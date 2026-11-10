#!/usr/bin/env python3
"""
Vergleichsmessung für Zeigerinstrumente: Zeigerwinkel je Videobild und Drehpunkt aus dem Schnittpunkt der Zeigergeraden.
Nur zur Untersuchung (siehe demo-multimeter.md), kein Teil der App. Die Bildbereiche gelten für das untersuchte Video und
müssen für ein anderes Gerät angepasst werden.

Aufruf:
    ffmpeg -i video.mov -vf fps=2 -pix_fmt gray -f image2 bilder/g%02d.pgm
    python3 -I zeigerwinkel.py bilder/ 1816 960

Argumente: Ordner mit den PGM-Bildern, Breite des Videos, Breite, auf die sich die Bereichsangaben unten beziehen.
Benötigt numpy und Pillow.
"""
import glob
import sys

import numpy as np
from PIL import Image

ordner, video_breite, bezug_breite = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
k = video_breite / bezug_breite
# Bildbereich unterhalb der Skala, in dem nur der Zeiger dunkel ist (Zeilen y0..y1, Spalten x0..x1, bezogen auf bezug_breite)
Y0, Y1, X0, X1 = 300, 395, 400, 790
DUNKEL = 90  # Helligkeitsschwelle für „Zeiger“

linien = []
for f in sorted(glob.glob(f'{ordner}/*.pgm')):
    a = np.asarray(Image.open(f), dtype=float)
    pts = []
    for y in range(int(Y0 * k), int(Y1 * k), 4):
        zeile = a[y, int(X0 * k):int(X1 * k)]
        x = int(np.argmin(zeile))
        if zeile[x] < DUNKEL:
            pts.append((int(X0 * k) + x, y))
    if len(pts) < 15:
        continue
    p = np.array(pts, float)
    m, b = np.polyfit(p[:, 1], p[:, 0], 1)           # x = m·y + b (der Zeiger steht eher senkrecht)
    ok = np.abs(p[:, 0] - (m * p[:, 1] + b)) < 6      # Ausreißer verwerfen
    if ok.sum() < 12:
        continue
    m, b = np.polyfit(p[ok, 1], p[ok, 0], 1)
    linien.append((f, m, b))

# Schnittpunkt aller Geraden (kleinste Quadrate): x − m·y = b
A = np.array([[1.0, -m] for _, m, _ in linien])
B = np.array([b for _, _, b in linien])
(px, py), *_ = np.linalg.lstsq(A, B, rcond=None)
print(f'{len(linien)} Geraden, Drehpunkt etwa x = {px:.0f}, y = {py:.0f}')
for f, m, b in linien:
    winkel = np.degrees(np.arctan2(-1, -m))  # Richtung entlang des Zeigers nach oben, Bildkoordinaten
    abstand = abs(px - (m * py + b)) / np.hypot(1, m)
    print(f'{f.rsplit("/", 1)[-1]}: Winkel {winkel:7.1f}°, Abstand der Geraden zum Drehpunkt {abstand:4.1f} px')
