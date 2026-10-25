from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)
SIZE = 512
base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(base)
draw.rounded_rectangle((18, 18, SIZE - 18, SIZE - 18), radius=116, fill=(22, 22, 42, 255))
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.polygon([(256, 87), (425, 256), (256, 425), (87, 256)], fill=(145, 111, 246, 120))
glow = glow.filter(ImageFilter.GaussianBlur(42))
base = Image.alpha_composite(base, glow)
draw = ImageDraw.Draw(base)
for width, color, inset in [(31, (173, 154, 255, 255), 112), (19, (115, 220, 225, 245), 173)]:
    points = [(256, inset), (512 - inset, 256), (256, 512 - inset), (inset, 256), (256, inset)]
    draw.line(points, fill=color, width=width, joint="curve")
draw.ellipse((235, 235, 277, 277), fill=(236, 232, 255, 255))
base.save(OUT / "icon.png")
base.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
