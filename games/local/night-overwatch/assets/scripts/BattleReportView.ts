import { Graphics, Label, Node } from 'cc';
import { battleCounts } from './core/BattleRecords';
import { WEAPONS, text } from './core/Data';
import { CATALOG, attackPreview } from './core/Progression';
import type { Simulation } from './core/Simulation';
import { C } from './HudTheme';
import { playerLabel } from './Online';
import { effectEnglish } from './Quartermaster';

import type { HUD } from './HUD';
type BattleReportViewHost = Pick<
  HUD,
  | 'button'
  | 'equipmentOpen'
  | 'h'
  | 'label'
  | 'lang'
  | 'online'
  | 'panelFrame'
  | 'plate'
  | 'safe'
  | 't'
  | 'w'
>;

// 战报展示快照及装配推导值，不暂停或修改正在进行的战斗。
export class BattleReportView {
  private readonly hud: BattleReportViewHost;
  constructor(hud: BattleReportViewHost) {
    this.hud = hud;
  }
  render(parentNode: Node, graphics: Graphics, simulation: Simulation) {
    const panelWidth = Math.min(1060, this.hud.w - this.hud.safe.left - this.hud.safe.right - 24);
    const panelHeight = Math.min(590, this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 20);
    const panelLeft =
      this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right - panelWidth) / 2;
    const panelTop =
      this.hud.safe.top + (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - panelHeight) / 2;
    this.hud.panelFrame(
      graphics,
      panelLeft,
      panelTop,
      panelWidth,
      panelHeight,
      C.mint,
      '#071724f5',
    );
    this.hud.label(
      parentNode,
      this.hud.t('战况', 'BATTLE REPORT'),
      panelLeft + (panelWidth - 96) / 2,
      panelTop + 24,
      20,
      panelWidth - 120,
      32,
      C.mint,
    ).isBold = true;
    this.hud.button(
      'close',
      this.hud.t('关闭', 'CLOSE'),
      panelLeft + panelWidth - 82,
      panelTop + 4,
      70,
      44,
      parentNode,
    ).fontSize = 12;
    for (const [i, id] of ['reportOverview', 'equipment'].entries()) {
      const x = panelLeft + 12 + i * 110;
      const selected = this.hud.equipmentOpen === (i === 1);
      this.hud.plate(
        graphics,
        x,
        panelTop + 49,
        104,
        44,
        selected ? '#23404b' : '#0b1d2a',
        selected ? C.mint : C.line,
        3,
      );
      this.hud.button(
        id,
        i ? this.hud.t('装配', 'LOADOUT') : this.hud.t('概况', 'OVERVIEW'),
        x,
        panelTop + 49,
        104,
        44,
        parentNode,
      ).fontSize = 13;
    }
    if (!this.hud.equipmentOpen) {
      if (simulation.duelMode && this.hud.online) {
        this.hud.online.combatants.forEach((player, i) => {
          const cardWidth = (panelWidth - 36) / 2;
          const x = panelLeft + 12 + i * (cardWidth + 12);
          const units = simulation.units.filter((u) => (i === 0 ? u.friendly : !u.friendly));
          const alive = units.filter((u) => u.hp > 0).length;
          this.hud.plate(
            graphics,
            x,
            panelTop + 102,
            cardWidth,
            panelHeight - 116,
            '#071725',
            i ? C.amber : C.mint,
            4,
          );
          this.hud.label(
            parentNode,
            playerLabel(player).split(' #')[0],
            x + cardWidth / 2,
            panelTop + 137,
            16,
            cardWidth - 24,
            58,
            i ? C.amber : C.mint,
          );
          this.hud.label(
            parentNode,
            this.hud.t(
              `已损失 ${units.length - alive} · 剩余 ${alive}`,
              `LOST ${units.length - alive} · REMAINING ${alive}`,
            ),
            x + cardWidth / 2,
            panelTop + 189,
            14,
            cardWidth - 24,
            44,
            C.white,
          );
        });
        return;
      }
      const columns = [0.17, 0.41, 0.57, 0.73, 0.9];
      const headings =
        this.hud.lang === 'zh'
          ? ['类型', '总数', '存活', '消灭', '未出场']
          : ['TYPE', 'TOTAL', 'ALIVE', 'LOST', 'PENDING'];
      headings.forEach((v, i) =>
        this.hud.label(
          parentNode,
          v,
          panelLeft + panelWidth * columns[i],
          panelTop + 113,
          12,
          panelWidth * 0.18,
          22,
          C.dim,
        ),
      );
      const names = {
        light: ['轻车', 'LIGHT'],
        turret: ['炮台', 'TURRET'],
        heavy: ['重甲', 'ARMOR'],
        rescue: ['救援车', 'RESCUE'],
        escort: ['护卫', 'ESCORT'],
      };
      battleCounts(simulation, false, simulation.duelMode).forEach((row, i) =>
        [
          text(names[row.kind], this.hud.lang),
          row.total,
          row.alive,
          row.destroyed,
          row.pending,
        ].forEach((v, j) =>
          this.hud.label(
            parentNode,
            String(v),
            panelLeft + panelWidth * columns[j],
            panelTop + 140 + i * 23,
            13,
            panelWidth * 0.18,
            23,
            j === 3 ? C.mint : C.white,
          ),
        ),
      );
      this.hud.label(
        parentNode,
        this.hud.t('查看时战斗继续', 'BATTLE CONTINUES'),
        panelLeft + panelWidth / 2,
        panelTop + panelHeight - 17,
        11,
        panelWidth - 24,
        22,
        C.amber,
      );
      return;
    }
    const gap = 12;
    const cardWidth = (panelWidth - 36) / 2;
    const bodyH = panelHeight - 110;
    const font = panelHeight < 380 ? 11 : 14;
    const sides = [simulation.pilotState(), this.hud.online?.view?.enemyEquipment];
    sides.forEach((pilot, side) => {
      const x = panelLeft + 12 + side * (cardWidth + gap);
      const title =
        simulation.duelMode && this.hud.online
          ? playerLabel(this.hud.online.combatants[side]).split(' #')[0]
          : side
            ? this.hud.t('对方', 'OPPONENT')
            : this.hud.t('我方', 'YOU');
      this.hud.plate(graphics, x, panelTop + 100, cardWidth, bodyH, '#0b1d2ae8', C.line, 4);
      let lines: string[] = [title];
      if (!pilot) {
        lines.push(
          this.hud.t(
            simulation.duelMode ? '对方尚未提供装配信息' : '地面敌军 · 无军需插槽',
            simulation.duelMode
              ? 'Opponent equipment is not available'
              : 'Ground forces · no loadout slots',
          ),
        );
      } else {
        const loadout = pilot.loadout;
        const effects = loadout.effects;
        const w = WEAPONS[pilot.selected];
        const ordinary = pilot.selected < 4;
        const preview = attackPreview(ordinary ? effects : []);
        const shots = preview.shots;
        const names = effects.map((effect) =>
          this.hud.lang === 'zh'
            ? CATALOG.find((p) => p.effect === effect)!.name
            : effectEnglish[effect],
        );
        const damage = ordinary
          ? w.damage *
            (1 + (loadout.level >= 3 ? 0.05 : 0) + (effects.includes('power') ? 0.15 : 0))
          : w.damage;
        const interval = ordinary
          ? (w.interval *
              (effects.includes('rate') ? 0.88 : 1) *
              (loadout.level >= 15 ? 0.95 : 1)) /
            (pilot.buff?.kind === 'rate' ? 1.3 : 1)
          : w.interval;
        const radius =
          pilot.selected >= 1 && pilot.selected <= 3 && effects.includes('radius')
            ? w.radius * 1.15
            : w.radius;
        const heat = w.heat * preview.heatMultiplier;
        const formatValue = (v: number) => Number(v.toFixed(2)).toString();
        const skill = effects.includes('tracking')
          ? 'tracking'
          : effects.includes('emp')
            ? 'emp'
            : undefined;
        const remaining = Math.max(0, pilot.skill.activeUntil - simulation.time);
        const cooldown = Math.max(0, pilot.skill.readyAt - simulation.time);
        const gun = pilot.guns[pilot.selected];
        lines = [
          title + ` · Lv.${loadout.level}`,
          this.hud.t('装配：', 'Equipped: ') +
            (names.join(' / ') || this.hud.t('默认配置', 'Default')),
          this.hud.t('装配武器：', 'Equipped weapon: ') + text(w.name, this.hud.lang),
          this.hud.t('默认 → 当前：', 'Default → current: ') +
            this.hud.t(`每轮 1 → ${shots} 弹 · 耗弹 1`, `Projectiles 1 → ${shots} · ammo 1`),
          pilot.selected === 5
            ? this.hud.t(
                '持续3秒 · 每秒80 · 总240 · 重甲×0.85',
                '3s beam · 80/s · total 240 · armor ×0.85',
              )
            : pilot.selected === 4
              ? this.hud.t(
                  '3架无人机 · 12秒后坠毁 · 每架最多144伤害',
                  '3 drones · crash after 12s · up to 144 damage each',
                )
              : shots > 1
                ? this.hud.t(
                    `主弹 ${formatValue(damage)} ＋ ${shots - 1}枚副弹各 ${formatValue(damage * preview.secondaryStrength)}`,
                    `Primary ${formatValue(damage)} + ${shots - 1} secondary × ${formatValue(damage * preview.secondaryStrength)}`,
                  )
                : this.hud.t(
                    `基础伤害 ${formatValue(w.damage)} → ${formatValue(damage)} / 发`,
                    `Base damage ${formatValue(w.damage)} → ${formatValue(damage)} / shot`,
                  ),
          this.hud.t(
            `间隔 ${formatValue(w.interval)} → ${formatValue(interval)} 秒`,
            `Interval ${formatValue(w.interval)} → ${formatValue(interval)} s`,
          ),
          this.hud.t(
            `热量 ${formatValue(w.heat)} → ${formatValue(heat)} / 次 · 范围 ${formatValue(w.radius)} → ${formatValue(radius)}`,
            `Heat ${formatValue(w.heat)} → ${formatValue(heat)} / attack · radius ${formatValue(w.radius)} → ${formatValue(radius)}`,
          ),
          this.hud.t(
            `实时热量 ${Math.round(gun.heat)} · 武器冷却 ${formatValue(gun.cooldown)} 秒`,
            `Heat ${Math.round(gun.heat)} · weapon cooldown ${formatValue(gun.cooldown)} s`,
          ),
          this.hud.t('武器 / 剩余弹药：', 'Weapons / ammo: ') +
            WEAPONS.filter((_, i) => i < 4 || effects.includes(i === 4 ? 'drone' : 'laser'))
              .map((weapon) => {
                const i = WEAPONS.indexOf(weapon);
                return (
                  text(weapon.name, this.hud.lang) +
                  ' ' +
                  (weapon.ammo === Infinity ? '∞' : pilot.guns[i].ammo)
                );
              })
              .join(' / '),
          this.hud.t('技能：', 'Skill: ') +
            (skill
              ? (this.hud.lang === 'zh'
                  ? CATALOG.find((p) => p.effect === skill)!.name
                  : effectEnglish[skill]) +
                this.hud.t(
                  remaining
                    ? ` · 生效 ${Math.ceil(remaining)} 秒`
                    : cooldown
                      ? ` · 冷却 ${Math.ceil(cooldown)} 秒`
                      : ' · 就绪',
                  remaining
                    ? ` · active ${Math.ceil(remaining)}s`
                    : cooldown
                      ? ` · cooldown ${Math.ceil(cooldown)}s`
                      : ' · ready',
                )
              : this.hud.t('未装配', 'None')),
          this.hud.t('临时增益：', 'Temporary buff: ') +
            (pilot.buff
              ? this.hud.t(
                  pilot.buff.kind === 'rate' ? '射速 +30%' : '追踪',
                  pilot.buff.kind === 'rate' ? 'Fire rate +30%' : 'Tracking',
                ) + ` ${Math.ceil(pilot.buff.remaining)}s`
              : this.hud.t('无', 'None')),
        ];
        if (loadout.skipped.length)
          lines.push(
            this.hud.t('未生效：', 'Unavailable: ') +
              loadout.skipped
                .map((id) =>
                  this.hud.lang === 'zh' ? CATALOG.find((p) => p.id === id)?.name || id : id,
                )
                .join(' / '),
          );
      }
      const label = this.hud.label(
        parentNode,
        lines.join('\n'),
        x + cardWidth / 2,
        panelTop + 100 + bodyH / 2,
        font,
        cardWidth - 20,
        bodyH - 12,
        C.white,
      );
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.verticalAlign = Label.VerticalAlign.TOP;
      label.lineHeight = font * 1.45;
      label.overflow = Label.Overflow.SHRINK;
    });
    return;
  }
}
