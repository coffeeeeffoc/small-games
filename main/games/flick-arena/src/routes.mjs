// Content-only recipes. Every route keeps five levels per chapter for the phone picker.
export const routes = Object.freeze([
  { id: 'qingfeng', name: '青锋', rotation: 0.31, spread: 0.92, skill: 0.5, safeRounds: 4 },
  { id: 'zhulang', name: '逐浪', rotation: -0.43, spread: 0.95, skill: 0.58, safeRounds: 4 },
  { id: 'canglan', name: '苍岚', rotation: 0.67, spread: 0.9, skill: 0.66, safeRounds: 3 },
  { id: 'xinghe', name: '星河', rotation: -0.81, spread: 0.94, skill: 0.74, safeRounds: 3 },
  { id: 'tianjue', name: '天绝', rotation: 1.03, spread: 0.88, skill: 0.82, safeRounds: 2 },
]);

export function routeChapters(foundations) {
  const names = ['入门', '群雄', '破阵', '巅峰'];
  return routes.flatMap((route) =>
    foundations.map((chapter, index) => ({
      id: `${route.id}-${chapter.id}`,
      name: `${route.name}·${names[index]}`,
      subtitle: chapter.subtitle,
    })),
  );
}

export function routeLevels(foundations) {
  const styles = ['guard', 'striker', 'trickster', 'balanced'];
  return routes.flatMap((route, tier) =>
    foundations.map((source, slot) => {
      const angle = route.rotation + (slot % 5) * 0.065;
      const rotate = (x, y, scale = 1) => [
        (x * Math.cos(angle) - y * Math.sin(angle)) * scale,
        (x * Math.sin(angle) + y * Math.cos(angle)) * scale,
      ];
      const transform = (item, scale) => {
        const [x, y] = rotate(item.x, item.y, scale);
        return { ...item, x, y };
      };
      const index = foundations.length + tier * foundations.length + slot + 1;
      return {
        ...source,
        id: `${route.id}-${source.id}`,
        index,
        chapter: `${route.id}-${source.chapter}`,
        name: `${route.name}·${source.name}`,
        points: source.points.map(([x, y]) => rotate(x, y, route.spread)),
        // Change clearance and sight lines independently of spawn distance.
        obstacles: source.obstacles.map((item) => ({
          ...transform(item, 0.9 + tier * 0.02),
          radius: item.radius * (0.86 + tier * 0.025),
        })),
        ice: source.ice.map((item) => ({
          ...transform(item, 0.88 + tier * 0.025),
          radius: item.radius * (1.03 + tier * 0.035),
          friction: Math.max(0.25, item.friction - 0.015 * (tier + 1)),
        })),
        gaps: source.gaps.map((item) => ({
          angle: item.angle + angle,
          depth: item.depth + 2 + tier * 1.5,
        })),
        bots: source.bots.map((profile, actor) =>
          profile
            ? {
                style: styles[(tier + slot + actor) % styles.length],
                skill: Math.min(0.98, Math.max(profile.skill, route.skill + (slot % 5) * 0.018)),
              }
            : null,
        ),
        rules: {
          ...source.rules,
          safeRounds: Math.min(source.rules.safeRounds, route.safeRounds),
          shrinkPerRound: source.rules.shrinkPerRound + tier * 0.75,
        },
        challenges: source.challenges.map((goal) => {
          if (goal.type === 'shots') {
            const target = Math.max(5, goal.target - Math.floor((tier + 1) / 2));
            return { ...goal, target, label: `${target} 手内获胜` };
          }
          if (goal.type === 'center') {
            return { ...goal, target: goal.target - tier * 4 };
          }
          return { ...goal };
        }),
      };
    }),
  );
}
