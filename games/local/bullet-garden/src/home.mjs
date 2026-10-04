import { LEVELS, ENEMIES, SEEDS, BOONS, SKILLS, UPGRADES, WEATHER } from './config.mjs';
import { PERMANENT_UPGRADES, levelFromXp, isLevelUnlocked } from './progression.mjs';
const $ = (id) => document.getElementById(id);
const unlock = (item) => item.unlockPlayerLevel ?? item.unlockLevel ?? 1;
const levels = () => Object.values(LEVELS).sort((a, b) => a.order - b.order);
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
export function renderHome(profile, selectedId, dev, onSelect) {
  const playerLevel = levelFromXp(profile.xp).level;
  $('home-player-level').textContent = `守望者 Lv.${playerLevel} · ${profile.coins} 金币`;
  $('home-progress').textContent = `已通关 ${profile.completed.length} / ${levels().length}`;
  const list = $('home-level-list');
  list.replaceChildren();
  const ordered = levels();
  const selectedIndex = ordered.findIndex((level) => level.id === selectedId);
  for (const level of ordered.slice(
    Math.max(0, selectedIndex - 1),
    Math.max(5, selectedIndex + 4),
  )) {
    const cleared = profile.completed.includes(level.id);
    const available = isLevelUnlocked(profile, level.id);
    const button = node(
      'button',
      `level-card ${cleared ? 'cleared' : available ? 'available' : 'locked'}${selectedId === level.id ? ' selected' : ''}`,
    );
    button.dataset.homeLevel = level.id;
    button.disabled = !dev && !available;
    button.setAttribute('aria-pressed', String(selectedId === level.id));
    const info = node('div', 'level-info');
    info.append(
      node('strong', '', level.name),
      node(
        'small',
        '',
        `${level.waves} 波 · ${level.duration} 秒${level.encounter ? ' · 首领' : ''}`,
      ),
    );
    const status = node('div', 'level-state');
    status.append(
      node(
        'b',
        '',
        cleared ? '已通关 · 可重玩' : available ? '可挑战' : dev ? '开发预览' : '未解锁',
      ),
      node(
        'small',
        '',
        !available
          ? `通关前一关 · Lv.${level.unlockLevel ?? 1}`
          : level.order === 1
            ? '轻松入门'
            : `第 ${level.order} 关`,
      ),
    );
    button.append(node('span', 'level-number', String(level.order).padStart(2, '0')), info, status);
    button.addEventListener('click', () => onSelect(level.id));
    list.append(button);
  }
  const selected = LEVELS[selectedId];
  $('ready-level-details').textContent =
    selected.order === 1
      ? '仅有芽怪：练习移动与自动射击，守住庭院后清空敌人。'
      : selected.lesson || `${selected.name} · 倒计时结束后清空敌人通关。`;
  $('start').textContent =
    `${profile.completed.includes(selectedId) ? '重玩' : '开始'}第 ${selected.order} 关 · ${selected.name} →`;
  const growth = [...Object.values(SKILLS), ...Object.values(BOONS), ...PERMANENT_UPGRADES].filter(
    (item) => unlock(item) > playerLevel,
  );
  const next = Math.min(...growth.map(unlock));
  $('next-unlock').textContent = growth.length
    ? `Lv.${next} · ${[...new Set(growth.filter((item) => unlock(item) === next).map((item) => item.name))].join('、')}`
    : '全部成长路线已开放。前往营地培养枪械、生命与芽灵助手。';
  $('dev-controls').hidden = !dev;
}
const descriptions = {
  monsters: ['怪物图鉴', '每关最多新加入一种怪物，并受守望者等级限制。首关仅有芽怪。'],
  boons: ['成长增益', '局内强化只从当前永久等级已解锁的条目中抽取。地形增益选中后才会生成。'],
  weapons: ['枪械工坊', '花火步枪自动射击。局内选择枪械路线，营地消耗金币提升永久能力。'],
  skills: [
    '能量技能',
    '达到等级后，出发时自动分配技能。技能充能后由你选择落点与时机，每槽最多储存三次。',
  ],
  plants: ['植物图鉴', '对应地形增益在局内选择后才会生效。随着永久等级提升逐步开放。'],
  journey: [
    '成长路线',
    '通关获得永久经验与金币，逐关开放庭院。营地强化、局内增益和能量技能会逐步解锁。',
  ],
};
export function renderCatalog(kind, profile) {
  const playerLevel = levelFromXp(profile.xp).level;
  const [title, description] = descriptions[kind];
  $('catalog-title').textContent = title;
  $('catalog-description').textContent = description;
  $('catalog-shop').hidden = kind !== 'weapons' && kind !== 'journey';
  const content = $('catalog-content');
  content.replaceChildren();
  let definitions =
    kind === 'monsters'
      ? Object.values(ENEMIES)
      : kind === 'plants'
        ? Object.values(SEEDS)
        : kind === 'skills'
          ? Object.values(SKILLS)
          : kind === 'weapons'
            ? [
                ...UPGRADES.filter((item) => item.category === 'weapon'),
                ...PERMANENT_UPGRADES.filter((item) => item.id.startsWith('weapon')),
              ]
            : UPGRADES;
  if (kind === 'journey') {
    const all = [
      ...Object.values(SKILLS),
      ...Object.values(BOONS),
      ...Object.values(WEATHER),
      ...PERMANENT_UPGRADES,
    ];
    definitions = [...new Set(all.map(unlock))]
      .sort((a, b) => a - b)
      .map((level) => ({
        name: `守望者 Lv.${level}`,
        unlockLevel: level,
        description: [
          ...new Set(all.filter((item) => unlock(item) === level).map((item) => item.name)),
        ].join(' · '),
      }));
  }
  for (const item of definitions) {
    const required = unlock(item);
    const article = node('article', `archive-card${playerLevel < required ? ' locked' : ''}`);
    article.append(
      node(
        'span',
        'unlock-label',
        `${playerLevel < required ? '未解锁' : '已解锁'} · Lv.${required}`,
      ),
      node('h3', '', item.name),
      node(
        'p',
        '',
        item.description || `${item.hp} 生命 · 速度 ${item.speed} · 接触伤害 ${item.damage}`,
      ),
    );
    if (kind === 'monsters')
      article.append(node('small', '', `首次出现：第 ${item.unlockStage ?? required} 关`));
    if (item.requires?.length)
      article.append(
        node(
          'small',
          '',
          `局内还需：${item.requires.map((id) => UPGRADES.find((entry) => entry.id === id)?.name || id).join('、')}`,
        ),
      );
    content.append(article);
  }
}
