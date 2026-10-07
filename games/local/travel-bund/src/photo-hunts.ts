import { onRiver, type V3, type WorldData } from './world.ts';
import { lifeBlocks, streetColliders } from './life.ts';

export type PhotoHunt = {
  id: string;
  title: string;
  landmark: string;
  referenceImage: string;
  clue: string;
  hint: string;
  destination: number;
  start: { position: V3; yaw: number; pitch: number };
  station: { position: V3; radius: number };
  targetHeight: number;
  angleTolerance: number;
  distance: [number, number];
  requires: string | null;
};

// Photography is separate from the walking journal: visiting a building never
// completes a photo, and the same catalog drives selection, unlocks and checking.
export const photoHunts: readonly PhotoHunt[] = [
  {
    id: 'clock-tower',
    title: '钟声入镜',
    landmark: 'customs-house',
    referenceImage: 'assets/photo-hunts/clock-tower.webp',
    clue: '找到照片里的四面钟楼，让钟面回到取景框中央。',
    hint: '沿江边步道向北找江海关，站在它正对面、靠道路一侧，抬头拍钟面。',
    destination: 0,
    start: { position: [-369, 1.775, 100], yaw: 0.12, pitch: 0 },
    station: { position: [-377, 1.775, 37], radius: 18 },
    targetHeight: 78,
    angleTolerance: 0.35,
    distance: [45, 100],
    requires: null,
  },
  {
    id: 'stone-dome',
    title: '石墙与柱廊',
    landmark: 'hsbc-building',
    referenceImage: 'assets/photo-hunts/stone-dome.webp',
    clue: '一排石柱、一层层石墙，找回照片里的对称立面。',
    hint: '从钟楼向南走到原汇丰银行，留在江边步道靠道路一侧，对准建筑正面的柱廊。',
    destination: 0,
    start: { position: [-377, 1.775, 55], yaw: -3.01, pitch: 0 },
    station: { position: [-369, 1.775, 115], radius: 18 },
    targetHeight: 28,
    angleTolerance: 0.35,
    distance: [55, 130],
    requires: 'clock-tower',
  },
  {
    id: 'green-roof',
    title: '绿色屋顶',
    landmark: 'peace-hotel',
    referenceImage: 'assets/photo-hunts/green-roof.webp',
    clue: '铜绿色的坡顶藏在街口，找到它并仰望拍照。',
    hint: '沿步道向北来到南京东路口，在和平饭店正对面、栏杆以内看向绿色屋顶。',
    destination: 1,
    start: { position: [-398, 1.775, -165], yaw: 0.1, pitch: 0 },
    station: { position: [-404, 1.775, -215], radius: 18 },
    targetHeight: 66,
    angleTolerance: 0.33,
    distance: [90, 180],
    requires: 'stone-dome',
  },
  {
    id: 'pearl-skyline',
    title: '隔江的明珠',
    landmark: 'oriental-pearl',
    referenceImage: 'assets/photo-hunts/pearl-skyline.webp',
    clue: '留在外滩，隔着黄浦江找到那座串起圆球的高塔。',
    hint: '沿江回到江海关正对面的步道，留在栏杆内，转向对岸把东方明珠的圆球串收入镜头。',
    destination: 0,
    start: { position: [-369, 1.775, 100], yaw: 0.12, pitch: 0 },
    station: { position: [-377, 1.775, 37], radius: 18 },
    targetHeight: 230,
    angleTolerance: 0.32,
    distance: [800, 1150],
    requires: 'green-roof',
  },
];

export const PHOTO_HUNT_SAVE_KEY = 'travel-bund.photo-hunts.v1';
export type PhotoHuntSave = { version: 1; completed: string[] };
export type PhotoPose = {
  position: V3;
  yaw: number;
  pitch: number;
  grounded: boolean;
  verticalFov?: number;
  aspect?: number;
  landmarkLoaded?: boolean;
};
export type PhotoCheckCode =
  | 'matched'
  | 'already-completed'
  | 'unknown-level'
  | 'locked'
  | 'invalid-pose'
  | 'missing-landmark'
  | 'landmark-loading'
  | 'unsafe-position'
  | 'not-grounded'
  | 'wrong-position'
  | 'wrong-distance'
  | 'wrong-direction'
  | 'wrong-angle'
  | 'outside-frame';
