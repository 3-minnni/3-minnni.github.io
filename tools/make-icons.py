#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
期待値ラボ — PWA/ストア用アイコン・画像の生成

モチーフは起動画面と同じ「収束」。
    試行を重ねるほど実測が期待値に近づく = 振れ幅を減らしながら金の水平線に収まる軌跡
以前は金地に「EV」の文字だったが、どのアプリでも成立してしまう形だったため、
アプリの主題そのものを図案にした。

生成物(icons/ 配下):
    icon-192.png            … PWA manifest(any)
    icon-512.png            … PWA manifest(any) / Playストア掲載用
    icon-maskable-512.png   … PWA manifest(maskable)
    favicon-32.png          … ブラウザタブ用
    feature-1024x500.png    … Playストアのフィーチャーグラフィック
    og-1200x630.png         … SNSで共有されたときのカード画像(OGP)

暗い壁紙だと近黒の地色が背景に沈んで輪郭が消えるため、
通常アイコンには金の細い縁取りを入れている(48pxでも1px残る太さにしてある)。
maskable は端末ごとに円・角丸・四角と切り抜き形が変わり、角丸に沿った縁取りは
崩れてしまうので、代わりに安全領域(中央80%)の内側に金のリングを置いている。

実行: python tools/make-icons.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')

# ev-lab.html の :root トークンと同じ値
GOLD_TOP    = (242, 220, 155)   # #F2DC9B  グラデーション 0%
GOLD_MID    = (200, 162,  91)   # #C8A25B  45%
GOLD_BOTTOM = (138, 106,  47)   # #8A6A2F  100%
GOLD_HI     = (232, 200, 121)   # #E8C879  軌跡の色
BG_PLATE    = ( 26,  23,  18)   # #1A1712  起動画面と同じ暖かい近黒
INK         = (242, 239, 230)   # #F2EFE6

SS = 4          # スーパーサンプリング倍率(縁を滑らかにする)
BORDER = 0.018  # 縁取りの太さ(1辺に対する割合)。48pxで1px残る下限


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


def load_font(px, bold=True):
    """日本語の見出し用フォント。無ければ既定に落とす"""
    for name in ('YuGothB.ttc', 'meiryob.ttc', 'meiryo.ttc', 'YuGothM.ttc'):
        p = os.path.join(r'C:\Windows\Fonts', name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, px)
            except Exception:
                pass
    return ImageFont.load_default()


def polyline(d, pts, w, color):
    """端と関節を丸めた太い折れ線"""
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i + 1]], fill=color, width=w)
    r = w / 2
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def draw_convergence(d, left, right, mid, amp, line_w, trace_w, dot_r):
    """期待値の線と、そこへ収束していく軌跡。
    振動は3山まで見せる(それ以上細かくすると小さいサイズで潰れる)"""
    d.line([(left, mid), (right, mid)], fill=GOLD_BOTTOM + (255,), width=line_w)
    pts = []
    for i in range(200):
        t = i / 199
        y = amp * math.exp(-2.6 * t) * math.sin(t * 19)
        pts.append((left + (right - left) * t, mid - y))
    polyline(d, pts, trace_w, GOLD_HI + (255,))
    d.ellipse([right - dot_r, mid - dot_r, right + dot_r, mid + dot_r], fill=GOLD_TOP + (255,))


def icon_square(size, radius_ratio=0.24, border=BORDER):
    """通常アイコン。角丸の近黒プレート + 金の縁取り + 収束の図案"""
    S = size * SS
    rad = int(S * radius_ratio)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    body = Image.new('L', (S, S), 0)
    ImageDraw.Draw(body).rounded_rectangle([0, 0, S - 1, S - 1], radius=rad, fill=255)
    img.paste(Image.new('RGBA', (S, S), BG_PLATE + (255,)), (0, 0), body)

    d = ImageDraw.Draw(img)
    pad = S * 0.15
    draw_convergence(d, pad, S - pad, S * 0.5, S * 0.30,
                     max(2, int(S * 0.026)), max(3, int(S * 0.055)), S * 0.055)

    if border > 0:
        bw = max(1, int(S * border))
        ring = Image.new('L', (S, S), 0)
        rd = ImageDraw.Draw(ring)
        rd.rounded_rectangle([0, 0, S - 1, S - 1], radius=rad, fill=255)
        rd.rounded_rectangle([bw, bw, S - 1 - bw, S - 1 - bw], radius=max(1, rad - bw), fill=0)
        img.paste(gold_gradient(S), (0, 0), ring)

    return img.resize((size, size), Image.LANCZOS)


def icon_maskable(size):
    """maskable アイコン。切り抜き形が端末ごとに違うので、
    安全領域(中央80%の円)の内側に収まる金のリングで輪郭を作る。
    こうすると円・角丸・四角のどれで切られても形が破綻しない。"""
    S = size * SS
    img = Image.new('RGBA', (S, S), BG_PLATE + (255,))   # 隅まで塗る(切り抜かれる前提)
    d = ImageDraw.Draw(img)

    ring_d = S * 0.76                 # 安全領域(80%)の内側に収める
    r = ring_d / 2
    cx = cy = S / 2
    w = max(2, int(S * 0.020))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GOLD_MID + (255,), width=w)

    pad = cx - r * 0.72
    draw_convergence(d, pad, S - pad, cy, S * 0.20,
                     max(2, int(S * 0.020)), max(3, int(S * 0.042)), S * 0.042)
    return img.resize((size, size), Image.LANCZOS)


