"""Generate the PWA icons with Pillow; no web requests or fonts required."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'assets'
for size in (192, 512):
    scale = 4
    n = size * scale
    image = Image.new('RGB', (n, n), '#8175ce')
    draw = ImageDraw.Draw(image)
    def box(coords):
        return tuple(int(value * n) for value in coords)
    draw.ellipse(box((.23, .25, .72, .74)), fill='#ffffff')
    draw.ellipse(box((.43, .17, .84, .59)), fill='#8175ce')
    points = [(.70,.27),(.72,.32),(.77,.34),(.72,.36),(.70,.41),(.68,.36),(.63,.34),(.68,.32)]
    draw.polygon([(int(x*n),int(y*n)) for x,y in points], fill='#ddd6ff')
    image.resize((size,size), Image.Resampling.LANCZOS).save(root/f'icon-{size}.png')
