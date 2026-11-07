import { Graphics, Label, Node, SpriteFrame, UITransform } from 'cc';
import { text } from './core/Data';
import { MISSIONS } from './core/MissionCatalog';
import { missionUnlocked } from './core/MissionProgress';
import type { Simulation } from './core/Simulation';
import { C, col } from './HudTheme';
import { playerLabel } from './Online';

import type { HUD } from './HUD';
type HomeViewHost = Pick<
  HUD,
  | 'artOverlay'
  | 'button'
  | 'buttons'
  | 'coverImage'
  | 'developer'
  | 'gradient'
  | 'h'
  | 'icon'
  | 'image'
  | 'label'
  | 'lang'
  | 'listScroll'
  | 'listViewport'
  | 'missionFocus'
  | 'missionProgress'
  | 'missionsOpen'
  | 'modal'
  | 'online'
  | 'plate'
  | 'rect'
  | 'routeGraphic'
  | 'safe'
  | 't'
  | 'w'
>;

// 首页与任务横向列表共用已有 HUD 入口，关卡选择和解锁仍由控制器处理。
export class HomeView {
  private readonly hud: HomeViewHost;
  private readonly titleArtwork: () => SpriteFrame | undefined;
  private readonly missionArtwork: () => readonly SpriteFrame[];
  constructor(
    hud: HomeViewHost,
    titleArtwork: () => SpriteFrame | undefined,
    missionArtwork: () => readonly SpriteFrame[],
  ) {
    this.hud = hud;
    this.titleArtwork = titleArtwork;
    this.missionArtwork = missionArtwork;
  }
  renderHome(parentNode: Node, graphics: Graphics, simulation: Simulation) {
    const width = this.hud.w;
    const height = this.hud.h;
    const left = this.hud.safe.left + 24;
    const right = width - this.hud.safe.right - 24;
    const lightLabel = (_number: number) => this.hud.t('夜航', 'NIGHT OPS');
    const missionNumber =
      Math.max(
        0,
        MISSIONS.findIndex((mission) => mission.id === simulation.mission.id),
      ) + 1;
    this.hud.rect(
      this.hud.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || graphics,
      0,
      0,
      this.hud.w,
      this.hud.h,
      '#07121c28',
    );
    if (!this.hud.missionsOpen) {
      const compact = height < 420;
      const wide = right - left >= 680;
      const menuTop = height - this.hud.safe.bottom - (wide ? 76 : 114);
      const titleWidth = Math.min(wide ? 500 : 390, (right - left) * 0.62);
      const titleHeight = titleWidth / 3;
      const titleTop = Math.min(
        this.hud.safe.top + (compact ? 70 : 112),
        menuTop - titleHeight - 46,
      );
      // The title is an authored transparent metal wordmark, not a font approximation.
      if (this.titleArtwork() && this.hud.lang === 'zh')
        this.hud.image(
          parentNode,
          'MetalWordmark',
          this.titleArtwork(),
          left - 8,
          titleTop,
          titleWidth,
          titleHeight,
        );
      else {
        const title = this.hud.label(
          parentNode,
          this.hud.t('夜航守望', 'OVERWATCH'),
          left + titleWidth / 2,
          titleTop + titleHeight / 2,
          compact ? 42 : 62,
          titleWidth,
          Math.min(titleHeight - 20, 76),
          C.white,
        );
        title.horizontalAlign = Label.HorizontalAlign.LEFT;
        title.isBold = true;
      }
      const strap = this.hud.label(
        parentNode,
        'N I G H T   O V E R W A T C H',
        left + titleWidth / 2,
        titleTop + titleHeight + 2,
        compact ? 10 : 12,
        titleWidth,
        24,
        C.action,
      );
      strap.horizontalAlign = Label.HorizontalAlign.LEFT;
      const subtitle = this.hud.label(
        parentNode,
        this.hud.t('长夜之上，守住归途。', 'ABOVE THE NIGHT. BRING THEM HOME.'),
        left + titleWidth / 2,
        titleTop + titleHeight + 28,
        12,
        titleWidth,
        24,
        '#b8cbd8',
      );
      subtitle.horizontalAlign = Label.HorizontalAlign.LEFT;
      const menuWidth = wide ? (right - left - 36) / 4 : Math.min(248, (right - left - 12) / 2);
      const entries = [
        ['missions', this.hud.t('单人模式', 'SINGLE PLAYER'), 'mountain'],
        ['online:menu', this.hud.t('对战大厅', 'BATTLE LOBBY'), 'battle'],
        ['online:ranking', this.hud.t('排行榜', 'LEADERBOARDS'), 'ranking'],
        ['help', this.hud.t('飞行手册', 'FIELD GUIDE'), 'book'],
      ];
      for (const [index, [id, caption, symbol]] of entries.entries()) {
        const x = left + (wide ? index : index % 2) * (menuWidth + 12);
        const y = menuTop + (wide ? 0 : Math.floor(index / 2) * 54);
        const primary = index === 0;
        this.hud.plate(
          graphics,
          x,
          y,
          menuWidth,
          48,
          primary ? C.amber : '#111d21dc',
          primary ? C.amber : '#8ba9ba',
          5,
        );
        if (!primary) {
          this.hud.rect(graphics, x + 6, y + 5, menuWidth - 12, 38, '#59778b33');
          this.hud.rect(graphics, x + 6, y + 12, 2, 24, C.mint);
        }
        this.hud.icon(graphics, symbol, x + 23, y + 24, 18, primary ? C.action : C.mint);
        const button = this.hud.button(id, caption + '  ›', x, y, menuWidth, 48, parentNode);
        button.node.setPosition(x + menuWidth / 2 + 11 - width / 2, height / 2 - y - 24);
        button.node.getComponent(UITransform)!.setContentSize(menuWidth - 42, 44);
        this.hud.buttons[this.hud.buttons.length - 1].visual = {
          x: x + 2,
          y: y + 2,
          w: menuWidth - 4,
          h: 44,
        };
        button.fontSize = menuWidth < 170 ? 13 : 15;
        button.color = col(primary ? C.action : C.white);
        button.isBold = true;
      }
      if (this.hud.online) {
        this.hud.label(parentNode, this.hud.online.onlineLabel(this.hud.lang), right - 95, this.hud.safe.top + 68, 13, 190, 24, C.dim);
        const settingsLeft = this.hud.buttons.find((button) => button.id === 'settings')!.x;
        const profileWidth = Math.min(264, settingsLeft - left - 118);
        this.hud.plate(
          graphics,
          left,
          this.hud.safe.top + 8,
          profileWidth,
          44,
          '#111d21ed',
          C.line,
          6,
        );
        this.hud.button(
          'online:profile',
          playerLabel(this.hud.online.identity) + '  ✎',
          left,
          this.hud.safe.top + 8,
          profileWidth,
          44,
          parentNode,
        ).fontSize = 12;
        this.hud.plate(
          graphics,
          left + profileWidth + 10,
          this.hud.safe.top + 8,
          92,
          44,
          '#111d21ed',
          C.line,
          6,
        );
        this.hud.button(
          'online:history',
          this.hud.t('对战记录', 'RECORDS'),
          left + profileWidth + 10,
          this.hud.safe.top + 8,
          92,
          44,
          parentNode,
        ).fontSize = 11;
      }
      return;
    }
    this.hud.rect(
      this.hud.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || graphics,
      0,
      0,
      this.hud.w,
      this.hud.h,
      '#071a2d55',
    );
    const assets=this.hud.online?.assets;
    const preview=assets?.economy?.campaign.find(level=>level.levelId===simulation.mission.id);
    const compactRewards=!!preview&&height<420;
    if(!compactRewards)this.hud.label(
      parentNode,
      this.hud.t('关卡地图', 'LEVEL MAP'),
      left + 78,
      this.hud.safe.top + 80,
      22,
      156,
      42,
    ).isBold = true;
    const top = this.hud.safe.top + (compactRewards?64:104);
    const bottom = height - this.hud.safe.bottom - 58;
    const cardGap = 12;
    const cardWidth = Math.min(300, Math.max(160, (right - left) / 3.2));
    const previewHeight=preview?48:0;
    const cardHeight = Math.max(100, bottom - top - 22-previewHeight);
    if (this.hud.missionFocus !== undefined) {
      this.hud.listScroll.missions = this.hud.missionFocus * (cardWidth + cardGap);
      this.hud.missionFocus = undefined;
    }
    const originalParent = parentNode;
    const originalGraphics = graphics;
    const missionList = this.hud.listViewport(
      parentNode,
      'missions',
      { x: left, y: top, w: right - left, h: bottom - top - 8-previewHeight },
      MISSIONS.length * (cardWidth + cardGap) - cardGap,
      'x',
    );
    parentNode = missionList.n;
    graphics = missionList.g;
    for (const [index, mission] of MISSIONS.entries()) {
      const x = left + index * (cardWidth + cardGap) - missionList.offset;
      const y = top;
      const selected = mission.id === simulation.mission.id;
      const missionNumber = index + 1;
      if (x + cardWidth < left || x > right) continue;
      const unlocked = this.hud.developer || missionUnlocked(this.hud.missionProgress, mission.id);
      const isSmallCard = cardHeight < 180;
      this.hud.plate(
        graphics,
        x,
        y,
        cardWidth,
        cardHeight,
        '#101e2c',
        selected ? C.mint : C.line,
        3,
      );
      const artTop = y + 4;
      const artHeight = cardHeight - 8;
      const artworkIndex = mission.map === 'highland' ? 1 : 2;
      const artwork = this.missionArtwork()[artworkIndex];
      if (artwork)
        this.hud.coverImage(
          parentNode,
          'MissionIllustration-' + mission.id,
          artwork,
          x + 4,
          artTop,
          cardWidth - 8,
          artHeight,
        );
      else
        this.hud.routeGraphic(
          graphics,
          x + 4,
          artTop,
          cardWidth - 8,
          artHeight,
          0,
          mission.map,
          'night',
          mission.events,
        );
      // 插画之后创建独立叠层，保证选中边框、暗部渐变和文字不被图片盖住。
      const overlay = this.hud.artOverlay(parentNode, 'MissionSurface-' + mission.id);
      this.hud.gradient(
        overlay,
        x + 4,
        artTop,
        cardWidth - 8,
        Math.min(40, artHeight),
        '#04131bca',
        '#04131b00',
      );
      this.hud.gradient(
        overlay,
        x + 4,
        artTop + artHeight * 0.25,
        cardWidth - 8,
        artHeight * 0.75,
        '#04131b00',
        '#04131bf2',
        0,
        24,
      );
      this.hud.gradient(
        overlay,
        x + 4,
        y + cardHeight - (isSmallCard ? 66 : 90),
        cardWidth - 8,
        isSmallCard ? 62 : 86,
        '#07131f00',
        '#07131fc9',
        0,
        18,
      );
      if (selected) {
        overlay.strokeColor = col('#6ad4ff55');
        overlay.lineWidth = 5;
        overlay.rect(
          x - width / 2 + 2,
          height / 2 - y - cardHeight + 2,
          cardWidth - 4,
          cardHeight - 4,
        );
        overlay.stroke();
      }
      overlay.strokeColor = col(selected ? '#b9edff' : '#58788d');
      overlay.lineWidth = selected ? 2 : 1;
      overlay.rect(
        x - width / 2 + 2,
        height / 2 - y - cardHeight + 2,
        cardWidth - 4,
        cardHeight - 4,
      );
      overlay.stroke();
      this.hud.rect(
        overlay,
        x + 14,
        y + cardHeight - 3,
        cardWidth - 28,
        2,
        selected ? C.mint : '#45678055',
      );
      if (selected) {
        const badgeX = x + cardWidth - 16 - width / 2;
        const badgeY = height / 2 - y - 17;
        overlay.fillColor = col(C.mint);
        overlay.circle(badgeX, badgeY, 8);
        overlay.fill();
        overlay.strokeColor = col('#092032');
        overlay.lineWidth = 2;
        overlay.moveTo(badgeX - 4, badgeY);
        overlay.lineTo(badgeX - 1, badgeY - 3);
        overlay.lineTo(badgeX + 4, badgeY + 3);
        overlay.stroke();
      }
      this.hud.label(
        parentNode,
        String(missionNumber).padStart(3, '0'),
        x + 29,
        y + 18,
        15,
        42,
        25,
        C.action,
      ).isBold = true;
      this.hud.label(
        parentNode,
        selected
          ? this.hud.t('当前', 'SELECTED')
          : unlocked
            ? lightLabel(missionNumber)
            : this.hud.t('锁定', 'LOCKED'),
        x + cardWidth - (selected ? 62 : 48),
        y + 18,
        10,
        selected ? 66 : 80,
        22,
        selected ? C.mint : C.white,
      );
      const label = this.hud.button(
        'mission:' + mission.id,
        text(mission.name, this.hud.lang),
        x,
        y,
        cardWidth,
        cardHeight,
        parentNode,
      );
      this.hud.buttons[this.hud.buttons.length - 1].disabled = !unlocked;
      label.node.setPosition(
        x + cardWidth / 2 - width / 2,
        height / 2 - y - cardHeight + (isSmallCard ? 48 : 61),
      );
      label.node.getComponent(UITransform)!.setContentSize(cardWidth - 20, isSmallCard ? 24 : 26);
      label.fontSize = cardWidth < 180 ? 12 : isSmallCard ? 15 : 19;
      label.color = col(unlocked ? C.white : C.dim);
      label.isBold = true;
      const tier =
        missionNumber <= 3
          ? this.hud.t('入门', 'INTRO')
          : missionNumber <= 60
            ? this.hud.t('进阶', 'ADVANCED')
            : this.hud.t('挑战', 'EXPERT');
      this.hud.label(
        parentNode,
        `${lightLabel(missionNumber)} · ${tier} · ` +
          this.hud.t(`敌方 ${mission.events.length}`, `${mission.events.length} HOSTILES`),
        x + cardWidth / 2,
        y + cardHeight - (isSmallCard ? 27 : 36),
        cardWidth < 180 ? 9 : 11,
        cardWidth - 16,
        isSmallCard ? 16 : 20,
        '#bdd0dd',
      );
      const status = this.hud.missionProgress.cleared.includes(mission.id)
        ? this.hud.t('已完成', 'CLEARED')
        : unlocked
          ? this.hud.developer
            ? this.hud.t('试玩 · 不计进度', 'PRACTICE')
            : this.hud.t('可出动', 'AVAILABLE')
          : this.hud.t('完成上一关解锁', 'COMPLETE PREVIOUS');
      this.hud.label(
        parentNode,
        status,
        x + cardWidth / 2,
        y + cardHeight - (isSmallCard ? 10 : 15),
        isSmallCard ? 9 : 11,
        cardWidth - 12,
        isSmallCard ? 16 : 19,
        unlocked ? C.mint : C.dim,
      );
    }
    missionList.finish();
    parentNode = originalParent;
    graphics = originalGraphics;
    if(preview){
      const claimed=assets?.clearedLevels?.includes(simulation.mission.id),fragment=preview.repeat.fragment==='fragment:skill'&&!['tracking','emp'].every(effect=>assets?.permanent.includes(effect as 'tracking'|'emp'))?this.hud.t('技能碎片','skill fragments'):this.hud.t('武器碎片','weapon fragments');
      this.hud.label(parentNode,this.hud.t(`每次通关：${preview.repeat.coins}金币 / ${preview.repeat.xp}EXP / ${preview.repeat.fragments}${fragment}`,`Each clear: ${preview.repeat.coins} coins / ${preview.repeat.xp} EXP / ${preview.repeat.fragments} ${fragment}`), (left+right)/2,bottom-38,12,right-left,20,C.white);
      this.hud.label(parentNode,claimed?this.hud.t('首通奖励已领取','First-clear bonus claimed'):this.hud.t(`首通额外：${preview.first.coins-preview.repeat.coins}金币 / ${preview.first.xp-preview.repeat.xp}EXP / +4片（资格以结算校验为准）`,`First bonus: ${preview.first.coins-preview.repeat.coins} coins / ${preview.first.xp-preview.repeat.xp} EXP / +4 fragments; verified at settlement`),(left+right)/2,bottom-17,11,right-left,22,C.mint);
    }
    const buttonWidth = (right - left - 24) / 3;
    for (const [index, id] of ['homeMenu', 'training', 'start'].entries()) {
      const x = left + index * (buttonWidth + 12);
      const primary = id === 'start';
      const selected = id === 'training' && simulation.mission.mode === 'training';
      this.hud.plate(
        graphics,
        x,
        bottom,
        buttonWidth,
        44,
        primary ? C.amber : '#1c2a2e',
        selected ? C.mint : C.line,
        3,
      );
      const label = this.hud.button(
        id,
        [
          this.hud.t('返回', 'BACK'),
          this.hud.t('火控热身', 'FIRE CONTROL'),
          simulation.mission.mode === 'training'
            ? this.hud.t('开始热身 →', 'START WARMUP →')
            : this.hud.t(
                `出发 ${String(missionNumber).padStart(3, '0')} →`,
                `DEPLOY ${String(missionNumber).padStart(3, '0')} →`,
              ),
        ][index],
        x,
        bottom,
        buttonWidth,
        44,
        parentNode,
      );
      this.hud.buttons[this.hud.buttons.length - 1].disabled =
        primary &&
        simulation.mission.mode !== 'training' &&
        !this.hud.developer &&
        !missionUnlocked(this.hud.missionProgress, simulation.mission.id);
      label.color = col(primary ? C.action : selected ? C.mint : C.white);
      label.isBold = primary;
    }
  }
}
