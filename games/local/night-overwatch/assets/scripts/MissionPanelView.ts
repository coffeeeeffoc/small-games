import { Graphics, Node } from 'cc';
import { formatTime } from './core/BattleRecords';
import { FRIENDLY_POSTS, text } from './core/Data';
import { MISSIONS } from './core/MissionCatalog';
import type { Simulation } from './core/Simulation';
import { trainingNextGoal } from './core/TrainingRecords';
import { C, col } from './HudTheme';

import type { HUD } from './HUD';
type MissionPanelViewHost = Pick<
  HUD,
  | 'button'
  | 'buttons'
  | 'compact'
  | 'emblem'
  | 'h'
  | 'icon'
  | 'inset'
  | 'label'
  | 'lang'
  | 'modal'
  | 'online'
  | 'panelFrame'
  | 'pendingSupply'
  | 'plate'
  | 'rect'
  | 'routeGraphic'
  | 'safe'
  | 't'
  | 'timeComparison'
  | 'touch'
  | 'trainingBest'
  | 'w'
>;

// 保留未接入军需页面时的简报、热身结算与方向提示。
export class MissionPanelView {
  private readonly hud: MissionPanelViewHost;
  constructor(hud: MissionPanelViewHost) {
    this.hud = hud;
  }
  render(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const allies = simulation.units.filter((u) => u.friendly).length;
    const training = simulation.mission.mode === 'training';
    this.hud.rect(
      this.hud.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || graphics,
      0,
      0,
      this.hud.w,
      this.hud.h,
      '#06111655',
    );
    const result = key === 'success' || key === 'failure';
    const panelWidth = Math.min(
      result ? 720 : 880,
      this.hud.w - this.hud.safe.left - this.hud.safe.right - 32,
    );
    const panelHeight = Math.min(
      result ? 340 : 540,
      this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 72,
    );
    const panelLeft =
      this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right - panelWidth) / 2;
    const panelTop =
      this.hud.safe.top +
      58 +
      (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 58 - panelHeight) / 2;
    this.hud.panelFrame(
      graphics,
      panelLeft,
      panelTop,
      panelWidth,
      panelHeight,
      key === 'failure' ? C.red : C.mint,
      '#050f1d00',
    );
    const small = result || this.hud.compact || this.hud.w < 600;
    const low = panelHeight < 280;
    const heading =
      key === 'briefing'
        ? training
          ? this.hud.t('火控热身', 'FIRE CONTROL')
          : this.hud.t('夜航守望', 'NIGHT OVERWATCH')
        : key === 'success'
          ? training
            ? this.hud.t('三靶清除，热身完成', 'THREE TARGETS CLEARED')
            : this.hud.t('车队安全抵达', 'CONVOY EXTRACTED')
          : key === 'failure'
            ? training
              ? this.hud.t('热身结束，再试一次', 'WARMUP ENDED · TRY AGAIN')
              : this.hud.t('护送中断', 'ESCORT INTERRUPTED')
            : key === 'orientation'
              ? this.hud.t('横屏，进入火控席', 'ROTATE TO LANDSCAPE')
              : key === 'mission'
                ? this.hud.t('山谷公路撤离', 'VALLEY EVACUATION')
                : this.hud.t('暂停', 'PAUSED');
    const headingLabel = this.hud.label(
      parentNode,
      heading,
      panelLeft + panelWidth / 2,
      panelTop + (small ? 29 : 48),
      small ? 23 : 36,
      panelWidth - 56,
      small ? 46 : 60,
      C.white,
    );
    headingLabel.isBold = true;
    if (result)
      this.hud.button(
        'resultClose',
        '×',
        panelLeft + panelWidth - 52,
        panelTop + 4,
        44,
        44,
        parentNode,
      );
    const bottom = panelTop + panelHeight - 58;
    if (key === 'briefing' || key === 'mission') {
      const split = !small;
      const contentTop = panelTop + (low ? 52 : small ? 65 : 118);
      if (split) {
        this.hud.label(
          parentNode,
          'NIGHT 07  /  ' + text(simulation.mission.name, this.hud.lang),
          panelLeft + panelWidth / 2,
          panelTop + 86,
          12,
          panelWidth - 48,
          24,
          C.mint,
        );
        if (training) {
          for (const [i, target] of [
            this.hud.t('◇ 静止目标 → 榴弹炮', '◇ STATIC → HE'),
            this.hud.t('◇ 巡逻目标 → 弹着提前量', '◇ ROVER → LEAD THE SHOT'),
            this.hud.t('◇ 重甲目标 → 重型榴弹炮', '◇ ARMOR → HEAVY'),
          ].entries())
            this.hud.label(
              parentNode,
              target,
              panelLeft + panelWidth * 0.72,
              contentTop + 52 + i * 56,
              17,
              panelWidth * 0.43,
              44,
              C.amber,
            );
        } else {
          this.hud.routeGraphic(
            graphics,
            panelLeft + panelWidth * 0.48,
            contentTop + 28,
            panelWidth * 0.46,
            panelHeight - 235,
            simulation.progress,
            simulation.mission.map,
            'night',
            simulation.mission.events,
          );
          this.hud.label(
            parentNode,
            this.hud.t('西岭 → 河谷桥 → 东岭营地', 'WEST RIDGE → RIVER → EXTRACTION'),
            panelLeft + panelWidth * 0.71,
            panelTop + panelHeight - 104,
            13,
            panelWidth * 0.5,
            32,
            C.dim,
          );
        }
      }
      const contentCenterX = split ? panelLeft + panelWidth * 0.25 : panelLeft + panelWidth / 2;
      const cardWidth = split ? panelWidth * 0.42 : panelWidth - 36;
      this.hud.label(
        parentNode,
        training
          ? this.hud.t('60 秒内清除 3 种目标', 'CLEAR THREE TARGET TYPES IN 60s')
          : text(simulation.mission.name, this.hud.lang) +
              ' · ' +
              this.hud.t('护送清敌', 'ESCORT & CLEAR'),
        contentCenterX,
        contentTop + 14,
        small ? 16 : 21,
        cardWidth,
        42,
        C.white,
      ).isBold = true;
      for (const [i, message] of [
        training
          ? this.hud.t('练瞄准，友军仍不能误伤', 'Practice aiming; do not hit allies')
          : this.hud.t(
              `□  保护救援车与 ${FRIENDLY_POSTS.length} 处分散据点`,
              `□  Protect rescue & all ${FRIENDLY_POSTS.length} outposts`,
            ),
        text(simulation.mission.description, this.hud.lang).replace(
          /^(白天|DAY) · /,
          this.hud.t('夜航 · ', 'NIGHT OPS · '),
        ),
      ].entries())
        this.hud.label(
          parentNode,
          message,
          contentCenterX,
          contentTop + (low ? 52 : small ? 61 : 90) + (i - 0.5) * 24,
          small ? 14 : 17,
          cardWidth,
          30,
          i === 0 ? C.mint : C.amber,
        );
      this.hud.label(
        parentNode,
        this.hud.touch
          ? this.hud.t('左手拖动瞄准 · 右手按住开火', 'Drag to aim · Hold FIRE with other thumb')
          : this.hud.t(
              '鼠标瞄准 · 按住左键开火 · 1 / 2 / 3 切枪',
              'Mouse aims · Hold left button · 1 / 2 / 3 weapons',
            ),
        contentCenterX,
        contentTop + (low ? 95 : small ? 116 : 159),
        small ? 12 : 14,
        cardWidth,
        low ? 28 : 44,
        C.dim,
      );
      const primaryWidth =
        key === 'briefing'
          ? (panelWidth - (training ? 56 : 64)) / (training ? 2 : 3)
          : Math.min(260, panelWidth - 48);
      if (key === 'briefing') {
        this.hud.button(
          training ? 'missionReturn' : 'missionNext',
          training
            ? this.hud.t('返回护送', 'BACK TO ESCORT')
            : this.hud.t('切换关卡 ↻', 'CHANGE LEVEL ↻'),
          panelLeft + 24,
          bottom,
          primaryWidth,
          44,
          parentNode,
        );
        if (!training)
          this.hud.button(
            'training',
            this.hud.t('火控热身', 'FIRE CONTROL'),
            panelLeft + 32 + primaryWidth,
            bottom,
            primaryWidth,
            44,
            parentNode,
          );
      }
      this.hud.button(
        key === 'briefing' ? 'start' : 'resume',
        key === 'briefing'
          ? training
            ? this.hud.t('开始60秒 →', 'START 60s →')
            : this.hud.t('护送开跑 →', 'BEGIN ESCORT →')
          : this.hud.t('返回关卡', 'RESUME'),
        key === 'briefing'
          ? panelLeft + (training ? 32 + primaryWidth : 40 + 2 * primaryWidth)
          : panelLeft + panelWidth / 2 - primaryWidth / 2,
        bottom,
        primaryWidth,
        44,
        parentNode,
      );
    } else if (key === 'success' || key === 'failure') {
      const success = key === 'success';
      this.hud.emblem(
        graphics,
        panelLeft + 66,
        panelTop + (low ? 73 : 78),
        low ? 15 : 19,
        success ? C.amber : '#c99580',
      );
      const lostOutpost = simulation.failedGroup !== undefined && simulation.failedGroup > 0;
      const mainThreat = Object.entries(simulation.damageByThreat).sort(
        (a, button) => button[1] - a[1],
      )[0];
      const threatAdvice =
        mainThreat &&
        {
          light: [
            `轻车造成 ${Math.round(mainThreat[1])} 伤害。下次用速射追踪，并瞄准前方。`,
            `Light patrol: ${Math.round(mainThreat[1])} damage. Track with Rapid; lead its movement.`,
          ],
          turret: [
            `炮台造成 ${Math.round(mainThreat[1])} 伤害。下次优先用榴弹炮清除固定威胁。`,
            `Turrets: ${Math.round(mainThreat[1])} damage. Clear fixed threats with Burst first.`,
          ],
          heavy: [
            `重甲造成 ${Math.round(mainThreat[1])} 伤害。下次用重炮，预留弹着提前量。`,
            `Armor: ${Math.round(mainThreat[1])} damage. Use Heavy and allow for flight time.`,
          ],
        }[mainThreat[0]];
      this.hud.label(
        parentNode,
        success
          ? this.hud.t(
              `${training ? '热身' : '护送'}评价  ${simulation.rating}`,
              `${training ? 'WARMUP' : 'ESCORT'} RATING  ${simulation.rating}`,
            )
          : this.hud.t(
              training
                ? '热身中断，请整备后再战'
                : simulation.failure === 'vehicle'
                  ? lostOutpost
                    ? `第 ${simulation.failedGroup} 据点全灭`
                    : '救援车被毁'
                  : '行动结束',
              training
                ? 'WARMUP ENDED · REGROUP'
                : simulation.failure === 'vehicle'
                  ? lostOutpost
                    ? `OUTPOST ${simulation.failedGroup} LOST`
                    : 'Rescue vehicle lost'
                  : 'Operation ended',
            ),
        panelLeft + panelWidth / 2,
        panelTop + (low ? 73 : small ? 75 : 120),
        small ? 24 : 44,
        panelWidth - 40,
        low ? 36 : 60,
        success ? C.mint : C.red,
      ).isBold = true;
      const rankState: Record<string, [string, string]> = {
        finished: ['已同步', 'SYNCED'],
        assisted: ['辅助通关', 'ASSISTED'],
        unavailable: ['未同步', 'NOT SYNCED'],
        syncing: ['上传中', 'SYNCING'],
        recording: ['计时中', 'RECORDING'],
        practice: ['练习', 'PRACTICE'],
        'update-required': ['需更新', 'UPDATE'],
        'pending-sync': ['待同步', 'PENDING SYNC'],
        'needs-attention': ['待核对', 'CHECK REQUIRED'],
        'storage-unavailable': ['缓存失败', 'CACHE FAILED'],
      };
      const rank = rankState[this.hud.online?.rankStatus || 'local'] || ['仅本地', 'LOCAL'];
      const statsTop = panelTop + (low ? 110 : small ? 123 : 212);
      const statWidth = (panelWidth - 48) / 3;
      const cleared = simulation.kills + simulation.friendlyKills;
      for (const [i, [value, caption]] of [
        [
          training
            ? `${simulation.time.toFixed(1)}s`
            : formatTime(Math.round((simulation.completionTime ?? simulation.time) * 1000)),
          training
            ? this.hud.trainingBest
              ? this.hud.t(
                  `用时 · 最佳${this.hud.trainingBest.time.toFixed(1)}s`,
                  `TIME · BEST ${this.hud.trainingBest.time.toFixed(1)}s`,
                )
              : this.hud.t('热身用时', 'WARMUP TIME')
            : this.hud.t(`本次用时 · ${rank[0]}`, `TIME · ${rank[1]}`),
        ],
        [
          training
            ? `${simulation.hitShots} / ${simulation.fired}`
            : `${cleared} / ${cleared + simulation.threatsRemaining}`,
          training
            ? this.hud.t(
                `命中弹 / 发射弹 · 耗弹${simulation.ammoSpent}`,
                `HIT / FIRED · AMMO ${simulation.ammoSpent}`,
              )
            : this.hud.t('清除威胁', 'THREATS'),
        ],
        [`${Math.round(simulation.friendlyDamage)}`, this.hud.t('友方损伤', 'FRIENDLY DAMAGE')],
      ].entries()) {
        const x = panelLeft + 24 + statWidth * (i + 0.5);
        this.hud.inset(
          graphics,
          x - statWidth / 2 + 4,
          statsTop - 20,
          statWidth - 8,
          low ? 63 : 68,
          i === 0 ? '#a98c4a80' : '#49657b99',
        );
        if (statWidth >= 170)
          this.hud.icon(
            graphics,
            i === 0 ? 'clock' : i === 1 ? 'target' : 'battle',
            x - statWidth / 2 + 24,
            statsTop + 1,
            17,
            i === 0 ? C.amber : C.mint,
          );
        this.hud.label(
          parentNode,
          value,
          x,
          statsTop,
          small ? 21 : 32,
          statWidth - 8,
          low ? 36 : 44,
          C.white,
        );
        this.hud.label(parentNode, caption, x, statsTop + 29, 12, statWidth - 8, 22, C.dim);
      }
      if (panelHeight >= 310)
        this.hud.label(
          parentNode,
          training
            ? this.hud.t(
                `清靶 ${simulation.kills} / 3${this.hud.trainingBest ? ` · 零友伤最佳 ${this.hud.trainingBest.time.toFixed(1)}s / 耗弹${this.hud.trainingBest.ammoSpent}` : ''}`,
                `CLEARED ${simulation.kills}/3${this.hud.trainingBest ? ` · CLEAN BEST ${this.hud.trainingBest.time.toFixed(1)}s / AMMO ${this.hud.trainingBest.ammoSpent}` : ''}`,
              )
            : this.hud.t(
                `空中 ${simulation.kills} · 地面 ${simulation.friendlyKills}`,
                `AIR ${simulation.kills} · GROUND ${simulation.friendlyKills}`,
              ),
          panelLeft + panelWidth / 2,
          statsTop + 51,
          11,
          training ? panelWidth - 48 : statWidth - 8,
          20,
          C.dim,
        );
      const comparison = !training && success ? this.hud.timeComparison : undefined;
      const advice =
        !training && success && this.hud.online?.rankStatus === 'assisted'
          ? this.hud.t(
              '辅助通关已同步，不计入关卡最快榜',
              'ASSISTED CLEAR SYNCED · EXCLUDED FROM FASTEST TIMES',
            )
          : comparison
            ? this.hud.t(
                `${comparison.newRecord ? (comparison.previousMs === undefined ? '首次完成 · 个人最佳' : '新纪录 · 个人最佳') : '个人最佳'} ${formatTime(comparison.bestMs)}${comparison.previousMs === undefined ? '' : ` · ${comparison.currentMs < comparison.previousMs ? '快' : comparison.currentMs > comparison.previousMs ? '慢' : '持平'}${comparison.currentMs === comparison.previousMs ? '' : ' ' + (Math.abs(comparison.currentMs - comparison.previousMs) / 1000).toFixed(2) + '秒'}`}`,
                `${comparison.newRecord ? 'NEW PERSONAL BEST' : 'PERSONAL BEST'} ${formatTime(comparison.bestMs)}${comparison.previousMs === undefined ? '' : ` · ${(comparison.currentMs - comparison.previousMs) / 1000}s VS PREVIOUS`}`,
              )
            : training
              ? text(trainingNextGoal(simulation), this.hud.lang)
              : success
                ? simulation.rating === 'S'
                  ? this.hud.t(
                      `${text(simulation.mission.name, this.hud.lang)} · ${Math.floor(simulation.time)}s · 耗弹${simulation.ammoSpent}发。再战，减少耗弹。`,
                      `${text(simulation.mission.name, this.hud.lang)} · ${Math.floor(simulation.time)}s · ${simulation.ammoSpent} rounds used. Try fewer rounds.`,
                    )
                  : this.hud.t(
                      '下次目标：保护救援车，零友伤、零友军损失，争取 S。',
                      'Next: protect rescue, avoid friendly damage and losses to aim for S.',
                    )
                : simulation.failure === 'timeout'
                  ? this.hud.t(
                      simulation.threatsRemaining > 0
                        ? `仍有 ${simulation.threatsRemaining} 个威胁未清除。巡视小地图，保护各组友军并清除全部敌人。`
                        : '待命期间倒计时继续。清路后尽快点击「车队继续」。',
                      simulation.threatsRemaining > 0
                        ? `${simulation.threatsRemaining} threats remain. Scan the minimap, protect every group and clear all enemies.`
                        : 'HOLD does not stop the clock. Clear the road and GO.',
                    )
                  : lostOutpost
                    ? this.hud.t(
                        simulation.failureCause === 'friendly'
                          ? `第 ${simulation.failedGroup} 据点因己方火力全灭。开火前检查友军与爆炸范围。`
                          : `第 ${simulation.failedGroup} 据点遭敌袭全灭。每组友军至少保住一辆，救援车存活也不能遗漏据点。`,
                        simulation.failureCause === 'friendly'
                          ? `Friendly fire eliminated outpost ${simulation.failedGroup}. Check allies and blast radius before firing.`
                          : `Enemy fire eliminated outpost ${simulation.failedGroup}. Keep a survivor in every group; rescue survival alone is not enough.`,
                      )
                    : simulation.failureCause === 'friendly'
                      ? this.hud.t(
                          '致命伤来自己方火力。下次开炮前检查范围圈。',
                          'Lost to friendly fire. Check the blast circle before shooting.',
                        )
                      : threatAdvice
                        ? text(threatAdvice, this.hud.lang)
                        : this.hud.t(
                            '敌袭摧毁救援车。清除沿线威胁，必要时让车队待命。',
                            'Lost to hostile fire. Clear nearby threats; HOLD if needed.',
                          );
      this.hud.label(
        parentNode,
        advice,
        panelLeft + panelWidth / 2,
        panelTop + panelHeight - (low ? 74 : small ? 86 : 126),
        small ? 13 : 16,
        panelWidth - 42,
        low ? 24 : small ? 44 : 62,
        C.dim,
      );
      const resultButtonWidth = (panelWidth - (training ? 56 : 64)) / (training ? 2 : 3);
      this.hud.button(
        'home',
        this.hud.t('返回首页', 'HOME'),
        panelLeft + 24,
        bottom,
        resultButtonWidth,
        44,
        parentNode,
      );
      if (!training)
        this.hud.button(
          'retry',
          this.hud.t('再次出动 ↻', 'RETRY ↻'),
          panelLeft + 32 + resultButtonWidth,
          bottom,
          resultButtonWidth,
          44,
          parentNode,
        );
      this.hud.button(
        training
          ? 'retry'
          : success && simulation.mission.id !== MISSIONS.at(-1)!.id
            ? 'missionNext'
            : 'training',
        training
          ? this.hud.t('再练一轮 ↻', 'TRY AGAIN ↻')
          : success && simulation.mission.id !== MISSIONS.at(-1)!.id
            ? this.hud.t('下一关卡 →', 'NEXT LEVEL →')
            : this.hud.t('火控热身', 'FIRE CONTROL'),
        panelLeft + (training ? 32 + resultButtonWidth : 40 + 2 * resultButtonWidth),
        bottom,
        resultButtonWidth,
        44,
        parentNode,
      );
    } else if (key === 'orientation') {
      this.hud.label(
        parentNode,
        '↻',
        panelLeft + panelWidth / 2,
        panelTop + panelHeight * 0.32,
        60,
        panelWidth - 30,
        90,
        C.mint,
      );
      this.hud.label(
        parentNode,
        this.hud.t(
          '双手操作，更容易看清前路。\n关卡已暂停，横屏后继续。',
          'Two thumbs. A clear view of the road.\nLevel paused until landscape.',
        ),
        panelLeft + panelWidth / 2,
        panelTop + panelHeight * 0.53,
        15,
        panelWidth - 30,
        110,
        C.white,
      );
    }
    for (const button of this.hud.buttons.filter(
      (button) => button.label.node.parent === parentNode,
    )) {
      const primary = ['start', 'retry', 'resume'].includes(button.id);
      this.hud.plate(
        graphics,
        button.x,
        button.y,
        button.w,
        button.h,
        primary ? C.amber : '#1c2a2e',
        primary ? C.amber : C.line,
        3,
      );
      button.label.color = col(
        button.id === 'supply' && simulation.buff && !this.hud.pendingSupply
          ? C.dim
          : primary
            ? C.action
            : C.white,
      );
      button.label.isBold = primary;
    }
  }
}
