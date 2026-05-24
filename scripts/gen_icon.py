"""
모아봄 app icon generator using Pillow
Design: White background, elegant dark box, 3 bright media cards sticking out, cherry blossoms
"""

import math
import struct
import io
from PIL import Image, ImageDraw, ImageFilter

# ── helpers ───────────────────────────────────────────────────────────────────

def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def draw_polygon_gradient(img, pts, color_top, color_bottom):
    """Fill a polygon with a vertical gradient by drawing horizontal spans."""
    draw = ImageDraw.Draw(img)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    y_min, y_max = int(min(ys)), int(max(ys))
    n = len(pts)

    for y in range(y_min, y_max + 1):
        x_intersections = []
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= y < y2) or (y2 <= y < y1):
                if y2 != y1:
                    x = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                    x_intersections.append(x)
        if len(x_intersections) >= 2:
            x_intersections.sort()
            t = (y - y_min) / max(1, y_max - y_min)
            color = lerp_color(color_top, color_bottom, t)
            draw.line([(x_intersections[0], y), (x_intersections[-1], y)], fill=color)


def draw_petal(draw, cx, cy, rx, ry, angle_deg, color):
    """Draw a single petal (ellipse) rotated around center."""
    a = math.radians(angle_deg)
    pts = []
    steps = 24
    for i in range(steps):
        theta = 2 * math.pi * i / steps
        x = rx * math.cos(theta)
        y = ry * math.sin(theta)
        rx2 = x * math.cos(a) - y * math.sin(a) + cx
        ry2 = x * math.sin(a) + y * math.cos(a) + cy
        pts.append((rx2, ry2))
    draw.polygon(pts, fill=color)


