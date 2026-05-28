"""
Render icon_v3.html via Playwright at each target size → mixed ICO
(BMP/DIB for sizes < 256, PNG for 256 — rcedit compatible)
"""
import asyncio, io, struct, pathlib
from PIL import Image
from playwright.async_api import async_playwright

HTML_PATH = pathlib.Path(r"C:\Users\Jae\Desktop\Book\scripts\icon_v4.html").as_uri()
ICO_PATH  = r"C:\Users\Jae\Desktop\Book\build\icon.ico"
PNG_DIR   = pathlib.Path(r"C:\Users\Jae\Desktop\Book\build")
PREVIEW   = r"C:\Users\Jae\AppData\Local\Temp\icon_v3_preview.png"
SIZES     = [256, 128, 64, 48, 32, 16]

async def render_all():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page    = await browser.new_page()

        # 항상 256×256으로 렌더링 후 PIL로 다운샘플링
        # (뷰포트를 각 크기로 설정하면 SVG의 좌상단만 잘려서 내용이 사라짐)
        print(f"  Rendering 256×256 (master)…")
        await page.set_viewport_size({"width": 256, "height": 256})
        await page.goto(HTML_PATH)
        await page.wait_for_load_state("networkidle")
        data_256 = await page.screenshot(
            type="png",
            clip={"x": 0, "y": 0, "width": 256, "height": 256},
            omit_background=True,
        )
        await browser.close()

        img_master = Image.open(io.BytesIO(data_256)).convert("RGBA")
        pngs = {}
        for sz in SIZES:
            if sz == 256:
                pngs[sz] = data_256
                out_png = PNG_DIR / f"icon_{sz}.png"
                out_png.write_bytes(data_256)
                with open(PREVIEW, "wb") as f:
                    f.write(data_256)
                print(f"  {sz}×{sz} → saved (master)")
            else:
                img_small = img_master.resize((sz, sz), Image.LANCZOS)
                buf = io.BytesIO()
                img_small.save(buf, format="PNG")
                pngs[sz] = buf.getvalue()
                out_png = PNG_DIR / f"icon_{sz}.png"
                out_png.write_bytes(pngs[sz])
                print(f"  {sz}×{sz} → saved (downsampled)")
        return pngs

def make_bmp_dib(img: Image.Image) -> bytes:
    """Convert RGBA image to BMP DIB bytes for embedding in ICO (no file header)."""
    sz = img.width
    img = img.convert("RGBA")
    pixels = img.tobytes()  # RGBA, top-to-bottom

    # BMP uses BGR(A) bottom-to-top
    rows = []
    for y in range(sz - 1, -1, -1):
        row = b""
        for x in range(sz):
            idx = (y * sz + x) * 4
            r, g, b, a = pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]
            row += bytes([b, g, r, a])
        rows.append(row)

    xor_data = b"".join(rows)  # 4 bytes per pixel, already DWORD-aligned

    # AND mask: all zeros (alpha channel handles transparency)
    row_bytes = ((sz + 31) // 32) * 4
    and_mask  = b"\x00" * (row_bytes * sz)

    # BITMAPINFOHEADER (40 bytes)
    bih = struct.pack("<IiiHHIIiiII",
        40,         # biSize
        sz,         # biWidth
        sz * 2,     # biHeight (doubled for ICO: XOR + AND mask)
        1,          # biPlanes
        32,         # biBitCount
        0,          # biCompression (BI_RGB)
        0,          # biSizeImage
        0, 0,       # biXPels, biYPels
        0, 0,       # biClrUsed, biClrImportant
    )
    return bih + xor_data + and_mask

def build_ico_mixed(pngs: dict, sizes: list, out_path: str):
    """Build ICO: BMP/DIB for sizes < 256, PNG for 256."""
    entries = []
    data_blobs = []

    for sz in sizes:
        raw_png = pngs[sz]
        if sz < 256:
            img  = Image.open(io.BytesIO(raw_png)).convert("RGBA")
            blob = make_bmp_dib(img)
            bpp  = 32
        else:
            blob = raw_png
            bpp  = 32

        entries.append((sz, bpp, blob))
        data_blobs.append(blob)

    n = len(entries)
    header_size = 6 + 16 * n
    offset = header_size

    with open(out_path, "wb") as f:
        # ICONDIR
        f.write(struct.pack("<HHH", 0, 1, n))
        # ICONDIRENTRY for each image
        for (sz, bpp, blob) in entries:
            dim = 0 if sz >= 256 else sz
            f.write(struct.pack("<BBBBHHII",
                dim, dim,       # width, height (0 = 256)
                0,              # color count
                0,              # reserved
                1,              # planes
                bpp,            # bit count
                len(blob),      # size of image data
                offset,         # offset from start of file
            ))
            offset += len(blob)
        # Image data
        for blob in data_blobs:
            f.write(blob)

    print(f"\nSaved ICO → {out_path} ({len(open(out_path,'rb').read()):,} bytes)")

async def main():
    print("Rendering icon sizes…")
    pngs = await render_all()
    print("\nBuilding ICO (BMP for <256, PNG for 256)…")
    build_ico_mixed(pngs, SIZES, ICO_PATH)

asyncio.run(main())