export type PhotoCheck = { ok: boolean; code: PhotoCheckCode; reason: string };
export type PhotoSettlement = PhotoCheck & { save: PhotoHuntSave; newlyCompleted: boolean };
export type PhotoStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function emptyPhotoHuntSave(): PhotoHuntSave {
  return { version: 1, completed: [] };
}

// Only a complete chain of known levels can be restored. Future schemas fail
// closed; legacy arrays and version 0's "passed" list migrate to the catalog.
export function readPhotoHuntSave(value: string | null): PhotoHuntSave {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || 'null');
  } catch {
    return emptyPhotoHuntSave();
  }
  let completed: unknown = parsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const old = parsed as Record<string, unknown>;
    if (old.version !== undefined && old.version !== 0 && old.version !== 1)
      return emptyPhotoHuntSave();
    completed = old.version === 0 ? (old.passed ?? old.completed) : old.completed;
  }
  if (!Array.isArray(completed)) return emptyPhotoHuntSave();
  const known = new Set(completed.filter((id): id is string => typeof id === 'string'));
  const migrated: string[] = [];
  for (const hunt of photoHunts) {
    if (!known.has(hunt.id) || (hunt.requires && !migrated.includes(hunt.requires))) break;
    migrated.push(hunt.id);
  }
  return { version: 1, completed: migrated };
}

export function loadPhotoHuntSave(storage: Pick<PhotoStorage, 'getItem'> | null): PhotoHuntSave {
  try {
    return readPhotoHuntSave(storage?.getItem(PHOTO_HUNT_SAVE_KEY) ?? null);
  } catch {
    return emptyPhotoHuntSave();
  }
}

