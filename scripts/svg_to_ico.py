"""
Convert icon.svg → icon.ico using svglib + reportlab + Pillow
"""
import io, struct
from PIL import Image
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM

SVG_PATH = r"C:\Users\Jae\Desktop\Book\scripts\icon.svg"
ICO_PATH = r"C:\Users\Jae\Desktop\Book\build\icon.ico"
PREVIEW  = r"C:\Users\Jae\AppData\Local\Temp\icon_svg_preview.png"

SIZES = [256, 128, 64, 48, 32, 16]

def svg_to_png_bytes(svg_path, size):
    drawing = svg2rlg(svg_path)
    # Scale drawing to target size
    sx = size / drawing.width
    sy = size / drawing.height
    drawing.width  = size
    drawing.height = size
    drawing.transform = (sx, 0, 0, sy, 0, 0)
    buf = io.BytesIO()
    renderPM.drawToFile(drawing, buf, fmt="PNG", dpi=72)
    buf.seek(0)
    return buf.read()

def build_ico(png_data_list, sizes, out_path):
    with open(out_path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(sizes)))
        offset = 6 + 16 * len(sizes)
        for i, sz in enumerate(sizes):
            dim = 0 if sz >= 256 else sz
            f.write(struct.pack("<BBBBHHII",
                dim, dim, 0, 0, 1, 32, len(png_data_list[i]), offset))
            offset += len(png_data_list[i])
        for data in png_data_list:
            f.write(data)

if __name__ == "__main__":
    all_pngs = []
    for sz in SIZES:
        print(f"  Rendering {sz}×{sz}…")
        data = svg_to_png_bytes(SVG_PATH, sz)
        all_pngs.append(data)
        if sz == 256:
            with open(PREVIEW, "wb") as f:
                f.write(data)
            print(f"  Preview → {PREVIEW}")

    build_ico(all_pngs, SIZES, ICO_PATH)
    print(f"Done → {ICO_PATH}")
