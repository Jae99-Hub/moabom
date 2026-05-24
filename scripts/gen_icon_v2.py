"""
모아봄 icon v2
Concept: Items (book, movie, drama) being pulled/sucked INTO a glowing portal/container.
- Warm cream background
- Deep glowing funnel/portal opening at bottom center
- 3 media items spiraling/falling in at different scales & rotations
- Motion speed lines radiating from the opening
- Cherry blossom petals also being drawn in
"""

import math, struct, io
from PIL import Image, ImageDraw, ImageFilter

# ───────────────────────── helpers ─────────────────────────

def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=255)
    return m

def lerp(a, b, t):
    return a + (b - a) * t

def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(len(a)))

def rotate_pt(x, y, cx, cy, deg):
    r = math.radians(deg)
    dx, dy = x-cx, y-cy
    return (cx + dx*math.cos(r) - dy*math.sin(r),
            cy + dx*math.sin(r) + dy*math.cos(r))

def draw_rotated_rect(draw, cx, cy, w, h, angle_deg, fill, outline=None, outline_w=1):
    """Draw a rectangle centred at (cx,cy) rotated by angle_deg."""
    corners = [(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]
    a = math.radians(angle_deg)
    pts = [(cx + x*math.cos(a) - y*math.sin(a),
            cy + x*math.sin(a) + y*math.cos(a)) for x,y in corners]
    draw.polygon(pts, fill=fill)
    if outline:
        draw.polygon(pts, outline=outline)

def draw_rounded_rotated(img, cx, cy, w, h, angle_deg, color, radius_frac=0.12):
    """Stamp a rounded rectangle at arbitrary rotation using a temp buffer."""
    pad = int(math.hypot(w, h)) + 4
    tmp = Image.new("RGBA", (pad*2, pad*2), (0,0,0,0))
    d   = ImageDraw.Draw(tmp)
    r   = max(2, int(min(w,h)*radius_frac))
    d.rounded_rectangle(
        [pad - w//2, pad - h//2, pad + w//2, pad + h//2],
        radius=r, fill=color
    )
    tmp2 = tmp.rotate(-angle_deg, resample=Image.BICUBIC, expand=False)
    ox = int(cx) - pad
    oy = int(cy) - pad
    img.alpha_composite(tmp2, (ox, oy))

def petal(img, cx, cy, r, alpha=70):
    """5-petal cherry blossom."""
    ov = Image.new("RGBA", img.size, (0,0,0,0))
    d  = ImageDraw.Draw(ov)
    for i in range(5):
        a = math.radians(i*72)
        px = cx + r*0.58*math.cos(a)
        py = cy + r*0.58*math.sin(a)
        pts = []
        for j in range(20):
            t2 = 2*math.pi*j/20
            lx = r*0.52*math.cos(t2)
            ly = r*0.36*math.sin(t2)
            la = a
            pts.append((px + lx*math.cos(la) - ly*math.sin(la),
                         py + lx*math.sin(la) + ly*math.cos(la)))
        d.polygon(pts, fill=(255,175,188,alpha))
    cr = r*0.20
    d.ellipse([cx-cr,cy-cr,cx+cr,cy+cr], fill=(255,140,155,alpha+25))
    img.alpha_composite(ov)

# ───────────────────────── icon draw ─────────────────────────

def draw_icon(size):
    s = size / 256.0
    img = Image.new("RGBA", (size,size), (0,0,0,0))

    # ── Background ──
    bg = Image.new("RGBA", (size,size), (0,0,0,0))
    bd = ImageDraw.Draw(bg)
    for y in range(size):
        t = y/size
        c = lerp_color((255,253,250), (250,245,240), t)
        bd.line([(0,y),(size-1,y)], fill=c+(255,))
    radius = max(4, int(36*s))
    bg.putalpha(rounded_rect_mask(size, radius))
    img = Image.alpha_composite(img, bg)

    # ── Portal / Opening glow at bottom-centre ──
    portal_cx = size * 0.50
    portal_cy = size * 0.80
    portal_rx = size * 0.30   # horizontal radius of ellipse opening
    portal_ry = size * 0.085  # vertical radius (flat oval)

    # Outer glow layers (multiple ellipses, decreasing alpha)
    glow_layer = Image.new("RGBA", (size,size), (0,0,0,0))
    gd = ImageDraw.Draw(glow_layer)
    for gi in range(8, 0, -1):
        gf = gi / 8.0
        grx = portal_rx * (1 + gf*0.55)
        gry = portal_ry * (1 + gf*0.70)
        ga  = int(18 * (1-gf) + 5)
        col = lerp_color((120,100,220), (200,120,255), gf)
        gd.ellipse([portal_cx - grx, portal_cy - gry,
                    portal_cx + grx, portal_cy + gry],
                   fill=col+(ga,))
    img = Image.alpha_composite(img, glow_layer)

    # Dark oval core (the opening)
    core_layer = Image.new("RGBA", (size,size), (0,0,0,0))
    cd = ImageDraw.Draw(core_layer)
    # Gradient from dark purple centre to slightly lighter edge
    for gi in range(12, 0, -1):
        gf = gi / 12.0
        grx = portal_rx * gf
        gry = portal_ry * gf
        ga  = int(200 * gf + 50)
        col = lerp_color((15,10,35), (50,30,90), 1-gf)
        cd.ellipse([portal_cx-grx, portal_cy-gry,
                    portal_cx+grx, portal_cy+gry],
                   fill=col+(ga,))
    img = Image.alpha_composite(img, core_layer)

    # Rim highlight (bright arc at top of oval)
    rim_layer = Image.new("RGBA", (size,size), (0,0,0,0))
    rd = ImageDraw.Draw(rim_layer)
    rim_w = max(1, int(size*0.012))
    rd.arc([portal_cx-portal_rx, portal_cy-portal_ry,
            portal_cx+portal_rx, portal_cy+portal_ry],
           start=200, end=340,
           fill=(200,170,255,200), width=rim_w)
    img = Image.alpha_composite(img, rim_layer)

    # ── Speed / vortex lines radiating FROM the portal upward ──
    if size >= 48:
        vortex_layer = Image.new("RGBA", (size,size), (0,0,0,0))
        vd = ImageDraw.Draw(vortex_layer)
        n_lines = 18 if size >= 128 else 10
        for li in range(n_lines):
            a = math.radians(li * 360/n_lines)
            # Lines fan upward from the oval, not going downward much
            if math.sin(a) > 0.3:   # skip downward lines
                continue
            # Length proportional to how "upward" the line goes
            length = size * lerp(0.18, 0.40, max(0, -math.sin(a)))
            x0 = portal_cx + portal_rx * 0.85 * math.cos(a)
            y0 = portal_cy + portal_ry * 0.85 * math.sin(a)
            x1 = portal_cx + (portal_rx + length) * math.cos(a)
            y1 = portal_cy + (portal_ry + length) * math.sin(a)
            # Fade toward outer end
            lw = max(1, int(size*0.008))
            vd.line([(x0,y0),(x1,y1)], fill=(160,130,220,30), width=lw)
        img = Image.alpha_composite(img, vortex_layer)

    # ── Cherry blossom petals (far, being pulled) ──
    blossom_data = [
        (0.12, 0.10, 0.062, 70),
        (0.88, 0.14, 0.055, 65),
        (0.07, 0.70, 0.058, 60),
        (0.90, 0.68, 0.055, 60),
        # Being pulled toward portal – smaller, closer to portal
        (0.60, 0.55, 0.038, 50),
        (0.38, 0.60, 0.032, 45),
    ]
    for bx, by, br, ba in blossom_data:
        petal(img, bx*size, by*size, br*size, ba)

    # ── Media items flying into the portal ──
    # Each item: (pos along pull path, scale, rotation, color, icon_type)
    # Path: arc from upper-right → portal centre; different items at different positions
    # Position 0=far (large) 1=near portal (small, rotated more)
    items = [
        # t=pull progress (0=far/large, 1=at portal/tiny), angle_offset, color, icon
        (0.15, -40, (80, 155, 230), "book"),    # blue  – far upper-left, large
        (0.42,  15, (155, 100, 235), "movie"),  # purple – mid upper-right, medium
        (0.68,  50, (235, 85, 105), "drama"),   # red   – close, small, tilted
    ]

    for t_pull, orbit_angle_offset, base_color, icon_type in items:
        # Scale: large when far, tiny near portal
        item_scale = lerp(1.0, 0.28, t_pull)
        card_w = int(size * 0.18 * item_scale)
        card_h = int(size * 0.26 * item_scale)
        if card_w < 4 or card_h < 4:
            continue

        # Position: spread out in upper half, converging to portal
        # Arc path from outer positions into portal
        # Far items are in upper quadrants, pulled diagonally toward portal
        angle_spread = math.radians(-50 + orbit_angle_offset + t_pull * 60)
        dist_from_portal = size * lerp(0.52, 0.08, t_pull)
        item_cx = portal_cx + dist_from_portal * math.cos(angle_spread - math.pi/2)
        item_cy = portal_cy + dist_from_portal * math.sin(angle_spread - math.pi/2)

        # Rotation: tumbling as it falls in
        rotation = orbit_angle_offset * 0.8 + t_pull * 35

        # Alpha: slightly transparent when close to portal
        item_alpha = int(lerp(255, 180, t_pull))

        # Draw shadow
        sh_layer = Image.new("RGBA", (size,size), (0,0,0,0))
        draw_rounded_rotated(sh_layer,
            item_cx + size*0.015, item_cy + size*0.015,
            card_w, card_h, rotation,
            (0,0,0,20))
        img = Image.alpha_composite(img, sh_layer)

        # Card gradient: lighter top → darker bottom
        light = tuple(min(255, c+60) for c in base_color)
        dark  = tuple(max(0, c-25) for c in base_color)

        # Render card as rotated rounded rect
        card_layer = Image.new("RGBA", (size,size), (0,0,0,0))
        draw_rounded_rotated(card_layer, item_cx, item_cy, card_w, card_h, rotation,
                             light+(item_alpha,), radius_frac=0.14)
        # Overlay darker gradient using a second pass
        draw_rounded_rotated(card_layer, item_cx + card_h*0.2*math.sin(math.radians(rotation)),
                             item_cy + card_h*0.2*math.cos(math.radians(rotation)),
                             card_w, int(card_h*0.5), rotation, dark+(int(item_alpha*0.6),),
                             radius_frac=0.10)
        img = Image.alpha_composite(img, card_layer)

        # Icon on card (only when card is large enough)
        if card_w >= 16 and card_h >= 20:
            icon_layer = Image.new("RGBA", (size,size), (0,0,0,0))
            id2 = ImageDraw.Draw(icon_layer)
            wh = (255,255,255,200)
            ic_sz = card_w * 0.55
            ic_cx, ic_cy = item_cx, item_cy - card_h*0.05

            if icon_type == "book":
                # Open book
                bk_h = ic_sz * 0.70
                bk_y = ic_cy - bk_h/2
                gap = max(1, ic_sz*0.08)
                lx0,lx1 = ic_cx-ic_sz*0.50, ic_cx-gap
                rx0,rx1 = ic_cx+gap, ic_cx+ic_sz*0.50
                if lx1>lx0+1 and bk_y+bk_h>bk_y+1:
                    draw_rotated_rect(id2, (lx0+lx1)/2, (bk_y+bk_y+bk_h)/2,
                                      lx1-lx0, bk_h, rotation, wh)
                    draw_rotated_rect(id2, (rx0+rx1)/2, (bk_y+bk_y+bk_h)/2,
                                      rx1-rx0, bk_h, rotation, wh)

            elif icon_type == "movie":
                # Play circle
                r3 = max(3, int(ic_sz*0.50))
                draw_rotated_rect(id2, ic_cx, ic_cy, r3*2, r3*2, rotation, wh)
                # Triangle play
                tri = [(-r3*0.22,-r3*0.48),(-r3*0.22,r3*0.48),(r3*0.55,0)]
                a2 = math.radians(rotation)
                rpts = [(ic_cx + x*math.cos(a2)-y*math.sin(a2),
                         ic_cy + x*math.sin(a2)+y*math.cos(a2)) for x,y in tri]
                id2.polygon(rpts, fill=base_color+(200,))

            elif icon_type == "drama":
                # TV screen
                tv_w = int(ic_sz*0.88)
                tv_h = int(ic_sz*0.68)
                if tv_w>=4 and tv_h>=4:
                    draw_rotated_rect(id2, ic_cx, ic_cy, tv_w, tv_h, rotation, wh)
                    mg = max(2, int(ic_sz*0.12))
                    iw,ih = tv_w-mg*2, tv_h-mg*2
                    if iw>2 and ih>2:
                        draw_rotated_rect(id2, ic_cx, ic_cy, iw, ih, rotation,
                                         base_color+(200,))

            # Rotate and composite icon layer
            icon_rotated = icon_layer  # rotation already applied per draw_rotated_rect
            img = Image.alpha_composite(img, icon_rotated)

    # ── Final rounded-corner mask ──
    img.putalpha(rounded_rect_mask(size, radius))
    return img

# ───────────────────────── ICO builder ─────────────────────────

def build_ico(images_by_size, out_path):
    sizes = sorted(images_by_size.keys(), reverse=True)
    pngs  = []
    for sz in sizes:
        buf = io.BytesIO()
        images_by_size[sz].save(buf, format="PNG")
        pngs.append(buf.getvalue())
    with open(out_path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(sizes)))
        offset = 6 + 16*len(sizes)
        for i,sz in enumerate(sizes):
            dim = 0 if sz>=256 else sz
            f.write(struct.pack("<BBBBHHII", dim,dim,0,0,1,32,len(pngs[i]),offset))
            offset += len(pngs[i])
        for png in pngs:
            f.write(png)
    print(f"Saved → {out_path}  ({len(sizes)} sizes)")

# ───────────────────────── entry ─────────────────────────

if __name__ == "__main__":
    target_sizes = [256, 128, 64, 48, 32, 16]
    images = {}
    for sz in target_sizes:
        print(f"  {sz}×{sz}…")
        images[sz] = draw_icon(sz)
        if sz == 256:
            images[sz].save(r"C:\Users\Jae\AppData\Local\Temp\icon_v2_preview.png")
            print("  preview saved")
    build_ico(images, r"C:\Users\Jae\Desktop\Book\build\icon.ico")
