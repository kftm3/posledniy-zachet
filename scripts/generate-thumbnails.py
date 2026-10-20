#!/usr/bin/env python3
"""Responsive derivatives only; full-resolution lossless originals are retained."""
from pathlib import Path
from PIL import Image
for pattern, widths in [('assets/characters/*/card.webp', (256, 512)),
                        ('assets/music-covers/*.webp', (128, 256))]:
    for path in Path('public').glob(pattern):
        if path.stem.endswith(('-128', '-256', '-512')):
            continue
        with Image.open(path) as source:
            for width in widths:
                image = source.resize((width, round(source.height * width / source.width)), Image.Resampling.LANCZOS)
                options = {'icc_profile': source.info['icc_profile']} if 'icc_profile' in source.info else {}
                image.save(path.with_stem(f'{path.stem}-{width}'), 'WEBP', lossless=True, method=6, exact=True, **options)
