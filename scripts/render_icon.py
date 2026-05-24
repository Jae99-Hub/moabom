"""
Render icon_render.html via Playwright at each target size → ICO
"""
import asyncio, io, struct, pathlib
from PIL import Image
from playwright.async_api import async_playwright

HTML_PATH = pathlib.Path(r"C:\Users\Jae\Desktop\Book\scripts\icon_v3.html").as_uri()
ICO_PATH  = r"C:\Users\Jae\Desktop\Book\build\icon.ico"
PREVIEW   = r"C:\Users\Jae\AppData\Local\Temp\icon_v3_preview.png"
SIZES     = [256, 128, 64, 48, 32, 16]

async def render_all():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page    = await browser.new_page()

        pngs = []
        for sz in SIZES:
            print(f"  {sz}×{sz}…")
            await page.set_viewport_size({"width": sz, "height": sz})
            await page.goto(HTML_PATH)
            await page.wait_for_load_state("networkidle")
            data = await page.screenshot(
                type="png",
                clip={"x": 0, "y": 0, "width": sz, "height": sz},
                omit_background=True,
            )
            pngs.append(data)
            if sz == 256:
                with open(PREVIEW, "wb") as f:
                    f.write(data)
                print(f"  preview → {PREVIEW}")

        await browser.close()
        return pngs

def build_ico(pngs, sizes, out_path):
    with open(out_path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(sizes)))
        offset = 6 + 16 * len(sizes)
        for i, sz in enumerate(sizes):
            dim = 0 if sz >= 256 else sz
            f.write(struct.pack("<BBBBHHII",
                dim, dim, 0, 0, 1, 32, len(pngs[i]), offset))
            offset += len(pngs[i])
        for p in pngs:
            f.write(p)
    print(f"Saved → {out_path}")

async def main():
    pngs = await render_all()
    build_ico(pngs, SIZES, ICO_PATH)

asyncio.run(main())
