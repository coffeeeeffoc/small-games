import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import rawManifest from '../../public/office-scene/manifest.json';
import type { OfficeSampleState } from './model.js';

export type Rect = { x: number; y: number; w: number; h: number };
type Layer = { image: string; draw: Rect };
type Clip = Layer & {
  frames: Rect[];
  duration: number;
  loop: boolean;
  events?: { at: number; name: string }[];
};
type SceneManifest = {
  scene: { width: number; height: number; offsetY: number };
  layers: { background: Layer; foreground: Layer };
  clips: Record<string, Clip>;
  hotspots: { monitor: Rect; phone: Rect; drawer: Rect; file?: Rect; phoneHeld?: Rect };
  screenCorners?: number[][];
  bossPath?: { far: { x: number; y: number }; near: { x: number; y: number } };
};
export const sceneManifest = rawManifest as SceneManifest;
export type SceneImages = Map<string, CanvasImageSource>;

export function phoneHotspot(state: OfficeSampleState): Rect {
  const rest = sceneManifest.hotspots.phone;
  const held = sceneManifest.hotspots.phoneHeld ?? rest;
  const progress = Math.max(0, (state.phoneProgress - 0.32) / 0.68);
  return {
    x: rest.x + (held.x - rest.x) * progress,
    y: rest.y + (held.y - rest.y) * progress,
    w: rest.w + (held.w - rest.w) * progress,
    h: rest.h + (held.h - rest.h) * progress,
  };
}

export async function loadScene(target: CanvasGameTarget): Promise<SceneImages> {
  if (!target.loadImage) throw new Error('当前运行环境尚未提供图片加载能力');
  const names = new Set([
    ...Object.values(sceneManifest.layers).map((layer) => layer.image),
    ...Object.values(sceneManifest.clips).map((clip) => clip.image),
  ]);
  const entries = await Promise.all(
    [...names].map(
      async (name) => [name, await target.loadImage!(`office-scene/${name}`)] as const,
    ),
  );
  return new Map(entries);
}

function frame(
  context: CanvasRenderingContext2D,
  images: SceneImages,
  name: string,
  time: number,
  progress?: number,
) {
  const clip = sceneManifest.clips[name];
  if (!clip) return;
  const image = images.get(clip.image);
  if (!image) return;
  const fraction =
    progress ??
    (clip.loop ? (time % clip.duration) / clip.duration : Math.min(1, time / clip.duration));
  const source =
    clip.frames[
      Math.min(clip.frames.length - 1, Math.max(0, Math.floor(fraction * clip.frames.length)))
    ];
  const { draw } = clip;
  context.drawImage(image, source.x, source.y, source.w, source.h, draw.x, draw.y, draw.w, draw.h);
}

/** All actor poses, props and occlusion share the Blender camera and scene coordinates. */
export function drawScene(
  context: CanvasRenderingContext2D,
  images: SceneImages,
  state: OfficeSampleState,
  phaseTime: number,
  poseTime = state.elapsed,
) {
  context.save();
  context.translate(0, sceneManifest.scene.offsetY);
  const layer = (value: Layer) => {
    const image = images.get(value.image);
    if (image) context.drawImage(image, value.draw.x, value.draw.y, value.draw.w, value.draw.h);
  };
  layer(sceneManifest.layers.background);
  const corners = sceneManifest.screenCorners;
  if (corners?.length === 4) {
    const [a, b, , d] = corners;
    context.save();
    context.transform(
      (b[0] - a[0]) / 128,
      (b[1] - a[1]) / 128,
      (d[0] - a[0]) / 70,
      (d[1] - a[1]) / 70,
      a[0],
      a[1],
    );
    // This camera sees the monitor's back. Its actual content is a labelled HUD inset.
    context.fillStyle = '#243235';
    context.fillRect(0, 0, 128, 70);
    context.fillStyle = '#101b1d';
    for (let vent = 0; vent < 20; vent += 1) context.fillRect(25 + vent * 4, 14, 2, 7);
    context.fillStyle = '#7b8684';
    context.font = '5px sans-serif';
    context.fillText('OFFICE DISPLAY', 43, 44);
    context.restore();
  }
  const boss =
    state.boss === 'safe' || state.boss === 'warning'
      ? 'boss-far'
      : state.boss === 'approach'
        ? 'boss-near'
        : state.boss === 'leave'
          ? 'boss-leave'
          : 'boss-watch';
  context.save();
  const path = sceneManifest.bossPath;
  if (path && (state.boss === 'approach' || state.boss === 'leave')) {
    const distance =
      state.boss === 'approach' ? 1 - Math.min(1, phaseTime / 2) : Math.min(1, phaseTime / 4);
    context.translate((path.far.x - path.near.x) * distance, (path.far.y - path.near.y) * distance);
  }
  frame(
    context,
    images,
    boss,
    phaseTime,
    boss === 'boss-far' ? 0 : state.boss === 'leave' && phaseTime >= 4 ? 1 : undefined,
  );
  context.restore();
  let player = 'work';
  let progress: number | undefined;
  if (state.phone === 'pickup') {
    player = 'pickup';
    progress = state.phoneProgress;
  } else if (state.phone === 'using') player = 'use';
  else if (state.phone === 'stowing') {
    player = state.phoneStowFast ? 'stow-fast' : 'stow';
    progress = 1 - state.phoneProgress;
  } else if (state.status === 'won') player = 'relief';
  else if (state.questionAnswered && state.boss === 'leave') player = 'talk';
  else if (state.boss === 'warning' || state.boss === 'question' || state.status === 'caught')
    player = 'watch';
  frame(context, images, player, poseTime, progress);
  if (state.file !== 'none') {
    const paper = sceneManifest.hotspots.file ?? { x: 192, y: 406, w: 50, h: 36 };
    context.save();
    context.translate(paper.x, paper.y);
    context.transform(1, 0.05, -0.4, 0.48, 0, 0);
    context.fillStyle = '#e5dec7';
    context.fillRect(0, 0, paper.w, paper.h);
    context.fillStyle = '#687269';
    for (let row = 0; row < 4; row += 1) context.fillRect(7, 7 + row * 6, paper.w - 14, 1);
    context.restore();
  }
  if (state.phoneNotice === 'vibrating') {
    const phone = phoneHotspot(state);
    const shake = Math.sin(state.elapsed * 40) * 2;
    context.fillStyle = '#e8c282';
    context.fillRect(phone.x - 5 + shake, phone.y + 15, 2, 18);
    context.fillRect(phone.x + phone.w + 3 + shake, phone.y + 15, 2, 18);
  }
  layer(sceneManifest.layers.foreground);
  context.restore();
}

export function pointIn(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
