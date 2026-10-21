import { validateScene } from './acoustics.js';

export function addScenePanel(scene, type) {
  if (scene.panels.length >= 8) throw new Error('最多添加 8 个装置。');
  if (!['reflector', 'absorber'].includes(type)) throw new Error('装置类型无效。');
  let index = 1;
  while (scene.panels.some((panel) => panel.id === `panel-${index}`)) index += 1;
  const id = `panel-${index}`;
  return {
    selected: id,
    scene: validateScene({
      ...scene,
      panels: [
        ...scene.panels,
        {
          id,
          type,
          x: scene.width * 0.53 + (scene.panels.length % 4) * 1.5,
          y: scene.height * 0.52,
          angle: 90,
          length: Math.min(scene.height * 0.4, 18),
          reflection: type === 'absorber' ? 0.08 : 0.9,
          scatter: 35,
        },
      ],
    }),
  };
}

export function removeScenePanel(scene, selected) {
  const next = validateScene({
    ...scene,
    panels: scene.panels.filter((panel) => panel.id !== selected),
  });
  return { scene: next, selected: next.panels[0]?.id || 'source' };
}
