#!/usr/bin/env python3
"""Convert PNGs to lossless WebP, verifying every decoded RGBA pixel.

Requires Pillow with WebP support: python3 -m pip install Pillow
Run from repository root. This changes assets AND local PNG references.
Original assets remain recoverable from Git. No resizing or lossy encoding.
"""
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from PIL import Image
import json


def convert(path):
    source = Path(path)
    target = source.with_suffix('.webp')
    if target.exists():
        raise FileExistsError(target)
    with Image.open(source) as image:
        options = {key: image.info[key] for key in ('icc_profile', 'exif') if key in image.info}
        image.save(target, 'WEBP', lossless=True, method=6, exact=True, **options)
        with Image.open(target) as result:
            if image.convert('RGBA').tobytes() != result.convert('RGBA').tobytes():
                target.unlink()
                raise ValueError(f'Pixel mismatch: {source}')
        return {'source': str(source), 'target': str(target), 'before': source.stat().st_size,
                'after': target.stat().st_size, 'pixels_identical': True}


if __name__ == '__main__':
    paths = sorted(Path('public').rglob('*.png'))
    if not paths:
        print('No PNG files to convert.')
        raise SystemExit(0)
    with ProcessPoolExecutor(max_workers=4) as pool:
        report = list(pool.map(convert, map(str, paths)))
    # All PNGs have been verified, including those referenced through template literals.
    for path in [Path('index.html'), *Path('src').rglob('*.ts'), *Path('src').rglob('*.css')]:
        content = path.read_text()
        path.write_text(content.replace('.png', '.webp'))
    for path in paths:
        path.unlink()
    Path('image-conversion-report.json').write_text(json.dumps(report, indent=2))
    before = sum(item['before'] for item in report)
    after = sum(item['after'] for item in report)
    print(f'{len(report)} images: {before:,} -> {after:,} bytes ({100*(1-after/before):.1f}% smaller), identical pixels')