def draw_cherry_blossom(img, cx, cy, r, alpha=70):
    """5-petal cherry blossom."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    petal_color = (255, 170, 185, alpha)
    center_color = (255, 130, 150, alpha + 30)
    for i in range(5):
        angle = i * 72
        a_rad = math.radians(angle)
        px = cx + r * 0.58 * math.cos(a_rad)
        py = cy + r * 0.58 * math.sin(a_rad)
        draw_petal(d, px, py, r * 0.55, r * 0.38, angle, petal_color)
    cr = r * 0.22
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=center_color)
    img.alpha_composite(overlay)


# ── main draw ─────────────────────────────────────────────────────────────────

def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 256

    # ── Background ──
    bg = Image.new("RGBA", (size, size), (255, 252, 248, 255))
    bg_draw = ImageDraw.Draw(bg)
    # Subtle gradient: fill with slightly warmer at bottom
    for y in range(size):
        t = y / size
        c = lerp_color((255, 253, 250), (248, 243, 238), t)
        bg_draw.line([(0, y), (size - 1, y)], fill=c + (255,))

    # Apply rounded corners
    radius = max(4, int(36 * s))
    mask = rounded_rect_mask(size, radius)
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)

    # ── Cherry blossoms (background, before box) ──
    blossom_positions = [
        (0.11, 0.09, 0.068),
        (0.89, 0.13, 0.058),
        (0.07, 0.82, 0.062),
        (0.91, 0.80, 0.062),
        (0.79, 0.07, 0.052),
        (0.16, 0.90, 0.057),
    ]
    for bx, by, br in blossom_positions:
        draw_cherry_blossom(img, bx * size, by * size, br * size, alpha=65)

    draw = ImageDraw.Draw(img)

    # ── Layout constants ──
    cx   = size * 0.50          # horizontal center
    bot  = size * 0.86          # box bottom y
    bw   = size * 0.64          # box front width
    bh   = size * 0.28          # box front height
    sk_x = size * 0.18          # right-skew (perspective)
    sk_y = size * 0.11          # up-skew (top face height)

    # Front face corners
    fBL = (cx - bw/2,        bot)
    fBR = (cx + bw/2,        bot)
    fTL = (cx - bw/2,        bot - bh)
    fTR = (cx + bw/2,        bot - bh)

    # Top face (parallelogram: front top → skewed back)
    tBL = fTL
    tBR = fTR
    tTL = (fTL[0] + sk_x, fTL[1] - sk_y)
    tTR = (fTR[0] + sk_x, fTR[1] - sk_y)

    # Right face
    rBL = fBR
    rBR = (fBR[0] + sk_x, fBR[1] - sk_y)
    rTR = (fTR[0] + sk_x, fTR[1] - sk_y)
    rTL = fTR

    # ── Media cards (drawn FIRST so box front covers bottom half) ──
    card_w  = size * 0.155
    card_h  = size * 0.48
    card_top_y = size * 0.14      # cards start here (above box)
    # cards end at card_top_y + card_h; box front covers from fTL[1] down

    card_specs = [
        # (center_x_fraction_of_bw_offset, bg_color, icon_type)
        (-0.235, (70, 150, 235),  "book"),    # blue  – book
        ( 0.000, (145, 100, 235), "movie"),   # purple – movie
        ( 0.235, (235,  85, 100), "drama"),   # red   – drama
    ]

    for offset_frac, base_color, icon_type in card_specs:
        ccx = cx + offset_frac * bw
        ct  = card_top_y + abs(offset_frac) * size * 0.06   # slight stagger
        cb  = ct + card_h
        cl  = ccx - card_w / 2
        cr2 = ccx + card_w / 2

        # Card shadow
        sh_overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sh_draw = ImageDraw.Draw(sh_overlay)
        sh_r = max(1, min(int(card_w // 4 - 1), int(size * 0.025)))
        sh_draw.rounded_rectangle(
            [cl + size*0.012, ct + size*0.012, cr2 + size*0.012, cb + size*0.012],
            radius=sh_r,
            fill=(0, 0, 0, 35)
        )
        img = Image.alpha_composite(img, sh_overlay)

        # Card gradient body
        card_overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        card_draw = ImageDraw.Draw(card_overlay)
        light = tuple(min(255, c + 55) for c in base_color)
        dark  = tuple(max(0,   c - 30) for c in base_color)
        # Draw gradient via horizontal lines inside rounded rect mask
        card_mask = Image.new("L", (size, size), 0)
        mask_draw = ImageDraw.Draw(card_mask)
        cr_val = max(1, min(int(card_w // 4 - 1), int(size * 0.025)))
        mask_draw.rounded_rectangle([cl, ct, cr2, cb], radius=cr_val, fill=255)

        for y in range(int(ct), int(cb) + 1):
            t = (y - ct) / max(1, cb - ct)
            color = lerp_color(light, dark, t)
            card_draw.line([(cl, y), (cr2, y)], fill=color + (255,))

        card_overlay.putalpha(card_mask)
        img = Image.alpha_composite(img, card_overlay)

        draw = ImageDraw.Draw(img)

        # Card icon (only larger sizes)
        if size >= 64:
            ic_cx = ccx
            ic_cy = ct + size * 0.055
            ic_sz = card_w * 0.62
            wh = (255, 255, 255, 210)

            if icon_type == "book":
                # Two book pages side by side
                bk_h = ic_sz * 0.72
                bk_y = ic_cy - bk_h / 2
                bk_y2 = bk_y + bk_h
                gap = max(1, ic_sz * 0.08)
                # Left half
                lx0, lx1 = ic_cx - ic_sz*0.50, ic_cx - gap
                if lx1 > lx0 and bk_y2 > bk_y:
                    draw.rounded_rectangle(
                        [lx0, bk_y, lx1, bk_y2],
                        radius=max(1, int(ic_sz * 0.08)), fill=wh
                    )
                # Right half
                rx0, rx1 = ic_cx + gap, ic_cx + ic_sz*0.50
                if rx1 > rx0 and bk_y2 > bk_y:
                    draw.rounded_rectangle(
                        [rx0, bk_y, rx1, bk_y2],
                        radius=max(1, int(ic_sz * 0.08)), fill=wh
                    )

            elif icon_type == "movie":
                # Film clapper / play circle
                r3 = ic_sz * 0.50
                draw.ellipse([ic_cx - r3, ic_cy - r3, ic_cx + r3, ic_cy + r3], fill=wh)
                # Play triangle
                tri_pts = [
                    (ic_cx - r3 * 0.25, ic_cy - r3 * 0.50),
                    (ic_cx - r3 * 0.25, ic_cy + r3 * 0.50),
                    (ic_cx + r3 * 0.62, ic_cy),
                ]
                draw.polygon(tri_pts, fill=(145, 100, 235, 200))

            elif icon_type == "drama":
                # TV screen
                tv_w = ic_sz * 0.92
                tv_h = ic_sz * 0.70
                tv_x = ic_cx - tv_w / 2
                tv_y = ic_cy - tv_h / 2 + ic_sz * 0.05
                draw.rounded_rectangle(
                    [tv_x, tv_y, tv_x + tv_w, tv_y + tv_h],
                    radius=max(1, int(ic_sz * 0.1)), fill=wh
                )
                # Screen inner
                mg = max(2, ic_sz * 0.12)
                ix0 = int(tv_x + mg)
                iy0 = int(tv_y + mg)
                ix1 = int(tv_x + tv_w - mg)
                iy1 = int(tv_y + tv_h - mg)
                if ix1 > ix0 + 1 and iy1 > iy0 + 1:
                    draw.rounded_rectangle(
                        [ix0, iy0, ix1, iy1],
                        radius=max(1, int(ic_sz * 0.06)),
                        fill=(235, 85, 100, 200)
                    )
                # Antenna (only if there's space)
                ant_x = ic_cx
                ant_y1 = tv_y - ic_sz * 0.18
                ant_y2 = tv_y
                if ant_y2 > ant_y1:
                    draw.line([(ant_x, ant_y1), (ant_x, ant_y2)],
                              fill=wh, width=max(1, int(ic_sz * 0.08)))

    # ── Re-create draw handle after composites ──
    draw = ImageDraw.Draw(img)

    # ── BOX: Front face (deep navy-blue, modern) ──
    front_pts = [fTL, fTR, fBR, fBL]
    front_top_c = (52, 75, 130)    # rich navy blue
    front_bot_c = (32, 50, 100)
    draw_polygon_gradient(img, front_pts, front_top_c + (255,), front_bot_c + (255,))

    draw = ImageDraw.Draw(img)

    # Subtle vertical sheen on front face (lighter left side)
    sheen_overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sheen_draw = ImageDraw.Draw(sheen_overlay)
    for xi in range(int(fTL[0]), int(fTR[0])):
        t = (xi - fTL[0]) / max(1, fTR[0] - fTL[0])
        alpha = int(30 * (1 - t))  # brighter on left
        sheen_draw.line([(xi, fTL[1]), (xi, fBL[1])], fill=(255, 255, 255, alpha))
    img = Image.alpha_composite(img, sheen_overlay)
    draw = ImageDraw.Draw(img)

    # ── BOX: Top face (lighter navy) ──
    top_pts = [tTL, tTR, tBR, tBL]
    top_top_c = (80, 110, 175)
    top_bot_c = (60, 88, 148)
    draw_polygon_gradient(img, top_pts, top_top_c + (255,), top_bot_c + (255,))

    draw = ImageDraw.Draw(img)

    # ── BOX: Right face (darkest) ──
    right_pts = [rTL, rTR, rBR, rBL]
    right_top_c = (35, 55, 100)
    right_bot_c = (22, 36, 72)
    draw_polygon_gradient(img, right_pts, right_top_c + (255,), right_bot_c + (255,))

    draw = ImageDraw.Draw(img)

    # ── Box outlines / edges ──
    edge_color = (20, 30, 60, 200)
    draw.polygon(front_pts, outline=edge_color)
    draw.polygon(top_pts, outline=edge_color)
    draw.polygon(right_pts, outline=edge_color)

    # Top edge highlight (bright)
    hl_color = (180, 210, 255, 110)
    hl_w = max(1, int(size * 0.018))
    draw.line([tTL, tTR], fill=hl_color, width=hl_w)
    draw.line([tTL, tBL], fill=hl_color, width=hl_w)

    # ── Opening rim: gold accent line ──
    rim_color = (220, 190, 120, 160)
    rim_w = max(1, int(size * 0.016))
    draw.line([fTL, fTR], fill=rim_color, width=rim_w)

    # ── Apply rounded-corner mask to final image ──
    final_mask = rounded_rect_mask(size, radius)
    img.putalpha(final_mask)

    return img


# ── ICO builder ───────────────────────────────────────────────────────────────

def build_ico(images_by_size, out_path):
    sizes = sorted(images_by_size.keys(), reverse=True)
    pngs = []
    for sz in sizes:
        buf = io.BytesIO()
        images_by_size[sz].save(buf, format="PNG")
        pngs.append(buf.getvalue())

    with open(out_path, "wb") as f:
        # Header
        f.write(struct.pack("<HHH", 0, 1, len(sizes)))
        # Directory
        offset = 6 + 16 * len(sizes)
        for i, sz in enumerate(sizes):
            dim = 0 if sz >= 256 else sz
            f.write(struct.pack("<BBBBHHII",
                dim, dim, 0, 0, 1, 32,
                len(pngs[i]), offset))
            offset += len(pngs[i])
        # Data
        for png in pngs:
            f.write(png)

    print(f"Saved {out_path} ({len(sizes)} sizes)")


# ── entry ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    target_sizes = [256, 128, 64, 48, 32, 16]
    images = {}
    for sz in target_sizes:
        print(f"  Rendering {sz}×{sz}…")
        images[sz] = draw_icon(sz)
        # Save preview of largest
        if sz == 256:
            images[sz].save(r"C:\Users\Jae\AppData\Local\Temp\icon_preview3.png")
            print("  Preview saved.")

    build_ico(images, r"C:\Users\Jae\Desktop\Book\build\icon.ico")
