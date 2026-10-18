import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('./', import.meta.url)));
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
const ffmpeg = args => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '2', ...args]);
const probe = file => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
const evidence = JSON.parse(readFileSync('source/capture-evidence.json', 'utf8'));
assert.deepEqual(evidence.errors, []);
assert.equal(evidence.segments.length, 3);
assert.ok(evidence.segments.every(segment => segment.phase === 'won'));
ffmpeg(['-i', 'source/key-art-wide.png', '-vf', 'scale=1920:1080:flags=lanczos,setsar=1', '-frames:v', '1', 'promo-landscape-1920x1080.png']);
ffmpeg(['-i', 'source/key-art-square.png', '-vf', 'scale=1440:1440:flags=lanczos,setsar=1', '-frames:v', '1', 'promo-square-1440x1440.png']);

const clips = evidence.segments.map(segment => ({
  start: segment.begin + 0.25,
  frames: Math.floor((segment.end - segment.begin - 0.4) * 30),
}));
assert.ok(clips.every(clip => clip.frames >= 150));
const mainSeconds = clips.reduce((total, clip) => total + clip.frames, 0) / 30;
const duration = mainSeconds + 6;
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Big,Microsoft YaHei,120,&H0058DCFF,&H0058DCFF,&H00522811,&H00522811,-1,0,0,0,100,100,3,0,1,3,2,7,0,0,0,1
Style: Name,Microsoft YaHei,76,&H00FFCE69,&H00FFCE69,&H00522811,&H00522811,-1,0,0,0,100,100,3,0,1,2,2,7,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:01:00.00,Big,,0,0,0,,{\\pos(90,104)}别跑！
Dialogue: 0,0:00:00.00,0:01:00.00,Name,,0,0,0,,{\\pos(97,256)}街区围捕
`;
writeFileSync('source/title.ass', ass);
const graph = [
  '[0:v]scale=1280:720:flags=lanczos,setsar=1,split=2[i][o]',
  "[i]trim=duration=3,setpts=PTS-STARTPTS,zoompan=z='min(zoom+0.00022,1.025)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=2.8:d=0.2[intro]",
  '[1:v]split=3[r0][r1][r2]',
  ...clips.map((clip, index) => `[r${index}]trim=start=${clip.start},setpts=PTS-STARTPTS,fps=30,trim=end_frame=${clip.frames},setpts=PTS-STARTPTS[q${index}]`),
  '[q0][q1][q2]concat=n=3:v=1:a=0,scale=378:672:flags=lanczos,setsar=1[game]',
  `[2:v]scale=1280:720:flags=lanczos,setsar=1,trim=duration=${mainSeconds},setpts=PTS-STARTPTS,boxblur=10:1,drawbox=x=0:y=0:w=iw:h=ih:color=0x112b52@0.91:t=fill[bg]`,
  '[3:v]split=2[c][r]',
  '[c]crop=418:627:0:0,scale=209:314:flags=lanczos[cop]',
  '[r]crop=418:627:0:627,scale=209:314:flags=lanczos[robber]',
  `[bg][cop]overlay=x=103:y='368+5*sin(t*2)':shortest=1[bc]`,
  `[bc][robber]overlay=x=402:y='378-5*sin(t*2)':shortest=1[br]`,
  `[br][game]overlay=826:24:shortest=1,drawbox=x=823:y=21:w=384:h=678:color=0xffdc58:t=3,ass=source/title.ass,fade=t=in:st=0:d=0.2,fade=t=out:st=${mainSeconds - 0.25}:d=0.25[main]`,
  '[o]trim=duration=3,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.25,fade=t=out:st=2.65:d=0.35[outro]',
  '[intro][main][outro]concat=n=3:v=1:a=0,format=yuv420p[v]',
  `[4:a]atrim=duration=${duration},afade=t=in:st=0:d=0.5,afade=t=out:st=${duration - 1.2}:d=1.2[a]`,
].join(';');
writeFileSync('source/video-filter.txt', graph);
ffmpeg(['-filter_complex_threads', '1', '-loop', '1', '-framerate', '30', '-i', 'promo-landscape-1920x1080.png',
  '-i', evidence.video, '-loop', '1', '-framerate', '30', '-i', 'source/home-city.png',
  '-loop', '1', '-framerate', '30', '-i', 'source/characters.png', '-i', 'source/original-score.wav',
  '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', String(duration), '-r', '30',
  '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', 'promo-video-1280x720.mp4']);
ffmpeg(['-i', 'promo-video-1280x720.mp4', '-f', 'null', '-']);

const targets = [
  ['promo-landscape-1920x1080.png', 1920, 1080],
  ['promo-square-1440x1440.png', 1440, 1440],
  ['screenshot-01-home-1080x1920.png', 1080, 1920],
  ['screenshot-02-gameplay-1080x1920.png', 1080, 1920],
  ['screenshot-03-victory-1080x1920.png', 1080, 1920],
  ['promo-video-1280x720.mp4', 1280, 720],
];
const files = targets.map(([file, width, height]) => {
  const media = probe(file), video = media.streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.width, width); assert.equal(video.height, height);
  if (file.endsWith('.mp4')) {
    assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'yuv420p');
    assert.equal(video.r_frame_rate, '30/1');
    assert.ok(Math.abs(Number(media.format.duration) - duration) < 0.1);
    assert.ok(media.streams.some(stream => stream.codec_name === 'aac'));
  }
  return { file, width, height, bytes: readFileSync(file).length,
    ...(file.endsWith('.mp4') ? { seconds: Number(media.format.duration), fps: 30, video: 'H.264/yuv420p', audio: 'AAC, workspace original synthesized score' } : {}) };
});
writeFileSync('manifest.json', JSON.stringify({ game: 'cops-robbers-realtime', title: '别跑！街区围捕',
  artworkText: 'Game title only; no taglines, subtitles or extra copy.', files,
  checks: 'Exact pixels, codecs, duration, full video decode; real input victories and zero browser errors.' }, null, 2));
console.log(JSON.stringify(files, null, 2));
