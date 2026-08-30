#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
期待値ラボ — PWA/ストア用アイコン生成

ヘッダーのゴールドの「EV」マーク(.brand .mark)をそのまま素材にする。
    角丸の矩形 + 金のグラデーション(--gold-grad) + 濃色の "EV"

生成物(icons/ 配下):
    icon-192.png          … PWA manifest(any)
    icon-512.png          … PWA manifest(any)/ Playストア掲載用にも使える
    icon-maskable-512.png … PWA manifest(maskable)。安全領域を確保するため
                            マークを縮めて余白を広く取る
    favicon-32.png        … ブラウザタブ用

実行: python tools/make-icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')

# ev-lab.html の :root トークンと同じ値
GOLD_TOP    = (242, 220, 155)   # #F2DC9B  グラデーション 0%
GOLD_MID    = (200, 162,  91)   # #C8A25B  45%
GOLD_BOTTOM = (138, 106,  47)   # #8A6A2F  100%
INK_DARK    = ( 36,  26,   2)   # #241A02  文字色
BG_DARK     = ( 11,  11,  16)   # #0B0B10  maskable の背景

SS = 4  # スーパーサンプリング倍率(縁を滑らかにする)


def gold_gradient(size):
    """--gold-grad と同じ 180deg / 0%・45%・100% の3点グラデーション"""
    img = Image.new('RGB', (1, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        if t <= 0.45:
            u = t / 0.45
            c = tuple(round(GOLD_TOP[i] + (GOLD_MID[i] - GOLD_TOP[i]) * u) for i in range(3))
        else:
            u = (t - 0.45) / 0.55
            c = tuple(round(GOLD_MID[i] + (GOLD_BOTTOM[i] - GOLD_MID[i]) * u) for i in range(3))
        px[0, y] = c
    return img.resize((size, size), Image.NEAREST)


def load_font(px):
    """等幅寄りの太字を探す。見つからなければ既定フォントに落とす"""
    for name in ('consolab.ttf', 'seguisb.ttf', 'arialbd.ttf', 'segoeuib.ttf', 'DejaVuSans-Bold.ttf'):
        for d in (r'C:\Windows\Fonts', '/usr/share/fonts/truetype/dejavu'):
            p = os.path.join(d, name)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, px)
                except Exception:
                    pass
    return ImageFont.load_default()


def draw_mark(size, inset_ratio, radius_ratio, bg=None):
    """角丸の金プレートに EV を描く。
    inset_ratio: 図形の外側に空ける余白の割合(maskableで大きくする)
    radius_ratio: 角丸半径(プレート幅に対する割合)"""
    S = size * SS
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if bg is not None:
        canvas.paste(Image.new('RGBA', (S, S), bg + (255,)), (0, 0))

    inset = int(S * inset_ratio)
    plate = S - inset * 2
    radius = int(plate * radius_ratio)

    # 角丸マスクを作り、グラデーションを切り抜く
    mask = Image.new('L', (plate, plate), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, plate - 1, plate - 1], radius=radius, fill=255)
    grad = gold_gradient(plate)
    canvas.paste(grad, (inset, inset), mask)

    # "EV" を中央に。プレート幅から字面を決める
    d = ImageDraw.Draw(canvas)
    font = load_font(int(plate * 0.42))
    box = d.textbbox((0, 0), 'EV', font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    d.text((inset + (plate - tw) / 2 - box[0], inset + (plate - th) / 2 - box[1]),
           'EV', font=font, fill=INK_DARK + (255,))

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        # (ファイル名, サイズ, 余白, 角丸, 背景)
        ('icon-192.png',          192, 0.045, 0.24, None),
        ('icon-512.png',          512, 0.045, 0.24, None),
        # maskable は端が円などに切り取られるため、安全領域(中央80%)に収める
        ('icon-maskable-512.png', 512, 0.175, 0.26, BG_DARK),
        ('favicon-32.png',         32, 0.02,  0.24, None),
    ]
    for name, size, inset, radius, bg in jobs:
        img = draw_mark(size, inset, radius, bg)
        path = os.path.join(OUT, name)
        img.save(path, 'PNG', optimize=True)
        print('  生成: icons/%s  (%dx%d, %.1fKB)' % (name, size, size, os.path.getsize(path) / 1024))


if __name__ == '__main__':
    main()