export function persistPhotoHuntSave(
  storage: Pick<PhotoStorage, 'setItem'> | null,
  save: PhotoHuntSave,
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PHOTO_HUNT_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function isPhotoHuntUnlocked(save: PhotoHuntSave, id: string): boolean {
  const hunt = photoHunts.find((item) => item.id === id);
  return !!hunt && (!hunt.requires || save.completed.includes(hunt.requires));
}

export function photoHuntProgress(save: PhotoHuntSave) {
  const completed = photoHunts.filter((hunt) => save.completed.includes(hunt.id)).length;
  return {
    completed,
    total: photoHunts.length,
    next: photoHunts.find((hunt) => !save.completed.includes(hunt.id)) ?? null,
  };
}

export function photoHuntTarget(hunt: PhotoHunt, data: WorldData): V3 | null {
  const landmark = data.landmarks.find((item) => item.id === hunt.landmark);
  return landmark
    ? [landmark.position[0], landmark.position[1] + hunt.targetHeight, landmark.position[2]]
    : null;
}

// Pose.position matches the walker capsule center reported by Scene. Its camera
// stands .82 m higher; positive YXZ pitch looks up in the existing game camera.
export function cameraAim(position: V3, target: V3) {
  const x = position[0] - target[0],
    z = position[2] - target[2];
  return {
    yaw: Math.atan2(x, z),
    pitch: Math.atan2(target[1] - position[1] - 0.82, Math.hypot(x, z)),
  };
}

function angularDifference(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

// Match the player's .3 m capsule against static authoring boxes, including the
// street-life fixtures. Low pavement boxes are support rather than obstructions.
export function isSafePhotoPosition(position: V3, data: WorldData): boolean {
  const [x, y, z] = position;
  if (
    !position.every(Number.isFinite) ||
    x < data.bounds[0] + 1 ||
    x > data.bounds[2] - 1 ||
    z < data.bounds[1] + 1 ||
    z > data.bounds[3] - 1 ||
    onRiver(x, z, data)
  )
    return false;
  return ![...data.colliders, ...streetColliders(lifeBlocks(data))].some((box) => {
    if (box.position[1] + box.half[1] <= y - 0.8 || box.position[1] - box.half[1] >= y + 0.83)
      return false;
    const dx = x - box.position[0],
      dz = z - box.position[2];
    const localX = dx * Math.cos(box.yaw) - dz * Math.sin(box.yaw);
    const localZ = dx * Math.sin(box.yaw) + dz * Math.cos(box.yaw);
    return Math.abs(localX) < box.half[0] + 0.3 && Math.abs(localZ) < box.half[2] + 0.3;
  });
}

export function validatePhotoHunt(hunt: PhotoHunt, pose: PhotoPose, data: WorldData): PhotoCheck {
  const fail = (code: PhotoCheckCode, reason: string): PhotoCheck => ({ ok: false, code, reason });
  if (
    !pose.position.every(Number.isFinite) ||
    !Number.isFinite(pose.yaw) ||
    !Number.isFinite(pose.pitch)
  )
    return fail('invalid-pose', '镜头还未准备好，请稍后再拍。');
  if (
    (pose.verticalFov !== undefined || pose.aspect !== undefined) &&
    (!Number.isFinite(pose.verticalFov) ||
      !Number.isFinite(pose.aspect) ||
      pose.verticalFov! <= 0 ||
      pose.verticalFov! >= Math.PI ||
      pose.aspect! <= 0)
  )
    return fail('invalid-pose', '镜头还未准备好，请稍后再拍。');
  const target = photoHuntTarget(hunt, data);
  if (!target) return fail('missing-landmark', '目标场景还未准备好，请稍后重试。');
  if (!isSafePhotoPosition(pose.position, data))
    return fail('unsafe-position', '请回到安全的江边步道上再拍照。');
  if (!pose.grounded) return fail('not-grounded', '请站稳后再按快门。');
  if (
    Math.abs(pose.position[1] - hunt.station.position[1]) > 0.6 ||
    Math.hypot(
      pose.position[0] - hunt.station.position[0],
      pose.position[2] - hunt.station.position[2],
    ) > hunt.station.radius
  )
    return fail('wrong-position', '拍摄地点还不对，再沿步道找找照片的视角。');
  const distance = Math.hypot(target[0] - pose.position[0], target[2] - pose.position[2]);
  if (distance < hunt.distance[0] || distance > hunt.distance[1])
    return fail(
      'wrong-distance',
      distance < hunt.distance[0]
        ? '离建筑太近了，退后一些再取景。'
        : '离目标太远了，靠近照片的拍摄位置。',
    );
  const aim = cameraAim(pose.position, target);
  if (angularDifference(pose.yaw, aim.yaw) > hunt.angleTolerance)
    return fail('wrong-direction', '镜头朝向还不对，把照片里的地标转到画面中央。');
  if (Math.abs(pose.pitch - aim.pitch) > hunt.angleTolerance)
    return fail(
      'wrong-angle',
      pose.pitch < aim.pitch
        ? '再抬高一些镜头，让照片里的轮廓回到中央。'
        : '镜头太高了，向下调整一点。',
    );
  if (pose.verticalFov !== undefined && pose.aspect !== undefined) {
    const dx = target[0] - pose.position[0],
      dy = target[1] - pose.position[1] - 0.82,
      dz = target[2] - pose.position[2];
    // Invert the Scene camera's YXZ rotation, then project against its real FOV.
    // Rotation tolerances alone would credit off-screen targets after zooming in.
    const x = Math.cos(pose.yaw) * dx - Math.sin(pose.yaw) * dz;
    const yawZ = Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz;
    const y = Math.cos(pose.pitch) * dy + Math.sin(pose.pitch) * yawZ;
    const z = -Math.sin(pose.pitch) * dy + Math.cos(pose.pitch) * yawZ;
    const halfHeight = -z * Math.tan(pose.verticalFov / 2);
    if (z >= 0 || Math.abs(x) > halfHeight * pose.aspect * 0.9 || Math.abs(y) > halfHeight * 0.9)
      return fail('outside-frame', '目标还没进入取景框，转动镜头或缩小一点再拍。');
  }
  if (pose.landmarkLoaded === false)
    return fail('landmark-loading', '目标建筑还在加载，请稍等片刻再拍。');
  return { ok: true, code: 'matched', reason: '找到了！照片已确认。' };
}

export function settlePhotoHunt(
  save: PhotoHuntSave,
  id: string,
  pose: PhotoPose,
  data: WorldData,
): PhotoSettlement {
  const rejected = (code: PhotoCheckCode, reason: string): PhotoSettlement => ({
    ok: false,
    code,
    reason,
    save,
    newlyCompleted: false,
  });
  const hunt = photoHunts.find((item) => item.id === id);
  if (!hunt) return rejected('unknown-level', '这一关不存在，请重新选择。');
  if (!isPhotoHuntUnlocked(save, id))
    return rejected('locked', '先完成上一张照片，再来寻找这一处风景。');
  const result = validatePhotoHunt(hunt, pose, data);
  if (!result.ok) return { ...result, save, newlyCompleted: false };
  if (save.completed.includes(id))
    return {
      ok: true,
      code: 'already-completed',
      reason: '这一关已经通过，新的照片也拍对了。',
      save,
      newlyCompleted: false,
    };
  return {
    ...result,
    save: { version: 1, completed: [...save.completed, id] },
    newlyCompleted: true,
  };
}

// Content validation is independent of DOM and channels. A new level only needs
// catalog data and its reference photograph, with all references checked here.
export function validatePhotoHunts(
  data: WorldData,
  hunts: readonly PhotoHunt[] = photoHunts,
): string[] {
  const issues: string[] = [],
    ids = new Set<string>();
  for (const hunt of hunts) {
    if (!hunt.id || ids.has(hunt.id)) issues.push(`重复或空关卡 ID：${hunt.id}`);
    ids.add(hunt.id);
  }
  for (const hunt of hunts) {
    const prefix = `${hunt.id}：`;
    if (!data.landmarks.some((item) => item.id === hunt.landmark))
      issues.push(prefix + '地标不存在');
    if (!hunt.referenceImage.endsWith(`/${hunt.id}.webp`))
      issues.push(prefix + '参照照片路径不匹配');
    if (
      !hunt.station.position.every(Number.isFinite) ||
      !Number.isFinite(hunt.station.radius) ||
      hunt.station.radius <= 0 ||
      hunt.station.radius > 25
    )
      issues.push(prefix + '拍摄站位范围无效');
    else if (!isSafePhotoPosition(hunt.station.position, data))
      issues.push(prefix + '拍摄站位不安全');
    if (
      !Number.isFinite(hunt.targetHeight) ||
      hunt.targetHeight <= 0 ||
      !Number.isFinite(hunt.angleTolerance) ||
      hunt.angleTolerance <= 0 ||
      hunt.angleTolerance > 0.5
    )
      issues.push(prefix + '取景角度无效');
    if (
      !hunt.distance.every(Number.isFinite) ||
      hunt.distance[0] <= 0 ||
      hunt.distance[1] <= hunt.distance[0]
    )
      issues.push(prefix + '目标距离无效');
    if (!Number.isInteger(hunt.destination) || hunt.destination < 0 || hunt.destination > 4)
      issues.push(prefix + '落脚点不存在');
    if (
      !hunt.start.position.every(Number.isFinite) ||
      !Number.isFinite(hunt.start.yaw) ||
      !Number.isFinite(hunt.start.pitch)
    )
      issues.push(prefix + '出发视角无效');
    else if (!isSafePhotoPosition(hunt.start.position, data))
      issues.push(prefix + '出发站位不安全');
    const approach = Math.hypot(
      hunt.start.position[0] - hunt.station.position[0],
      hunt.start.position[2] - hunt.station.position[2],
    );
    if (approach < 45 || approach > 80 || approach <= hunt.station.radius)
      issues.push(prefix + '出发点应在站位外45至80米');
    if (hunt.requires && !ids.has(hunt.requires)) issues.push(prefix + '前置关卡不存在');
    const previous = hunts[hunts.indexOf(hunt) - 1]?.id ?? null;
    if (hunt.requires !== previous) issues.push(prefix + '关卡应按目录顺序解锁');
    const chain = new Set<string>([hunt.id]);
    let dependency = hunt.requires;
    while (dependency && ids.has(dependency)) {
      if (chain.has(dependency)) {
        issues.push(prefix + '解锁依赖存在循环');
        break;
      }
      chain.add(dependency);
      dependency = hunts.find((item) => item.id === dependency)?.requires ?? null;
    }
    const target = photoHuntTarget(hunt, data);
    if (target) {
      const distance = Math.hypot(
        target[0] - hunt.station.position[0],
        target[2] - hunt.station.position[2],
      );
      if (distance < hunt.distance[0] || distance > hunt.distance[1])
        issues.push(prefix + '站位无法满足目标距离');
    }
  }
  return issues;
}
