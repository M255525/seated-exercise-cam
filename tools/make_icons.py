# PWA 圖示：晨光底＋坐在椅子上舉高雙手的小人（python tools/make_icons.py）
import os
from PIL import Image, ImageDraw
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(out, exist_ok=True)
def draw(size, pad):
    s = 4 * size; im = Image.new('RGB', (s, s), '#fff4d6'); d = ImageDraw.Draw(im)
    x0 = pad * s; w = s - 2 * x0; P = lambda a, b: (x0 + w * a, x0 + w * b)
    d.ellipse([P(.62, .02), P(1.02, .42)], fill='#ffb627')
    d.rectangle([P(0, .82), P(1, 1)], fill='#a8d38f')
    d.rectangle([P(.3, .3), P(.36, .84)], fill='#a86f3e'); d.rectangle([P(.3, .58), P(.72, .63)], fill='#c98b52'); d.rectangle([P(.66, .62), P(.71, .84)], fill='#a86f3e')
    lw = int(w * .06)
    d.line([P(.5, .4), P(.5, .6)], fill='#e8743b', width=int(w * .12))
    d.line([P(.47, .62), P(.63, .62), P(.65, .82)], fill='#3c5a8a', width=lw, joint='curve')
    d.line([P(.46, .4), P(.38, .22), P(.36, .1)], fill='#f1c9a0', width=lw, joint='curve')
    d.line([P(.54, .4), P(.62, .22), P(.64, .1)], fill='#f1c9a0', width=lw, joint='curve')
    d.ellipse([P(.42, .2), P(.58, .36)], fill='#f1c9a0')
    d.chord([P(.42, .19), P(.58, .33)], 180, 360, fill='#d8d8d8')
    return im.resize((size, size), Image.LANCZOS)
draw(192, .06).save(os.path.join(out, 'icon-192.png')); draw(512, .06).save(os.path.join(out, 'icon-512.png')); draw(512, .18).save(os.path.join(out, 'icon-maskable-512.png'))
print('ok')
