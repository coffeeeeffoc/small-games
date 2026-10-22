import { describe, expect, it } from 'vitest';
import { CAMPAIGN, createCampaignDuel, validateCampaign } from './campaign.js';
import { DuelBot } from './duel-bot.js';
import { stepDuel } from './duel-simulation.js';
import { newProgress, readProgress, settle } from './progress.js';

describe('120 关炮战战役', () => {
  it('稳定旧 ID，配置引用合法，章节与战术实际改变对局', () => {
    expect(CAMPAIGN).toHaveLength(120);
    expect(CAMPAIGN.slice(0, 3).map((l) => l.id)).toEqual(['grass-v1', 'twins-v1', 'ridge-v1']);
    expect(new Set(CAMPAIGN.map((l) => l.id)).size).toBe(120);
    expect(
      new Set(CAMPAIGN.map((level) => JSON.stringify({ ...level, id: '', name: '', chapter: 0 })))
        .size,
    ).toBe(120);
    expect(() => validateCampaign([...CAMPAIGN, CAMPAIGN[0]!])).toThrow();
    expect(() => validateCampaign([{ ...CAMPAIGN[0]!, enemyHp: Infinity }])).toThrow();
    expect(() =>
      validateCampaign([{ ...CAMPAIGN[0]!, bot: { ...CAMPAIGN[0]!.bot, reaction: NaN } }]),
    ).toThrow();
    const bunker = createCampaignDuel(CAMPAIGN[7]!);
    expect(bunker.fighters[0].destroyed).toBe(true);
    expect(bunker.fighters[0].station).toBe('bunker');
    expect(bunker.structures.filter((s) => s.side === 0).every((s) => s.hp === 0)).toBe(true);
    const final = createCampaignDuel(CAMPAIGN[119]!);
    expect(final.structures.filter((s) => s.side === 1).every((s) => s.hp === s.maxHp)).toBe(true);
    const heavy = createCampaignDuel(CAMPAIGN[114]!),
      normal = createCampaignDuel(CAMPAIGN[110]!);
    expect(heavy.structures.find((s) => s.side === 1 && s.kind === 'tower')!.hp).toBeGreaterThan(
      normal.structures.find((s) => s.side === 1 && s.kind === 'tower')!.hp,
    );
  });
  it('旧三关进度继续开放第 4 关，120 关连续解锁及奖励幂等', () => {
    const old = {
      ...newProgress(),
      cleared: CAMPAIGN.slice(0, 3).map((l) => l.id),
      materials: 13,
      owned: [0, 1],
      skin: 1,
    };
    const p = readProgress(old);
    expect(p.unlocked).toBe(3);
    expect(p.materials).toBe(13);
    expect(p.skin).toBe(1);
    expect(settle(p, 119)).toBe(0);
    expect(settle(p, 3, true)).toBe(0);
    for (let i = 3; i < CAMPAIGN.length; i++) {
      expect(settle(p, i)).toBe(CAMPAIGN[i]!.reward);
      expect(settle(p, i)).toBe(0);
    }
    expect(p.cleared).toHaveLength(120);
    expect(p.unlocked).toBe(119);
    expect(readProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it('全部关卡在有限生命、弹道、装填、撤退与医疗规则下可获胜', () => {
    const losses: string[] = [];
    // Prove a legal winning tactic, without requiring every level to suit one firing pattern.
    const tactics = [
      { name: '混合攻城', ammo: 'mixed', structureEvery: 4 },
      { name: '爆破弹瞄准炮手', ammo: 'blast', structureEvery: Number.MAX_SAFE_INTEGER },
    ] as const;
    for (const level of CAMPAIGN) {
      const attempts: string[] = [];
      let won = false;
      for (const tactic of tactics) {
        const duel = createCampaignDuel(level),
          player = new DuelBot(0, {
            initialDelay: 0.2,
            reaction: 0.7,
            error: 0.7,
            correction: 0.45,
            structureEvery: tactic.structureEvery,
            relocateEvery: 0,
            ammo: tactic.ammo,
          }),
          enemy = new DuelBot(1, level.bot);
        for (let frame = 0; frame < 60 * 600 && !duel.result; frame++) {
          player.tick(duel);
          enemy.tick(duel);
          stepDuel(duel);
        }
        attempts.push(
          `${tactic.name}:${duel.result?.winner ?? 'timeout'}:${Math.round(duel.fighters[0].hp)}/${Math.round(duel.fighters[1].hp)}`,
        );
        expect(duel.fighters.every((p) => p.medicines >= 0 && p.medicines <= 3)).toBe(true);
        if (duel.result?.winner === 0) {
          won = true;
          break;
        }
      }
      if (!won) losses.push(`${level.id}:${attempts.join(';')}`);
    }
    expect(losses).toEqual([]);
  }, 120000);
});
