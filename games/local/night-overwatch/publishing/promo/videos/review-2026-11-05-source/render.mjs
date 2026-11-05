import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const raw = fileURLToPath(new URL('../../../../reports/review-video-2026-11-05/', import.meta.url));
const publishing = fileURLToPath(new URL('../../../', import.meta.url));
const gameplay = publishing + 'gameplay/videos/night-overwatch-combat-2026-11-05-1920x1080.mp4';
const promo = publishing + 'promo/videos/night-overwatch-action-2026-11-05-1920x1080.mp4';
const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    windowsHide: true,
    stdio: 'pipe',
  });
const encode = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p'];
const timeline = [
  ['rapid', 2, 4],
  ['blast', 2, 5],
  ['heavy', 4, 5],
  ['incendiary', 4, 6],
  ['thermal', 3, 7],
];
assert.equal(timeline.reduce((total, [, , duration]) => total + duration, 0) + 3, 30);
const captures = await Promise.all(
  ['continuous', ...timeline.map(([name]) => name)].map((name) =>
    readFile(raw + name + '-capture.json', 'utf8').then(JSON.parse),
  ),
);
assert(captures.every((take) => take.build.sourceHash === captures[0].build.sourceHash));
ffmpeg([
  '-i',
  raw + 'continuous.webm',
  '-vf',
  'fps=30',
  ...encode,
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-movflags',
  '+faststart',
  gameplay,
]);
for (const [name, start, duration] of timeline) {
  ffmpeg([
    '-i',
    raw + name + '.webm',
    '-ss',
    String(start),
    '-t',
    String(duration),
    '-an',
    '-vf',
    'fps=30,setsar=1',
    ...encode,
    raw + name + '-edit.mp4',
  ]);
}
ffmpeg([
  '-loop',
  '1',
  '-framerate',
  '30',
  '-i',
  publishing + 'promo/images/title-1920x1080.png',
  '-t',
  '3',
  '-an',
  '-vf',
  'fade=t=in:st=0:d=0.2,fade=t=out:st=2.5:d=0.5,setsar=1',
  ...encode,
  raw + 'title-edit.mp4',
]);
await writeFile(
  raw + 'concat.txt',
  [...timeline.map(([name]) => name), 'title'].map((name) => `file '${name}-edit.mp4'`).join('\n'),
);
const picture = raw + `picture-${process.pid}.mp4`;
ffmpeg(['-f', 'concat', '-safe', '0', '-i', raw + 'concat.txt', '-c', 'copy', picture]);
const originalMusic = publishing + 'promo/videos/night-overwatch-ignite-2026-11-04-1920x1080.mp4';
ffmpeg([
  '-i',
  picture,
  '-i',
  originalMusic,
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-c',
  'copy',
  '-t',
  '30',
  '-movflags',
  '+faststart',
  promo,
]);
const files = [];
for (const [name, filename] of [
  ['gameplay', gameplay],
  ['promo', promo],
]) {
  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filename],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  assert.equal(video.codec_name, 'h264');
  assert.deepEqual([video.width, video.height], [1920, 1080]);
  assert.equal(video.r_frame_rate, '30/1');
  assert(probe.streams.some((stream) => stream.codec_name === 'aac'));
  assert(Number(probe.format.duration) >= 15 && Number(probe.format.duration) < 120);
  ffmpeg(['-i', filename, '-f', 'null', '-']);
  const bytes = await readFile(filename);
  files.push({
    name,
    path: filename.slice(publishing.length).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: 1920,
    height: 1080,
    duration: Number(probe.format.duration),
    videoCodec: 'h264',
    audioCodec: 'aac',
    decoded: true,
  });
  // Review every second, including the complete opening ten seconds and all frame edges.
  ffmpeg([
    '-i',
    filename,
    '-vf',
    'fps=1,scale=480:270,tile=4x4',
    '-fps_mode',
    'vfr',
    raw + name + '-contact-%02d.jpg',
  ]);
}

const media = await Promise.all([gameplay, promo].map((filename) => readFile(filename)));
const server = createServer((request, response) => {
  const index = Number(request.url.slice(-1));
  if (![0, 1].includes(index)) {
    response.writeHead(404).end();
    return;
  }
  if (request.url.startsWith('/video'))
    response
      .writeHead(200, { 'content-type': 'video/mp4', 'content-length': media[index].length })
      .end(media[index]);
  else
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(`<video muted src="/video${index}"></video>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  // The installed Chrome includes the H.264/AAC codecs used by the upload files.
  browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-angle=d3d11'],
  });
  const page = await browser.newPage();
  for (let index = 0; index < files.length; index++) {
    await page.goto(`http://127.0.0.1:${server.address().port}/play${index}`);
    await page.evaluate(() => document.querySelector('video').play());
    await page.waitForFunction(() => document.querySelector('video').ended, null, {
      timeout: 130000,
    });
    const playback = await page.evaluate(() => {
      const video = document.querySelector('video');
      const quality = video.getVideoPlaybackQuality();
      return {
        ended: video.ended,
        seconds: video.currentTime,
        rate: video.playbackRate,
        frames: quality.totalVideoFrames,
        dropped: quality.droppedVideoFrames,
        error: video.error?.message || null,
      };
    });
    assert(playback.ended && playback.rate === 1 && playback.error === null);
    files[index].playback = playback;
    console.log(JSON.stringify({ file: files[index].path, playback }));
  }
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const evidence = {
  date: '2026-11-05',
  sourceHash: captures[0].build.sourceHash,
  environment: captures[0].environment,
  captures,
  timeline,
  files,
  limits: [
    'Browser WebGL recording, not a physical phone',
    'No platform upload or review in this task',
    'Playback was automated and muted; no human device audio review',
  ],
};
await writeFile(new URL('evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ sourceHash: evidence.sourceHash, files }));
