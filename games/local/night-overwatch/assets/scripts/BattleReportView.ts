import { Graphics, Label, Node, UITransform } from 'cc';
import { battleCounts } from './core/BattleRecords';
import { WEAPONS, text } from './core/Data';
import { CATALOG, attackPreview } from './core/Progression';
import type { Simulation } from './core/Simulation';
import { C, col } from './HudTheme';
import { playerLabel } from './Online';
import { effectEnglish } from './Quartermaster';

import type { HUD } from './HUD';
type BattleReportViewHost = Pick<
  HUD,
  | 'dialog'
  | 'dialogButton'
  | 'equipmentOpen'
  | 'h'
  | 'label'
  | 'lang'
  | 'online'
  | 'listViewport'
  | 'rect'
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
    const h = this.hud, t = (zh: string, en: string) => h.t(zh, en);
    const { x: panelLeft, y: panelTop, w: panelWidth, h: panelHeight } = h.dialog(parentNode, graphics, {
      width: Math.min(860, (h.w - h.safe.left - h.safe.right) * .86), height: 500,
      dim: '#071724e8', keepCapsuleBeside: true,
    });
    h.rect(graphics, panelLeft + 20, panelTop + 19, 3, 18, C.mint, undefined, 1);
    const heading = h.label(parentNode, t('战况', 'BATTLE REPORT'), panelLeft + panelWidth / 2 - 27, panelTop + 28, 18, panelWidth - 122, 30);
    heading.horizontalAlign = Label.HorizontalAlign.LEFT;
    heading.isBold = true;
    h.dialogButton(parentNode, graphics, 'close', t('关闭', 'CLOSE'), panelLeft + panelWidth - 80, panelTop + 4, 72);
    for (const [i, id] of ['reportOverview', 'equipment'].entries()) {
      const selected = h.equipmentOpen === (i === 1), x = panelLeft + 14 + i * 104;
      const tab = h.dialogButton(parentNode, graphics, id, i ? t('装配', 'LOADOUT') : t('概况', 'OVERVIEW'), x, panelTop + 51, 100, selected ? 'secondary' : 'quiet');
      if (selected) {
        tab.isBold = true;
        tab.color = col(C.mint);
        h.rect(graphics, x + 16, panelTop + 90, 68, 2, C.mint);
      }
    }
    const bodyY = panelTop + 102, bodyH = panelHeight - 114, bodyX = panelLeft + 14, bodyW = panelWidth - 28;
    const duel = simulation.duelMode && h.online;
    const cardWidth = duel ? (bodyW - 10) / 2 : bodyW;
    const font = panelHeight < 340 ? 12 : 14;
    const tone = (side: number) => side ? C.amber : C.mint;
    const name = (side: number) => duel ? playerLabel(duel.combatants[side]).split(' #')[0] : t('我方', 'YOU');
    const sideName = (side: number) => duel && duel.spectator ? (side ? t('二号席', 'SEAT 2') : t('一号席', 'SEAT 1')) : (side ? t('对方', 'OPPONENT') : t('我方', 'YOU'));
    const card = (side: number, level?: number) => {
      const x = bodyX + side * (cardWidth + 10);
      h.rect(graphics, x, bodyY, cardWidth, bodyH, '#0b1825', '#31495d', 8);
      h.rect(graphics, x + 10, bodyY + 10, 3, 18, tone(side), undefined, 1);
      const role = sideName(side);
      const roleW = h.lang === 'zh' ? 42 : 70;
      h.label(parentNode, role, x + 18 + (roleW - 4) / 2, bodyY + 20, 10, roleW - 4, 22, tone(side)).horizontalAlign = Label.HorizontalAlign.LEFT;
      if (duel || level !== undefined) {
        const titleW = cardWidth - roleW - 30 - (level === undefined ? 0 : 40);
        const title = h.label(parentNode, duel ? name(side) : t('当前装配', 'CURRENT LOADOUT'), x + 18 + roleW + titleW / 2, bodyY + 20, 14, titleW, 24);
        title.horizontalAlign = Label.HorizontalAlign.LEFT;
        title.enableWrapText = false;
        title.overflow = Label.Overflow.SHRINK;
        title.isBold = true;
        if (level !== undefined) h.label(parentNode, `Lv.${level}`, x + cardWidth - 29, bodyY + 20, 10, 40, 22, C.dim);
      }
      return x;
    };
    const names = {
      infantry: ['步兵', 'INFANTRY'],
      light: ['轻车', 'LIGHT'],
      turret: ['炮台', 'TURRET'],
      heavy: ['重甲', 'ARMOR'],
      rescue: ['救援车', 'RESCUE'],
      escort: ['护卫', 'ESCORT'],
    };
    if (!this.hud.equipmentOpen) {
      if (duel) {
        duel.combatants.forEach((_, i) => {
          const x = card(i);
          const units = simulation.units.filter((u) => (i === 0 ? u.friendly : !u.friendly));
          const alive = units.filter((u) => u.hp > 0).length;
          // 该玩家的战绩 = 对方单位被消灭数；按兵种列出。
          const kills = battleCounts(simulation, i !== 0, true);
          const killed = kills.reduce((sum, row) => sum + row.destroyed, 0);
          const statW = (cardWidth - 20) / 3;
          h.rect(graphics, x + 8, bodyY + 36, cardWidth - 16, 42, '#162a3b', undefined, 5);
          [t('剩余', 'ALIVE'), t('损失', 'LOST'), t('消灭', 'KILLS')].forEach((label, j) => {
            const cx = x + 10 + statW * (j + .5);
            h.label(parentNode, String([alive, units.length - alive, killed][j]), cx, bodyY + 51, 18, statW - 4, 20, j === 2 ? tone(i) : C.white).isBold = true;
            h.label(parentNode, label, cx, bodyY + 69, 10, statW - 4, 14, C.dim);
          });
          const cellW = (cardWidth - 20) / 2, cellH = Math.min(27, (bodyH - 87) / 3);
          kills.forEach((row, j) => {
            const cx = x + 10 + cellW * (j % 2 + .5), cy = bodyY + 83 + cellH * (Math.floor(j / 2) + .5);
            const label = h.label(parentNode, `${text(names[row.kind], h.lang)} ${row.destroyed}/${row.total}`, cx, cy, font, cellW - 4, cellH, C.dim);
            label.enableWrapText = false;
            label.overflow = Label.Overflow.SHRINK;
          });
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
      const rows = battleCounts(simulation, false, simulation.duelMode);
      const rowHeight = Math.min(25, (bodyH - 42) / Math.max(1, rows.length));
      rows.forEach((row, i) =>
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
            bodyY + 23 + rowHeight * (i + .5),
            13,
            panelWidth * 0.18,
            rowHeight,
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
    const sides = [simulation.pilotState(), ...(duel ? [duel.view?.enemyEquipment] : [])];
    sides.forEach((pilot, side) => {
      const x = card(side, pilot?.loadout.level);
      const sections: { title: string; lines: string[] }[] = [];
      if (!pilot) {
        sections.push({ title: '', lines: [t('对方尚未提供装配信息', 'Opponent equipment is not available')] });
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
        const change = (base: number, current: number) => formatValue(base) === formatValue(current)
          ? formatValue(current) : `${formatValue(base)} → ${formatValue(current)}`;
        const skill = effects.includes('tracking')
          ? 'tracking'
          : effects.includes('emp')
            ? 'emp'
            : undefined;
        const remaining = Math.max(0, pilot.skill.activeUntil - simulation.time);
        const cooldown = Math.max(0, pilot.skill.readyAt - simulation.time);
        const gun = pilot.guns[pilot.selected];
        sections.push({ title: t('当前武器：', 'WEAPON: ') + text(w.name, h.lang), lines: [
          ...(shots > 1 ? [t(`每轮 ${shots} 发 · 耗弹 1`, `${shots} projectiles · costs 1 round`)] : []),
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
                    `伤害 ${change(w.damage, damage)} / 发`,
                    `Damage ${change(w.damage, damage)} / shot`,
                  ),
          this.hud.t(
            `间隔 ${change(w.interval, interval)} 秒 · 范围 ${change(w.radius, radius)}`,
            `Interval ${change(w.interval, interval)} s · Range ${change(w.radius, radius)}`,
          ),
          this.hud.t(
            `每次热量 ${change(w.heat, heat)}`,
            `Heat per shot ${change(w.heat, heat)}`,
          ),
          this.hud.t(
            `当前热量 ${Math.round(gun.heat)} · 冷却 ${formatValue(gun.cooldown)} 秒`,
            `Current heat ${Math.round(gun.heat)} · Cooldown ${formatValue(gun.cooldown)} s`,
          ),
        ] });
        sections.push({ title: t('剩余弹药', 'AMMO'), lines: [WEAPONS.flatMap((weapon, i) =>
          i < 4 || effects.includes(i === 4 ? 'drone' : 'laser')
            ? [`${text(weapon.name, h.lang)} ${weapon.ammo === Infinity ? '∞' : pilot.guns[i].ammo}`] : [],
        ).join(' · ')] });
        const modifiers = { title: t('技能与增益', 'SKILLS & MODIFIERS'), lines: [
          names.join(' · ') || t('默认配置', 'Default loadout'),
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
          ...(pilot.buff ? [t('临时增益：', 'Temporary buff: ') +
              this.hud.t(
                  pilot.buff.kind === 'rate' ? '射速 +30%' : '追踪',
                  pilot.buff.kind === 'rate' ? 'Fire rate +30%' : 'Tracking',
                ) + ` ${Math.ceil(pilot.buff.remaining)}s`] : []),
        ] };
        if (loadout.skipped.length)
          modifiers.lines.push(
            this.hud.t('未生效：', 'Unavailable: ') +
              loadout.skipped
                .map((id) =>
                  this.hud.lang === 'zh' ? CATALOG.find((p) => p.id === id)?.name || id : id,
                )
                .join(' / '),
          );
        sections.push(modifiers);
      }
      const width = cardWidth - 28, y = bodyY + 38;
      const blocks = sections.flatMap(section => [
        ...(section.title ? [{ text: section.title, heading: true }] : []),
        { text: section.lines.join('\n'), heading: false },
      ]).map(block => {
        const label = h.label(parentNode, block.text, x + 10 + width / 2, y, font, width, 22, block.heading ? tone(side) : C.white);
        const transform = label.node.getComponent(UITransform)!;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.TOP;
        label.isBold = block.heading;
        label.lineHeight = font + 4;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        transform.setAnchorPoint(.5, 1);
        label.updateRenderData(true);
        return { label, height: transform.contentSize.height + (block.heading ? 2 : 8) };
      });
      const list = h.listViewport(parentNode, `report:loadout:${side}`, { x: x + 8, y, w: cardWidth - 16, h: bodyH - 45 }, blocks.reduce((sum, b) => sum + b.height, 0));
      let offset = list.offset;
      for (const block of blocks) {
        block.label.node.parent = list.n;
        block.label.node.setPosition(x + 10 + width / 2 - h.w / 2, h.h / 2 - y + offset);
        offset -= block.height;
      }
      list.finish();
    });
    return;
  }
}