def fit_font(d, text, max_w, start_px, floor_px=10):
    """指定幅に収まるまで文字サイズを落とす。
    banner は文字と図案の領域を分けているので、はみ出すと図案に重なってしまう。"""
    px = start_px
    while px > floor_px:
        f = load_font(px)
        b = d.textbbox((0, 0), text, font=f)
        if b[2] - b[0] <= max_w:
            return f
        px -= 2
    return load_font(floor_px)


def feature_graphic(w=1024, h=500):
    """Playストアのフィーチャーグラフィック。
    左半分に文字、右半分に収束の図案。両者の領域は重ねない
    (以前は説明文の上を軌跡が横切って読めなくなっていた)。"""
    W, H = w * 2, h * 2                       # 2倍で描いて縮小
    img = Image.new('RGB', (W, H), BG_PLATE)
    d = ImageDraw.Draw(img)

    TEXT_L, TEXT_R = W * 0.065, W * 0.50      # 文字を置く帯
    ART_L, ART_R = W * 0.545, W * 0.945       # 図案を置く帯
    tw = TEXT_R - TEXT_L

    draw_convergence(d, ART_L, ART_R, H * 0.5, H * 0.30,
                     max(2, int(H * 0.010)), max(3, int(H * 0.026)), H * 0.026)

    f1 = fit_font(d, '期待値ラボ', tw, int(H * 0.150))
    f2 = fit_font(d, '賭ける前に、数字を見る。', tw, int(H * 0.058))
    f3 = fit_font(d, 'パチンコ・スロット・ガチャの期待値を計算', tw, int(H * 0.042))

    y = H * 0.30
    d.text((TEXT_L, y), '期待値ラボ', font=f1, fill=GOLD_HI)
    y += f1.size * 1.42
    d.text((TEXT_L, y), '賭ける前に、数字を見る。', font=f2, fill=INK)
    y += f2.size * 1.55
    d.text((TEXT_L, y), 'パチンコ・スロット・ガチャの期待値を計算', font=f3, fill=(166, 163, 180))

    d.rectangle([0, H - int(H * 0.016), W, H], fill=GOLD_MID)   # 下辺の金の帯
    return img.resize((w, h), Image.LANCZOS)


def og_image(w=1200, h=630):
    """SNSで共有されたときに出るカード画像。
    推奨比率は 1.91:1 で、ストア用バナー(1024x500 = 2.05:1)とは違うため別に作る。
    小さく表示されても読めるよう、要素は名前・一言・図案の3つに絞る。"""
    W, H = w * 2, h * 2
    img = Image.new('RGB', (W, H), BG_PLATE)
    d = ImageDraw.Draw(img)

    # 図案は下半分に大きく敷く
    draw_convergence(d, W * 0.10, W * 0.90, H * 0.70, H * 0.17,
                     max(2, int(H * 0.008)), max(3, int(H * 0.020)), H * 0.020)

    tw = W * 0.80
    f1 = fit_font(d, '期待値ラボ', tw, int(H * 0.16))
    f2 = fit_font(d, '賭ける前に、数字を見る。', tw, int(H * 0.062))
    f3 = fit_font(d, 'パチンコ・スロット・ガチャの期待値シミュレータ', tw, int(H * 0.040))

    def center(text, font, y, fill):
        b = d.textbbox((0, 0), text, font=font)
        d.text(((W - (b[2] - b[0])) / 2 - b[0], y), text, font=font, fill=fill)

    center('期待値ラボ', f1, H * 0.13, GOLD_HI)
    center('賭ける前に、数字を見る。', f2, H * 0.34, INK)
    center('パチンコ・スロット・ガチャの期待値シミュレータ', f3, H * 0.44, (166, 163, 180))

    d.rectangle([0, H - int(H * 0.014), W, H], fill=GOLD_MID)
    return img.resize((w, h), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-192.png',          lambda: icon_square(192)),
        ('icon-512.png',          lambda: icon_square(512)),
        ('icon-maskable-512.png', lambda: icon_maskable(512)),
        ('favicon-32.png',        lambda: icon_square(32, border=0.030)),  # 小さいので枠を厚めに
        ('feature-1024x500.png',  lambda: feature_graphic()),
        ('og-1200x630.png',       lambda: og_image()),
    ]
    for name, fn in jobs:
        img = fn()
        path = os.path.join(OUT, name)
        img.save(path, 'PNG', optimize=True)
        print('  生成: icons/%s  (%dx%d, %.1fKB)'
              % (name, img.width, img.height, os.path.getsize(path) / 1024))


if __name__ == '__main__':
    main()
