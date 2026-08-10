#!/usr/bin/env python3
"""Genereert de app-iconen: Turbo de schildpad (bovenaanzicht) op een zonnige
achtergrond. Pure stdlib, geen afhankelijkheden, zodat iedereen ze kan
regenereren. Uitvoer in de repo-root:

  icon-192.png, icon-512.png   afgeronde hoeken (gewone browser-iconen)
  icon-180.png                 vierkant, voor apple-touch-icon (iOS rondt zelf af)
  icon-512-mask.png            vierkant met extra marge, purpose "maskable"
"""
import math
import struct
import zlib

SUN = (255, 197, 61)
GREEN = (70, 180, 102)
DARK = (46, 140, 76)
INK = (23, 69, 111)


def png_bytes(size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw += bytes(pixels[y][x])
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))


def rounded_rect_cov(x, y, size, radius):
    half = size / 2.0
    qx = abs(x - half) - (half - radius)
    qy = abs(y - half) - (half - radius)
    dx, dy = max(qx, 0.0), max(qy, 0.0)
    dist = math.hypot(dx, dy) + min(max(qx, qy), 0.0) - radius
    return max(0.0, min(1.0, 0.5 - dist))


def circle_cov(x, y, cx, cy, r):
    dist = math.hypot(x - cx, y - cy) - r
    return max(0.0, min(1.0, 0.5 - dist))


def render(size, corner_radius, shrink=1.0):
    """corner_radius in 512-schaal; shrink < 1 tekent de schildpad kleiner
    (veilige zone voor maskable iconen)."""
    f = size / 512.0

    def s(v):
        return v * f

    def sc(cx, cy):
        # coordinaat rond het midden geschaald met shrink
        return (256 + (cx - 256) * shrink) * f, (256 + (cy - 256) * shrink) * f

    shapes = []
    # poten: donkere rand met groene vulling
    for ang in (45, 135, 225, 315):
        lx = 256 + 148 * math.cos(math.radians(ang))
        ly = 305 + 148 * math.sin(math.radians(ang))
        shapes.append(((lx, ly), 44, DARK))
        shapes.append(((lx, ly), 34, GREEN))
    # kop bovenaan
    shapes.append(((256, 122), 62, DARK))
    shapes.append(((256, 122), 52, GREEN))
    # nek
    shapes.append(((256, 175), 34, GREEN))
    # schild
    shapes.append(((256, 305), 152, DARK))
    shapes.append(((256, 305), 134, GREEN))
    # schildvlekken
    shapes.append(((256, 305), 46, DARK))
    for ang in range(0, 360, 60):
        vx = 256 + 86 * math.cos(math.radians(ang))
        vy = 305 + 86 * math.sin(math.radians(ang))
        shapes.append(((vx, vy), 26, DARK))
    # ogen
    shapes.append(((238, 116), 9, INK))
    shapes.append(((274, 116), 9, INK))

    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            cov = rounded_rect_cov(x + 0.5, y + 0.5, size, s(corner_radius))
            color = SUN
            a = cov
            for (cx, cy), r, col in shapes:
                px, py = sc(cx, cy)
                c = circle_cov(x + 0.5, y + 0.5, px, py, r * shrink * f)
                if c > 0:
                    color = tuple(int(color[i] * (1 - c) + col[i] * c) for i in range(3))
            row.append((color[0], color[1], color[2], int(a * 255)))
        pixels.append(row)
    return png_bytes(size, pixels)


def main():
    import os
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    out = {
        'icon-192.png': render(192, 90),
        'icon-512.png': render(512, 90),
        'icon-180.png': render(180, 0),
        'icon-512-mask.png': render(512, 0, shrink=0.78),
    }
    for name, data in out.items():
        path = os.path.join(root, name)
        with open(path, 'wb') as fh:
            fh.write(data)
        print('geschreven:', name, len(data), 'bytes')


if __name__ == '__main__':
    main()
