"""Build the app icons from the restaurant logo.

    python scripts/make_app_icons.py

Reads brand/logo-original.jpg (the round S&H badge on black), cuts the badge
out as a circle and writes public/icons/:

    logo-192.png, logo-512.png   transparent corners ("any" icons)
    logo-maskable-512.png        badge inside the safe zone on black, for
                                 phones that crop icons into their own shape
    logo-64.png                  browser tab icon

and public/favicon.ico (16, 32 and 48 px), which browsers and search
engines ask for by that name.

Re-run it after replacing the original with a sharper file.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "brand" / "logo-original.jpg"
OUT = ROOT / "public" / "icons"
FAVICON = ROOT / "public" / "favicon.ico"
WORK = 1024  # work large, scale down once for clean edges


def find_badge(img: Image.Image) -> tuple[int, int, int]:
    """Centre and radius of the white badge on the black background."""
    rgb = img.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    light = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if sum(px[x, y]) > 600]
    xs = [p[0] for p in light]
    ys = [p[1] for p in light]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    radius = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    return round(cx), round(cy), round(radius) + 1


def badge(img: Image.Image) -> Image.Image:
    """The badge alone, WORK px square, with a smooth transparent outside."""
    cx, cy, r = find_badge(img)
    square = img.convert("RGBA").crop((cx - r, cy - r, cx + r, cy + r)).resize((WORK, WORK), Image.LANCZOS)
    mask = Image.new("L", (WORK * 4, WORK * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, WORK * 4 - 1, WORK * 4 - 1), fill=255)
    square.putalpha(mask.resize((WORK, WORK), Image.LANCZOS))
    return square


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cut = badge(Image.open(SOURCE))

    for size in (512, 192, 64):
        cut.resize((size, size), Image.LANCZOS).save(OUT / f"logo-{size}.png", optimize=True)

    # Maskable: launchers may crop to a circle of 80% of the width; keep the
    # whole badge inside it, on the logo's own black.
    canvas = Image.new("RGBA", (WORK, WORK), (0, 0, 0, 255))
    inner = int(WORK * 0.78)
    offset = (WORK - inner) // 2
    canvas.alpha_composite(cut.resize((inner, inner), Image.LANCZOS), (offset, offset))
    canvas.resize((512, 512), Image.LANCZOS).save(OUT / "logo-maskable-512.png", optimize=True)

    cut.save(FAVICON, sizes=[(16, 16), (32, 32), (48, 48)])
    print("icons written to", OUT.relative_to(ROOT), "and", FAVICON.relative_to(ROOT))


if __name__ == "__main__":
    main()
