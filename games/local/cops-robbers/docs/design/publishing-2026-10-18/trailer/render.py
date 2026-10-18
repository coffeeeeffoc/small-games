"""Render the original-art promotional animation; requires Pillow, numpy and FFmpeg."""
from pathlib import Path
from functools import lru_cache
import argparse
import json
import math
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 1920, 1080, 30, 21
NAVY = '#123452'
FONT = 'C:/Windows/Fonts/msyhbd.ttc'
BG = ImageOps.fit(Image.open(ROOT / 'garden-stage.png').convert('RGB'), (W, H))
END = Image.open(ROOT.parent / 'promo-1920x1080.jpg').convert('RGB')
ATLAS = Image.open(ROOT / 'character-atlas.png').convert('RGBA')
SPRITES = {
    'cop': ATLAS.crop((0, 0, 768, 1024)),
    'robber': ATLAS.crop((768, 0, 1536, 1024)),
}
SOFT = ImageEnhance.Brightness(BG.filter(ImageFilter.GaussianBlur(12))).enhance(.64)


def clamp(x):
    return max(0.0, min(1.0, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def lerp(a, b, x):
    return a + (b - a) * x


@lru_cache(maxsize=64)
def lettering(text, size, color='#fff9e6', stroke=5):
    font = ImageFont.truetype(FONT, size)
    box = font.getbbox(text, stroke_width=stroke)
    layer = Image.new('RGBA', (box[2] - box[0] + 36, box[3] - box[1] + 48))
    draw = ImageDraw.Draw(layer)
    origin = (18 - box[0], 16 - box[1])
    draw.text((origin[0] + 2, origin[1] + 7), text, font=font,
              fill=NAVY, stroke_width=stroke + 2, stroke_fill=NAVY)
    draw.text(origin, text, font=font, fill=color, stroke_width=stroke, stroke_fill=NAVY)
    return layer


def text(frame, content, y, size=82, color='#fff9e6', x=None, alpha=1, scale=1):
    layer = lettering(content, size, color)
    if scale != 1:
        layer = layer.resize((round(layer.width * scale), round(layer.height * scale)), Image.Resampling.BICUBIC)
    if alpha < 1:
        layer = layer.copy()
        layer.putalpha(layer.getchannel('A').point(lambda p: round(p * clamp(alpha))))
    frame.paste(layer, (round((W - layer.width) / 2 if x is None else x), round(y)), layer)


def shade(frame, top=True):
    layer = Image.new('RGBA', (W, 340))
    draw = ImageDraw.Draw(layer)
    for y in range(340):
        alpha = round(105 * (1 - y / 340) ** 1.5)
        draw.line((0, y, W, y), fill=(10, 40, 49, alpha))
    if not top:
        layer = ImageOps.flip(layer)
    frame.paste(layer, (0, 0 if top else H - 340), layer)


@lru_cache(maxsize=32)
def sprite(kind, height, flip):
    im = SPRITES[kind]
    if flip:
        im = ImageOps.mirror(im)
    return im.resize((round(im.width * height / im.height), height), Image.Resampling.LANCZOS)


def actor(frame, kind, x, y, height, t, running=False, flip=False, phase=0):
    bob = -abs(math.sin(t * 12 + phase)) * 17 if running else math.sin(t * 3 + phase) * 3
    image = sprite(kind, height, flip)
    angle = math.sin(t * (12 if running else 3) + phase) * (5 if running else 1.6)
    image = image.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    overlay = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(overlay)
    rw = height * .26
    draw.ellipse((x - rw, y - 12, x + rw, y + 16), fill=(29, 49, 32, 65))
    if running:
        for i in range(5):
            q = (t * 2.7 + i / 5) % 1
            px = x + (q * 140 + 35) * (1 if flip else -1)
            py = y - 12 - q * 28
            r = 7 + q * 14
            draw.ellipse((px - r, py - r, px + r, py + r), fill=(255, 245, 210, round((1 - q) * 125)))
    frame.paste(overlay, (0, 0), overlay)
    frame.paste(image, (round(x - image.width / 2), round(y - image.height + bob)), image)


def ring(frame, x, y, t, color=(69, 226, 204), radius=82):
    overlay = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(overlay)
    for i in range(2):
        q = (t * .85 + i * .5) % 1
        r = radius + q * 40
        draw.ellipse((x - r, y - r * .32, x + r, y + r * .32),
                     outline=(*color, round(200 * (1 - q))), width=5)
    frame.paste(overlay, (0, 0), overlay)


def trail(frame, a, b, progress, color='#fff2ad'):
    d = ImageDraw.Draw(frame)
    for i in range(round(12 * clamp(progress))):
        q = (i + .5) / 12
        x, y = lerp(a[0], b[0], q), lerp(a[1], b[1], q)
        d.ellipse((x - 7, y - 5, x + 7, y + 5), fill=color)


def sparkles(frame, t, count=22):
    d = ImageDraw.Draw(frame)
    for i in range(count):
        x = (i * 193 + math.sin(i + t) * 28) % W
        y = (i * 107 - t * (20 + i % 5 * 6)) % H
        r = (math.sin(t * 3 + i) + 1) * 2 + 1
        d.line((x - r * 2, y, x + r * 2, y), fill='#fff8cc', width=2)
        d.line((x, y - r * 2, x, y + r * 2), fill='#fff8cc', width=2)


def zoom(frame, factor, center=(960, 610)):
    width, height = W / factor, H / factor
    left = max(0, min(W - width, center[0] - width / 2))
    top = max(0, min(H - height, center[1] - height / 2))
    return frame.resize((W, H), Image.Resampling.BICUBIC, box=(left, top, left + width, top + height))


def scene(index, t):
    if index == 0:
        frame = BG.copy()
        q = ease(t / 3.7)
        actor(frame, 'cop', lerp(100, 690, q), lerp(990, 810, q), 350, t, True)
        actor(frame, 'robber', lerp(470, 1070, q), lerp(895, 760, q), 350, t, t < 3.7, phase=2)
        frame = zoom(frame, 1.025 + .045 * clamp(t / 4.5))
        shade(frame)
        text(frame, '这次，他往哪儿跑？', 70 + (1 - ease(t / .45)) * 35, 90)
        text(frame, '保安出动！', 210, 42, '#ffdc65', alpha=ease((t - .7) / .4))
        if t > 3.25:
            text(frame, '？', 340, 100, '#ffdc65', x=1160, alpha=ease((t - 3.25) / .25))
        return frame
    if index == 1:
        frame = SOFT.copy()
        sparkles(frame, t, 12)
        actor(frame, 'robber', 1570 - ease(t / 3.5) * 85, 945, 490, t, True, phase=1)
        actor(frame, 'cop', 1090 + ease(t / 3.5) * 60, 960, 650, t, False)
        text(frame, '追得近', 260, 103, x=130, alpha=ease(t / .3))
        text(frame, '不如堵得准！', 420 + (1 - ease((t - .5) / .4)) * 35,
             103, '#ffdc65', x=130, alpha=ease((t - .5) / .4))
        text(frame, '一步调动一人  ·  每步都有讲究', 635, 42, x=145,
             alpha=ease((t - 1.1) / .4))
        return frame
    if index == 2:
        frame = BG.copy()
        left = ease((t - .3) / 1.8)
        upper = ease((t - 2.1) / 1.5)
        right = ease((t - 3.7) / 1.5)
        positions = [
            ('cop', lerp(110, 570, left), lerp(980, 825, left), 265, .3 < t < 2.1, False, 0),
            ('cop', 960, lerp(510, 580, upper), 220, 2.1 < t < 3.6, False, 1),
            ('cop', lerp(1810, 1410, right), lerp(980, 825, right), 265, 3.7 < t < 5.2, True, 2),
            ('robber', 960 + math.sin(t * 3) * (12 if t < 5.3 else 2), 755, 280, False, False, 3),
        ]
        for a, b, q in [((140, 970), (570, 825), left), ((960, 510), (960, 580), upper),
                        ((1790, 975), (1410, 825), right)]:
            trail(frame, a, b, q)
        for x, y, done in [(570, 825, left), (960, 580, upper), (1410, 825, right)]:
            if done > .95:
                ring(frame, x, y, t)
        if t > 5.25:
            ring(frame, 960, 745, t * 1.4, (255, 215, 81), 142)
        for kind, x, y, h, running, flip, phase in sorted(positions, key=lambda p: p[2]):
            actor(frame, kind, x, y, h, t, running, flip, phase)
        frame = zoom(frame, 1.015 + .025 * clamp(t / 7.5))
        shade(frame)
        title = '分路设伏' if t < 2.3 else '守住路口' if t < 5.25 else '一起收网！'
        color = '#ffdc65' if t >= 5.25 else '#fff9e6'
        text(frame, title, 68, 100, color)
        if t >= 5.25:
            sparkles(frame, t, 34)
            text(frame, '默契配合，封住每一条退路', 200, 43)
        else:
            text(frame, '观察岔路，让每位队员各就各位', 200, 43)
        return frame
    frame = zoom(END, 1 + .024 * clamp(t / 5.5), (960, 500))
    sparkles(frame, t, 20)
    shade(frame, False)
    text(frame, '现在，轮到你指挥', 925 + (1 - ease(t / .5)) * 25, 64,
         '#fff9e6', alpha=ease(t / .5))
    return frame


def frame_at(t):
    starts = [0, 4.5, 8, 15.5]
    index = max(i for i, start in enumerate(starts) if t >= start)
    frame = scene(index, t - starts[index])
    if index and t - starts[index] < .3:
        q = ease((t - starts[index]) / .3)
        previous = scene(index - 1, starts[index] - starts[index - 1] + t - starts[index])
        frame = Image.blend(previous, frame, q)
    return frame


def soundtrack():
    sr = 44100
    samples = np.zeros(round(DURATION * sr), dtype=np.float64)
    rng = np.random.default_rng(41)

    def note(at, hz, duration, gain=.08, bass=False):
        n = min(round(duration * sr), len(samples) - round(at * sr))
        if n <= 0:
            return
        t = np.arange(n) / sr
        env = np.minimum(1, t / .008) * np.exp(-t * (5 if bass else 7))
        sound = np.sin(2 * np.pi * hz * t) + .24 * np.sin(4 * np.pi * hz * t)
        samples[round(at * sr):round(at * sr) + n] += sound * env * gain

    beat = 60 / 112
    melody = [76, 79, 81, 79, 76, 72, 74, 76, 79, 83, 81, 79, 76, 74, 72, 74]
    chords = [[48, 52, 55], [45, 48, 52], [53, 57, 60], [55, 59, 62]]
    for k, at in enumerate(np.arange(.1, 19.7, beat)):
        chord = chords[(k // 4) % 4]
        note(float(at), 440 * 2 ** ((chord[0] - 12 - 69) / 12), .45, .12, True)
        for midi in chord:
            note(float(at + beat / 2), 440 * 2 ** ((midi + 12 - 69) / 12), .32, .035)
        for half in range(2):
            midi = melody[(k * 2 + half) % len(melody)]
            note(float(at + half * beat / 2), 440 * 2 ** ((midi - 69) / 12), .3, .055)
        n = min(2200, len(samples) - round(at * sr))
        noise = rng.normal(0, .014, n) * np.exp(-np.arange(n) / 360)
        samples[round(at * sr):round(at * sr) + n] += noise
    for at in [4.5, 8, 10.1, 11.6, 13.25, 15.5]:
        n = round(.23 * sr)
        t = np.arange(n) / sr
        s = np.sin(2 * np.pi * (250 * t + 1800 * t * t)) * np.sin(np.pi * t / .23) ** 2
        start = round(at * sr)
        samples[start:start + n] += s * .055
    for at in [13.3, 15.6, 20.05]:
        for i, midi in enumerate([72, 76, 79, 84]):
            note(at + i * .075, 440 * 2 ** ((midi - 69) / 12), .65, .09)
    fade = np.minimum(1, np.arange(len(samples)) / (sr * .15))
    fade *= np.minimum(1, np.arange(len(samples))[::-1] / (sr * .65))
    samples *= fade
    samples *= .76 / max(np.max(np.abs(samples)), 1e-9)
    assert np.isfinite(samples).all() and np.max(np.abs(samples)) < 1
    stereo = np.column_stack((samples, samples * .96))
    with wave.open(str(ROOT / 'soundtrack.wav'), 'wb') as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(sr)
        out.writeframes((stereo * 32767).astype('<i2').tobytes())


def previews():
    thumbs = []
    for t in [1.5, 6, 9.5, 11.5, 14.2, 18.5]:
        im = frame_at(t)
        im.save(ROOT / f'frame-{t:04.1f}.jpg', quality=94)
        thumb = im.resize((640, 360), Image.Resampling.LANCZOS)
        d = ImageDraw.Draw(thumb)
        d.rounded_rectangle((12, 12, 100, 43), radius=8, fill=NAVY)
        d.text((24, 16), f'{t:04.1f}s', font=ImageFont.truetype(FONT, 19), fill='white')
        thumbs.append(thumb)
    board = Image.new('RGB', (1280, 1080), NAVY)
    for i, im in enumerate(thumbs):
        board.paste(im, (i % 2 * 640, i // 2 * 360))
    board.save(ROOT / 'storyboard.jpg', quality=94)


def render():
    soundtrack()
    output = ROOT / 'cops-robbers-promo-1080p.mp4'
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'rawvideo',
           '-pix_fmt', 'rgb24', '-s:v', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', str(ROOT / 'soundtrack.wav'), '-map', '0:v:0', '-map', '1:a:0',
           '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-threads', '2',
           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.1',
           '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart',
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
           '-t', str(DURATION), str(output)]
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for i in range(FPS * DURATION):
            process.stdin.write(frame_at(i / FPS).tobytes())
            if i % (FPS * 3) == 0:
                print(f'Rendered {i / FPS:.0f}/{DURATION}s', flush=True)
    finally:
        process.stdin.close()
    assert process.wait() == 0, 'FFmpeg encoding failed'
    raw = subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                                   '-of', 'json', str(output)], text=True)
    report = json.loads(raw)
    video = next(s for s in report['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in report['streams'] if s['codec_type'] == 'audio')
    assert video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p'
    assert (video['width'], video['height']) == (1920, 1080)
    assert video['width'] * 9 == video['height'] * 16
    assert float(report['format']['duration']) >= 15
    assert output.stat().st_size < 5_000_000_000
    assert audio['codec_name'] == 'aac'
    (ROOT / 'video-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS: {output.name}, {output.stat().st_size / 1024 / 1024:.2f} MiB', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--previews-only', action='store_true')
    args = parser.parse_args()
    assert END.size == (W, H) and BG.size == (W, H)
    previews()
    if not args.previews_only:
        render()
