"""Square promotional animation, reusing the original trailer's art and renderer."""
from pathlib import Path
import importlib.util
import json
import math
import subprocess
import sys

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent
spec = importlib.util.spec_from_file_location('trailer', SOURCE / 'render.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)
art.W = art.H = 1080
W = H = 1080
FPS, DURATION = 30, 15
BG = ImageOps.fit(Image.open(SOURCE / 'garden-stage.png').convert('RGB'), (W, H))


def frame_at(t):
    frame = BG.copy()
    art.shade(frame)
    if t < 3.5:
        q = art.ease(t / 3)
        art.actor(frame, 'cop', art.lerp(40, 350, q), 860, 340, t, True)
        art.actor(frame, 'robber', art.lerp(380, 730, q), 810, 340, t, True, phase=2)
        art.text(frame, '这次，往哪儿跑？', 232, 76)
        art.text(frame, '保安出动！', 346, 43, '#ffdc65', alpha=art.ease((t - .4) / .4))
    elif t < 6:
        q = t - 3.5
        shade = Image.new('RGBA', (W, H), (8, 31, 40, 90))
        frame.paste(shade, (0, 0), shade)
        art.text(frame, '追得近', 215, 100)
        art.text(frame, '不如堵得准！', 355, 100, '#ffdc65', alpha=art.ease(q / .3))
        art.actor(frame, 'cop', 325, 1010, 440, t)
        art.actor(frame, 'robber', 785, 985, 350, t, True, True, phase=2)
        art.text(frame, '一步调动一人', 510, 43)
    else:
        q = t - 6
        moves = [art.ease((q - .15) / 1.25), art.ease((q - 1.5) / 1), art.ease((q - 2.7) / 1.2)]
        left, upper, right = moves
        positions = [
            ('cop', art.lerp(-40, 230, left), art.lerp(1040, 920, left), 255, .15 < q < 1.4, False, 0),
            ('cop', art.lerp(1120, 850, right), art.lerp(1040, 920, right), 255, 2.7 < q < 3.9, True, 2),
            ('robber', 540 + (8 if q < 4 else 2) * math.sin(t * 6), 825, 275, False, False, 3),
        ]
        if q > 1.5:
            positions.append(('cop', 540, art.lerp(750, 645, upper), 215, q < 2.5, False, 1))
        for a, b, progress in [((-40, 1040), (230, 920), left), ((540, 750), (540, 645), upper), ((1120, 1040), (850, 920), right)]:
            art.trail(frame, a, b, progress)
            if progress > .95:
                art.ring(frame, *b, t, radius=65)
        if q > 4:
            art.ring(frame, 540, 815, t * 1.4, (255, 215, 81), 145)
            art.sparkles(frame, t, 30)
        for kind, x, y, height, running, flip, phase in sorted(positions, key=lambda p: p[2]):
            art.actor(frame, kind, x, y, height, t, running, flip, phase)
        if t < 11.5:
            title = '分路设伏' if q < 1.6 else '守住路口' if q < 4 else '一起收网！'
            art.text(frame, title, 232, 100, '#ffdc65' if q >= 4 else '#fff9e6')
            art.text(frame, '封住每一条退路', 367, 45)
        else:
            art.text(frame, '围捕小队', 135, 170, '#ffdc65', scale=1 + .025 * math.sin((t - 11.5) * 2))
            art.shade(frame, False)
            art.text(frame, '轮到你指挥！', 950, 61)
    if t < 11.5:
        draw = ImageDraw.Draw(frame)
        draw.rounded_rectangle((278, 45, 802, 165), 35, fill='#123452', outline='#ffdc65', width=3)
        art.text(frame, '围捕小队', 67, 72, '#ffdc65')
    return frame


def render():
    output = ROOT / 'cops-robbers-promo-1080x1080.mp4'
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'rawvideo',
           '-pix_fmt', 'rgb24', '-s:v', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', str(SOURCE / 'soundtrack.wav'), '-map', '0:v:0', '-map', '1:a:0',
           '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-threads', '2',
           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k',
           '-af', 'afade=t=out:st=14.25:d=0.75', '-movflags', '+faststart',
           '-t', str(DURATION), str(output)]
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for i in range(FPS * DURATION):
            frame = frame_at(i / FPS)
            assert frame.size == (W, H) and frame.mode == 'RGB'
            process.stdin.write(frame.tobytes())
            if i % (FPS * 3) == 0:
                print(f'Rendered {i / FPS:.0f}/{DURATION}s', flush=True)
    finally:
        process.stdin.close()
    assert process.wait() == 0, 'FFmpeg encoding failed'
    report = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                                                '-show_format', '-of', 'json', str(output)], text=True))
    video = next(s for s in report['streams'] if s['codec_type'] == 'video')
    assert (video['width'], video['height']) == (W, H)
    assert video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p'
    assert video['r_frame_rate'] == '30/1' and abs(float(report['format']['duration']) - DURATION) < .1
    assert any(s['codec_name'] == 'aac' for s in report['streams'])
    (ROOT / 'video-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS: {output}, {output.stat().st_size / 1024 / 1024:.2f} MiB', flush=True)


if __name__ == '__main__':
    if '--preview' in sys.argv:
        board = Image.new('RGB', (1080, 1620))
        for i, t in enumerate([1.5, 4.8, 7, 9.5, 10.7, 13.2]):
            board.paste(frame_at(t).resize((540, 540)), (i % 2 * 540, i // 2 * 540))
        board.save(ROOT / 'storyboard.jpg', quality=94)
    else:
        render()
