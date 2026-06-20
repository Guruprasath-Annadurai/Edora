"""
Edora Icon Preparation Script
-------------------------------
Takes the raw logo (black on white) and produces a branded 1024×1024 icon:
  - Edora gradient background (#5B6AF5 → #8B5CF6, top-left to bottom-right)
  - Logo made white, composited centred with padding
  - Outputs: resources/icon.png  (1024×1024, used by @capacitor/assets)
             resources/icon-foreground.png  (1024×1024 adaptive foreground, transparent bg)
             resources/splash.png  (2732×2732 splash, for @capacitor/assets)
"""

from PIL import Image, ImageDraw, ImageFilter
import sys, os

SRC = os.path.join(os.path.dirname(__file__), "icon-source.png")
OUT_ICON       = os.path.join(os.path.dirname(__file__), "icon.png")
OUT_FOREGROUND = os.path.join(os.path.dirname(__file__), "icon-foreground.png")
OUT_SPLASH     = os.path.join(os.path.dirname(__file__), "splash.png")

BRAND_START = (91, 106, 245)    # #5B6AF5
BRAND_END   = (139, 92, 246)    # #8B5CF6
SIZE        = 1024
SPLASH_SIZE = 2732
PADDING_PCT = 0.18              # 18% padding around logo


def make_gradient(w, h, c1, c2):
    """Top-left to bottom-right linear gradient."""
    img = Image.new("RGBA", (w, h))
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h)
            r = int(c1[0] + t * (c2[0] - c1[0]))
            g = int(c1[1] + t * (c2[1] - c1[1]))
            b = int(c1[2] + t * (c2[2] - c1[2]))
            img.putpixel((x, y), (r, g, b, 255))
    return img


def logo_to_white_on_transparent(src_path, target_size):
    """
    Load a black-on-white logo.
    → Invert (white logo on transparent background).
    → Resize to fit target_size with padding.
    """
    logo = Image.open(src_path).convert("RGBA")
    lw, lh = logo.size

    # Build alpha channel from luminance inverse of original
    r, g, b, a = logo.split()
    # White pixels (background) → transparent; black pixels (logo) → white
    logo_grey = logo.convert("L")
    alpha = logo_grey.point(lambda p: 255 - p)   # invert: black→255, white→0
    white_logo = Image.new("RGBA", (lw, lh), (255, 255, 255, 0))
    white_logo.putalpha(alpha)

    # Scale to fit with padding
    pad = int(target_size * PADDING_PCT)
    fit = target_size - pad * 2
    ratio = min(fit / lw, fit / lh)
    new_w, new_h = int(lw * ratio), int(lh * ratio)
    white_logo = white_logo.resize((new_w, new_h), Image.LANCZOS)

    # Centre on transparent canvas
    canvas = Image.new("RGBA", (target_size, target_size), (255, 255, 255, 0))
    ox = (target_size - new_w) // 2
    oy = (target_size - new_h) // 2
    canvas.paste(white_logo, (ox, oy), white_logo)
    return canvas


def main():
    if not os.path.exists(SRC):
        print(f"ERROR: Source logo not found at {SRC}")
        print("Save your logo PNG to resources/icon-source.png first.")
        sys.exit(1)

    print("Building icon.png (1024×1024)…")
    bg = make_gradient(SIZE, SIZE, BRAND_START, BRAND_END)
    fg = logo_to_white_on_transparent(SRC, SIZE)
    icon = Image.alpha_composite(bg, fg).convert("RGB")
    icon.save(OUT_ICON, "PNG", optimize=True)
    print(f"  ✓ {OUT_ICON}")

    print("Building icon-foreground.png (adaptive icon foreground, 1024×1024)…")
    fg_out = logo_to_white_on_transparent(SRC, SIZE)
    fg_out.save(OUT_FOREGROUND, "PNG", optimize=True)
    print(f"  ✓ {OUT_FOREGROUND}")

    print("Building splash.png (2732×2732)…")
    splash_bg = make_gradient(SPLASH_SIZE, SPLASH_SIZE, BRAND_START, BRAND_END)
    logo_splash = logo_to_white_on_transparent(SRC, int(SPLASH_SIZE * 0.35))
    # centre the smaller logo on the large splash
    ls = int(SPLASH_SIZE * 0.35)
    ox = (SPLASH_SIZE - ls) // 2
    oy = (SPLASH_SIZE - ls) // 2
    splash_canvas = Image.new("RGBA", (SPLASH_SIZE, SPLASH_SIZE), (0, 0, 0, 0))
    splash_canvas.paste(logo_splash, (ox, oy), logo_splash)
    splash_out = Image.alpha_composite(splash_bg.convert("RGBA"), splash_canvas).convert("RGB")
    splash_out.save(OUT_SPLASH, "PNG", optimize=True)
    print(f"  ✓ {OUT_SPLASH}")

    print("\nAll source assets ready. Now run:")
    print("  npx @capacitor/assets generate --android --ios")


if __name__ == "__main__":
    main()
