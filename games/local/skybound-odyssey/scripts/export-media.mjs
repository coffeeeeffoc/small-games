import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const file = (p) => path.join(root, p);
const video = file('publishing/gameplay/videos/browser-canvas-1280x720.mp4');
const promo = file('publishing/promo/videos/journey-montage-1280x720.mp4');
const source = file('outputs/gameplay.webm');
for (const dir of ['publishing/gameplay/videos', 'publishing/promo/videos'])
  await mkdir(file(dir), { recursive: true });
const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    stdio: 'inherit',
  });
ffmpeg([
  '-i',
  source,
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '24',
  '-pix_fmt',
  'yuv420p',
  '-an',
  '-movflags',
  '+faststart',
  video,
]);
const labels = [
  '看清前路，绕开障碍',
  '在古树间选择路线',
  '展开翼面，穿越瀑布',
  '顶着横风，稳稳穿门',
  '收拢翼面，冲向浪尖',
];
const cuts = [1, 12, 23, 34, 45];
const filters = ['[0:v]scale=1280:720,setsar=1,fps=30,trim=duration=3,setpts=PTS-STARTPTS[title]'];
for (let i = 0; i < 5; i++)
  filters.push(
    `[1:v]trim=start=${cuts[i]}:duration=3,setpts=PTS-STARTPTS,fps=30,scale=1280:720,setsar=1,drawtext=fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc:text='${labels[i]}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=h-90:box=1:boxcolor=0x123e49bb:boxborderw=16[c${i}]`,
  );
filters.push('[title][c0][c1][c2][c3][c4]concat=n=6:v=1:a=0[out]');
ffmpeg([
  '-loop',
  '1',
  '-i',
  file('publishing/promo/images/cover-1672x941.png'),
  '-i',
  video,
  '-filter_complex',
  filters.join(';'),
  '-map',
  '[out]',
  '-t',
  '18',
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  promo,
]);
const media = [];
async function walk(dir) {
  for (const entry of await readdir(file(dir), { withFileTypes: true })) {
    const p = dir + '/' + entry.name;
    if (entry.isDirectory()) await walk(p);
    else if (/\.(png|mp4)$/.test(p)) {
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration,size:stream=codec_name,width,height,pix_fmt',
            '-of',
            'json',
            file(p),
          ],
          { encoding: 'utf8' },
        ),
      );
      media.push({ path: p, bytes: (await stat(file(p))).size, ...probe });
    }
  }
}
await walk('publishing');
await writeFile(
  file('publishing/media-validation.json'),
  JSON.stringify(
    {
      date: '2026-10-28',
      environment:
        'Desktop Chromium with real CDP touch input; actual Canvas capture, not a physical phone.',
      files: media,
    },
    null,
    2,
  ) + '\n',
);
console.log('Exported genuine gameplay recording and distinct 18-second scene montage.');
