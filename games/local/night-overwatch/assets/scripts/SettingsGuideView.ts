import { nextZoomLimit } from './core/Rewards';
import type { HUD } from './HUD';
import { C, col } from './HudTheme';
import { Graphics, Label, Mask, Node, UITransform } from 'cc';
import { ACTIONS, bindingLabel } from './core/Actions';
import { FLIGHT, WEAPONS, text } from './core/Data';
import { SKILLS } from './core/Progression';
import type { Simulation } from './core/Simulation';
import type { World } from './World';
import { UPDATE_LOG } from './UpdateLog';
type SettingsHost = Pick<
  HUD,
  | 'autoPriority'
  | 'button'
  | 'buttons'
  | 'capsuleRect'
  | 'controlIcon'
  | 'controlScale'
  | 'controlsOpen'
  | 'fireScale'
  | 'h'
  | 'helpGroup'
  | 'helpTouch'
  | 'label'
  | 'lang'
  | 'lastHelpLine'
  | 'listViewport'
  | 'menuButton'
  | 'muted'
  | 'node'
  | 'online'
  | 'panelFrame'
  | 'pendingSupply'
  | 'plate'
  | 'rect'
  | 'reducedEffects'
  | 'rewardsAvailable'
  | 'safe'
  | 'scrollArea'
  | 'scrollMax'
  | 'scrollNode'
  | 'supplyLabel'
  | 't'
  | 'toolsOpen'
  | 'voicePrompts'
  | 'w'
  | 'zoomLimit'
  | 'zoomOpen'
>;

export class SettingsGuideView {
  private readonly h: SettingsHost;
  constructor(h: SettingsHost) {
    this.h = h;
  }
  renderUpdates(n:Node,g:Graphics){
    const h=this.h,w=Math.min(760,h.w-h.safe.left-h.safe.right-24),x=h.safe.left+(h.w-h.safe.left-h.safe.right-w)/2,top=Math.max(h.safe.top+12,(h.capsuleRect?.bottom||0)+6),bottom=h.h-h.safe.bottom-12,ph=bottom-top;
    h.panelFrame(g,x,top,w,ph,C.amber,'#050f1df5',false);
    h.menuButton(n,g,'updates:close','‹',x+8,top+4,44,'secondary','',44);
    h.label(n,h.t('更新日志','UPDATE HISTORY'),x+w/2,top+26,22,w-120,40,C.white);
    const version=(globalThis as any).__COMPETITION_CONFIG__?.release?.version;
    h.label(n,h.t('当前安装版本：','INSTALLED: ')+(version||'—'),x+w/2,top+61,12,w-32,24,C.dim);
    const width=w-44,font=h.w<700?13:16,lines=UPDATE_LOG.flatMap(entry=>[
      {text:entry.date+' · '+(entry.major?h.t('重大更新 · ','MAJOR · '):'')+entry.title[h.lang==='zh'?0:1],major:entry.major},
      ...entry.changes.map(item=>({text:'• '+item[h.lang==='zh'?0:1],major:false})),
    ]);
    let total=0;const rows=lines.map(line=>{const height=18+Math.ceil(Array.from(line.text).length/Math.max(12,Math.floor(width/font)))*(font+6);const y=total;total+=height;return {...line,y,height};});
    const list=h.listViewport(n,'updates',{x:x+14,y:top+80,w:w-28,h:Math.max(44,ph-94)},total);
    for(const row of rows){const y=top+80+row.y-list.offset;h.label(list.n,row.text,x+w/2,y+row.height/2,font,width,row.height-6,row.major?C.amber:C.white).horizontalAlign=Label.HorizontalAlign.LEFT;}list.finish();
  }
  renderSettings(n: Node, g: Graphics, s: Simulation, world: World, key: string) {
    const flight = this.h.toolsOpen,
      zoom = this.h.zoomOpen,
      controls = this.h.controlsOpen,
      subpage = flight || zoom || controls,
      playing = s.phase === 'playing';
    const pw = Math.min(
      subpage ? Math.max(344, Math.min(420, this.h.w * 0.5)) : 640,
      this.h.w - this.h.safe.left - this.h.safe.right - 32,
    );
    const px = this.h.safe.left + (this.h.w - this.h.safe.left - this.h.safe.right - pw) / 2;
    const safeTop = Math.max(
      this.h.safe.top,
      this.h.capsuleRect && px + pw > this.h.capsuleRect.left ? this.h.capsuleRect.bottom : 0,
    );
    const short = this.h.h - safeTop - this.h.safe.bottom < 360;
    const ph = Math.min(
      zoom || controls ? 248 : short ? 288 : flight ? 304 : 360,
      this.h.h - safeTop - this.h.safe.bottom - 32,
    );
    const py = safeTop + (this.h.h - safeTop - this.h.safe.bottom - ph) / 2;
    this.h.panelFrame(g, px, py, pw, ph, C.mint, flight || zoom ? '#050f1d18' : '#050f1d45');
    const title = flight
      ? this.h.t('飞行 / 视野', 'FLIGHT / VIEW')
      : zoom
        ? this.h.t('画面 / 倍率', 'DISPLAY / ZOOM')
        : controls
          ? this.h.t('按钮 / 布局', 'CONTROLS / LAYOUT')
          : this.h.t(playing ? '战斗设置' : '设置', playing ? 'BATTLE SETTINGS' : 'SETTINGS');
    const heading = this.h.label(n, title, px + 16 + (pw - 112) / 2, py + 20, 19, pw - 112, 30);
    heading.horizontalAlign = Label.HorizontalAlign.LEFT;
    heading.isBold = true;
    const control = (
      id: string,
      caption: string,
      x: number,
      y: number,
      w: number,
      active = false,
      disabled = false,
    ) => {
      const label = this.h.menuButton(n, g, id, caption, x, y, w, 'secondary', '', 44, disabled);
      if (active) this.h.rect(g, x + 12, y + 39, w - 24, 2, C.mint);
      label.fontSize = w < 100 ? 11 : 13;
      label.lineHeight = 17;
      label.color = col(disabled ? C.dim : active ? C.mint : C.white);
      label.isBold = active;
      return label;
    };
    if (flight) control('locate', this.h.t('定位', 'LOCATE'), px + pw - 80, py - 5, 64);
    else
      this.h.label(
        n,
        s.duelMode ? this.h.t('对战继续', 'BATTLE LIVE') : this.h.t('已暂停', 'PAUSED'),
        px + pw - 48,
        py + 20,
        10,
        64,
        24,
        C.mint,
      );
    if ((flight || zoom) && px - this.h.safe.left > 160) {
      const x = this.h.safe.left + 16,
        w = Math.min(190, px - x - 16);
      this.h.plate(g, x, py, w, 28, '#111d21dc', undefined, 6);
      this.h.label(
        n,
        s.duelMode
          ? this.h.t('对战继续 · 操作已松开', 'BATTLE LIVE · FIRE RELEASED')
          : this.h.t('实时画面 · 战斗暂停', 'LIVE VIEW · BATTLE PAUSED'),
        x + w / 2,
        py + 14,
        10,
        w - 8,
        20,
        C.mint,
      );
    }
    if (controls) {
      const inner = pw - 32;
      for (const [i, [id, caption, value]] of (
        [
          ['fireScale', this.h.t('开火按钮', 'FIRE SIZE'), this.h.fireScale],
          ['controlScale', this.h.t('武器 / 技能', 'WEAPONS / SKILLS'), this.h.controlScale],
        ] as const
      ).entries()) {
        const y = py + 36 + i * 44;
        control(id + ':down', '−', px + 16, y, 44, false, value <= 0.8);
        control(id + ':up', '+', px + pw - 60, y, 44, false, value >= 1.5);
        this.h.label(
          n,
          `${caption}  ${Math.round(value * 100)}%`,
          px + pw / 2,
          y + 22,
          13,
          inner - 96,
          38,
        );
      }
      const half = (inner - 8) / 2;
      control(
        'layoutEdit',
        this.h.t('调整按钮位置', 'MOVE BUTTONS'),
        px + 16,
        py + 124,
        half,
        false,
        !playing || !!this.h.online?.spectator,
      );
      control(
        'layoutReset',
        this.h.t('恢复默认位置', 'RESET POSITIONS'),
        px + 24 + half,
        py + 124,
        half,
      );
    } else if (flight) {
      const a = s.aircraft,
        cell = (pw - 40) / 2,
        row = short ? 64 : 86,
        top = py + (short ? 44 : 54);
      const groups = [
        [
          this.h.t('飞行高度 / m', 'ALTITUDE / m'),
          'altitudeDown',
          'altitudeUp',
          String(Math.round(a.altitude * FLIGHT.metersPerUnit)),
          a.altitude <= FLIGHT.minAltitude,
          a.altitude >= FLIGHT.maxAltitude,
        ],
        [
          this.h.t('盘旋半径 / m', 'ORBIT RADIUS / m'),
          'radiusIn',
          'radiusOut',
          String(Math.round(a.radius * FLIGHT.metersPerUnit)),
          a.radius <= FLIGHT.minRadius,
          a.radius >= FLIGHT.maxRadius,
        ],
        [
          this.h.t('观察角度', 'VIEW ANGLE'),
          'rotateLeft',
          'rotateRight',
          `${Math.round(world.cameraSnapshot?.sensorRotation || 0)}°`,
          false,
          false,
        ],
      ] as const;
      groups.forEach(([caption, down, up, value, min, max], i) => {
        const x = px + 16 + (i % 2) * (cell + 8),
          y = top + Math.floor(i / 2) * row;
        this.h.label(n, caption, x + cell / 2, y + 8, 10, cell, 16, C.dim);
        control(down, '−', x, y + 18, 44, false, min);
        control(up, '+', x + cell - 44, y + 18, 44, false, max);
        this.h.label(n, value, x + cell / 2, y + 40, 16, cell - 92, 30, C.white).isBold = true;
      });
      const x = px + 24 + cell,
        y = top + row,
        half = (cell - 6) / 2;
      this.h.label(
        n,
        this.h.t('盘旋方向', 'ORBIT DIRECTION'),
        x + cell / 2,
        y + 8,
        10,
        cell,
        16,
        C.dim,
      );
      control('orbitLeft', this.h.t('逆时针', 'CCW'), x, y + 18, half, a.direction === -1);
      control(
        'orbitRight',
        this.h.t('顺时针', 'CW'),
        x + half + 6,
        y + 18,
        half,
        a.direction === 1,
      );
      if (!short)
        this.h.label(
          n,
          s.duelMode
            ? this.h.t('服务器持续计时，关闭菜单后继续操作', 'SERVER CLOCK CONTINUES WHILE IN MENU')
            : this.h.t('调整立即生效，战斗计时保持暂停', 'CHANGES APPLY NOW · BATTLE STAYS PAUSED'),
          px + pw / 2,
          py + ph - 73,
          10,
          pw - 32,
          20,
          C.mint,
        );
    } else if (zoom) {
      const y = py + (short ? 36 : 44),
        step = short ? 46 : 48,
        inner = pw - 32,
        half = (inner - 8) / 2;
      control('lensOut', '−', px + 16, y, 44, false, world.zoom <= 0.65);
      control('lensIn', '+', px + pw - 60, y, 44, false, world.zoom >= this.h.zoomLimit);
      this.h.label(
        n,
        `${world.zoom.toFixed(1)}×`,
        px + pw / 2,
        y + 22,
        26,
        inner - 104,
        40,
        C.white,
      ).isBold = true;
      const viewW = (inner - 12) / 3;
      for (const [i, mode] of (['night', 'enhanced', 'thermal'] as const).entries())
        control(
          'view:' + mode,
          this.h.t({ night: '夜景', enhanced: '增强', thermal: '热像' }[mode], mode.toUpperCase()),
          px + 16 + i * (viewW + 6),
          y + step,
          viewW,
          (world.viewMode || 'night') === mode,
        );
      control(
        'effects',
        this.h.reducedEffects
          ? this.h.t('特效 · 精简', 'FX · REDUCED')
          : this.h.t('特效 · 完整', 'FX · FULL'),
        px + 16,
        y + step * 2,
        half,
        !this.h.reducedEffects,
      );
      const limit = nextZoomLimit(this.h.zoomLimit);
      if (this.h.rewardsAvailable && limit)
        control(
          'zoomUpgrade',
          s.buff
            ? this.h.t('支援生效中', 'SUPPORT ACTIVE')
            : this.h.pendingSupply
              ? this.h.t('先领取补给', 'CLAIM SUPPLY')
              : this.h.t(`解锁 ${limit}× · 广告`, `UNLOCK ${limit}× · AD`),
          px + 24 + half,
          y + step * 2,
          half,
          false,
          !!s.buff || this.h.pendingSupply,
        );
      else
        this.h.label(
          n,
          this.h.t(`上限 ${this.h.zoomLimit}×`, `LIMIT ${this.h.zoomLimit}×`),
          px + 24 + half + half / 2,
          y + step * 2 + 22,
          11,
          half,
          28,
          C.dim,
        );
    } else {
      const x = px + 16,
        inner = pw - 32,
        top = py + (short ? 34 : 44),
        step = short ? 44 : 48;
      if (playing) {
        const width = (inner - 16) / 3;
        control('flightControls', this.h.t('飞行 / 视野  ›', 'FLIGHT / VIEW  ›'), x, top, width);
        control(
          'zoomControls',
          this.h.t('画面 / 倍率  ›', 'DISPLAY / ZOOM  ›'),
          x + width + 8,
          top,
          width,
        );
        control(
          'buttonControls',
          this.h.t('按钮 / 布局  ›', 'CONTROLS  ›'),
          x + (width + 8) * 2,
          top,
          width,
        );
      }
      const items = [
        [
          'sound',
          this.h.muted ? this.h.t('游戏声音 关', 'SOUND OFF') : this.h.t('游戏声音 开', 'SOUND ON'),
        ],
        [
          'voicePrompts',
          this.h.voicePrompts
            ? this.h.t('语音提示 开', 'VOICE ON')
            : this.h.t('语音提示 关', 'VOICE OFF'),
        ],
        [
          'autoPriority',
          this.h.autoPriority
            ? this.h.t('优先标注 开', 'AUTO MARK ON')
            : this.h.t('优先标注 关', 'AUTO MARK OFF'),
        ],
        ['language', this.h.lang === 'zh' ? '语言 · 中文' : 'LANGUAGE · EN'],
        ['help', this.h.t('飞行手册', 'FIELD GUIDE')],
        ['updates', this.h.t('更新日志', 'UPDATE HISTORY')],
        ...(playing
          ? [
              [
                'convoy',
                s.convoy === 'moving'
                  ? this.h.t('车队等待', 'HOLD CONVOY')
                  : s.convoy === 'holdRequested'
                    ? this.h.t('取消等待', 'CANCEL HOLD')
                    : this.h.t('车队继续', 'CONVOY GO'),
              ],
              ['mission', this.h.t('关卡详情', 'LEVEL BRIEF')],
              ['supply', this.h.supplyLabel(s)],
            ]
          : [
              ['online:version', this.h.t('游戏更新', 'GAME UPDATES')],
              ['online:profile', this.h.t('玩家昵称', 'PLAYER NAME')],
              [
                'effects',
                this.h.reducedEffects
                  ? this.h.t('特效 · 精简', 'FX · REDUCED')
                  : this.h.t('特效 · 完整', 'FX · FULL'),
              ],
              ['buttonControls', this.h.t('按钮 / 布局', 'CONTROLS / LAYOUT')],
            ]),
      ].filter(
        ([id]) =>
          !(s.duelMode && ['convoy', 'mission', 'supply'].includes(id)) &&
          !(id === 'convoy' && s.mission.mode === 'training') &&
          !(id === 'supply' && !this.h.rewardsAvailable && !this.h.pendingSupply),
      );
      const cols = short ? 3 : 2,
        cw = (inner - (cols - 1) * 16) / cols;
      const listTop = top + (playing ? step : 0),
        listHeight = py + ph - 52 - listTop,
        total = (Math.ceil(items.length / cols) - 1) * step + 44;
      const list =
        total > listHeight
          ? this.h.listViewport(
              n,
              'settings:main',
              { x, y: listTop, w: inner, h: listHeight },
              total,
            )
          : undefined;
      const itemNode = list?.n || n,
        itemGraphics = list?.g || g;
      items.forEach(([id, caption], i) => {
        const bx = x + (i % cols) * (cw + 16),
          by = listTop + Math.floor(i / cols) * step - (list?.offset || 0);
        const glyph = (
          {
            sound: this.h.muted ? 'muted' : 'sound',
            voicePrompts: this.h.voicePrompts ? 'sound' : 'muted',
            autoPriority: 'mission',
            language: 'language',
            help: 'guide',
            'online:profile': 'profile',
            effects: 'effects',
            mission: 'mission',
            convoy: 'next',
            supply: 'plus',
          } as Record<string, string>
        )[id];
        const label = this.h.menuButton(
          itemNode,
          itemGraphics,
          id,
          caption,
          bx,
          by,
          cw,
          'quiet',
          glyph,
        );
        label.fontSize = cw < 160 ? 11 : 13;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.h.rect(itemGraphics, bx + 8, by + 43, cw - 16, 1, '#8ba0ab28');
        if (['sound', 'voicePrompts', 'autoPriority'].includes(id)) {
          const enabled =
            id === 'sound'
              ? !this.h.muted
              : id === 'voicePrompts'
                ? this.h.voicePrompts
                : this.h.autoPriority;
          const sw = cw > 220 ? 34 : 20,
            sx = bx + cw - sw - 10,
            sy = by + 16;
          this.h.rect(
            itemGraphics,
            sx,
            sy,
            sw,
            12,
            enabled ? '#34766f' : '#283b45',
            enabled ? C.mint : C.line,
            6,
          );
          itemGraphics.fillColor = col(enabled ? C.mint : C.dim);
          itemGraphics.circle(sx + (enabled ? sw - 6 : 6) - this.h.w / 2, this.h.h / 2 - sy - 6, 4);
          itemGraphics.fill();
          label.node.getComponent(UITransform)!.setContentSize(cw - 42 - sw, 40);
          label.node.setPosition(
            bx + 30 + (cw - 42 - sw) / 2 - this.h.w / 2,
            this.h.h / 2 - by - 22,
          );
          label.fontSize = cw < 180 ? 10 : 12;
        } else if (cw > 220) this.h.controlIcon(itemGraphics, 'next', bx + cw - 22, by + 22, 16);
        if (id === 'supply' && s.buff) {
          this.h.buttons[this.h.buttons.length - 1].disabled = true;
          label.color = col(C.dim);
        }
      });
      list?.finish();
    }
    const by = py + ph - 52,
      bw = (pw - 40) / 2;
    if (!short) this.h.rect(g, px + 16, by - 7, pw - 32, 1, '#4c605e77');
    if (playing || controls)
      this.h.menuButton(
        n,
        g,
        subpage ? 'close' : 'home',
        subpage ? this.h.t('返回设置', 'BACK') : this.h.t('返回基地', 'BASE'),
        px + 16,
        by,
        bw,
        'ghost',
        'back',
      );
    const width = Math.min(playing ? bw : 160, 200),
      bx = px + pw - 16 - width;
    const primary = playing && (subpage || key === 'pause') ? 'resume' : 'close';
    const label = this.h.menuButton(
      n,
      g,
      primary,
      playing ? this.h.t('继续战斗', 'RESUME BATTLE') : this.h.t('返回', 'BACK'),
      bx,
      by,
      width,
      playing ? 'primary' : 'secondary',
      playing ? 'next' : 'back',
    );
    label.color = col(C.action);
    label.isBold = true;
  }
  renderGuide(n: Node, g: Graphics) {
    const pw = Math.min(760, this.h.w - this.h.safe.left - this.h.safe.right - 32),
      ph = Math.min(450, this.h.h - this.h.safe.top - this.h.safe.bottom - 74),
      px = this.h.safe.left + (this.h.w - this.h.safe.left - this.h.safe.right - pw) / 2,
      py = this.h.safe.top + 58 + (this.h.h - this.h.safe.top - this.h.safe.bottom - 58 - ph) / 2;
    this.h.panelFrame(g, px, py, pw, ph);
    const title = this.h.label(
      n,
      this.h.t('飞行手册', 'FIELD GUIDE'),
      px + 100,
      py + 20,
      20,
      168,
      30,
    );
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.isBold = true;
    if (pw >= 420)
      this.h.label(
        n,
        'NIGHT 07 / ' + this.h.t('操作指引', 'FLIGHT NOTES'),
        px + pw - 110,
        py + 20,
        10,
        188,
        22,
        C.dim,
      );
    const tabW = (pw - 122) / 3,
      tabY = py + 44;
    for (const [i, [id, caption]] of [
      ['basic', this.h.t('基础操作', 'BASICS')],
      ['advanced', this.h.t('飞行视野', 'FLIGHT')],
      ['rules', this.h.t('关卡规则', 'LEVEL')],
    ].entries()) {
      const x = px + 16 + i * (tabW + 4),
        active = this.h.helpGroup === id;
      this.h.plate(g, x, tabY, tabW, 44, active ? '#29423c' : '#1c2a2e', undefined, 6);
      const label = this.h.button('tab:' + id, caption, x, tabY, tabW, 44, n);
      label.color = col(active ? C.mint : C.dim);
      label.isBold = active;
      if (active) this.h.rect(g, x + 12, tabY + 41, tabW - 24, 2, C.mint);
    }
    this.h.plate(g, px + pw - 94, tabY, 78, 44, '#1c2a2e', C.line, 6);
    this.h.button(
      'input',
      this.h.helpTouch ? this.h.t('触控', 'TOUCH') : this.h.t('键鼠', 'KEYS'),
      px + pw - 94,
      tabY,
      78,
      44,
      n,
    );
    const vh = ph - 154,
      vw = pw - 44,
      mask = this.h.node('HelpViewport', n);
    mask.setPosition(px + pw / 2 - this.h.w / 2, this.h.h / 2 - (py + 94 + vh / 2));
    mask.getComponent(UITransform)!.setContentSize(vw, vh);
    mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.h.scrollArea = { x: px + 22, y: py + 94, w: vw, h: vh };
    const content = this.h.node('Instructions', mask);
    this.h.scrollNode = content;
    const lines = content.addComponent(Graphics),
      rows = ACTIONS.filter(
        (a) =>
          a.group === this.h.helpGroup &&
          !(this.h.helpTouch && ['previous', 'next', 'focus'].includes(a.id)),
      );
    let offset = 0;
    rows.forEach((a, i) => {
      const description = text(a.description, this.h.lang),
        font = pw < 600 ? 12 : 14,
        width = vw - 46,
        units = [...description].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 1 : 0.6), 0),
        bodyH = Math.max(2, Math.ceil((units * font) / width) + 1) * (font * 1.45),
        rowH = bodyH + 38;
      const entry = (
        str: string,
        x: number,
        yy: number,
        size: number,
        w: number,
        h: number,
        color: string,
      ) => {
        const label = this.h.label(content, str, this.h.w / 2, 0, size, w, h, color);
        label.node.setPosition(x, vh / 2 - offset - yy);
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        return label;
      };
      entry(String(i + 1).padStart(2, '0'), -vw / 2 + 16, 17, 10, 28, 22, C.mint);
      entry(
        text(a.name, this.h.lang),
        -vw / 2 + 42 + width * 0.22,
        17,
        14,
        width * 0.44,
        26,
        C.white,
      ).isBold = true;
      const binding = entry(
        this.h.helpTouch ? text(a.touch, this.h.lang) : bindingLabel(a.id, this.h.lang),
        -vw / 2 + 42 + width * 0.73,
        17,
        10,
        width * 0.5,
        26,
        C.mint,
      );
      binding.horizontalAlign = Label.HorizontalAlign.RIGHT;
      entry(description, -vw / 2 + 42 + width / 2, 32 + bodyH / 2, font, width, bodyH, C.dim);
      lines.fillColor = col('#36566e66');
      lines.rect(-vw / 2 + 42, vh / 2 - offset - rowH + 1, width, 1);
      lines.fill();
      offset += rowH;
    });
    this.h.scrollMax = Math.max(0, offset - vh);
    this.h.lastHelpLine = text(rows.at(-1)!.description, this.h.lang);
    const bottom = py + ph - 52;
    for (const [id, caption, x, width, primary] of [
      ['tutorial', this.h.t('重玩教学', 'COACH'), px + 16, pw < 400 ? 80 : 100, false],
      ['language', this.h.lang === 'zh' ? 'EN' : '中文', px + (pw < 400 ? 100 : 124), 44, false],
      [
        'close',
        this.h.t('返回', 'BACK'),
        px + pw - (pw < 400 ? 96 : 116),
        pw < 400 ? 80 : 100,
        true,
      ],
    ] as const) {
      this.h.plate(
        g,
        x,
        bottom,
        width,
        44,
        primary ? C.amber : '#1c2a2e',
        primary ? undefined : C.line,
        6,
      );
      const label = this.h.button(id, caption, x, bottom, width, 44, n);
      label.color = col(primary ? C.action : C.white);
      label.isBold = primary;
    }
    if (pw >= 420)
      this.h.label(
        n,
        this.h.t('上下滑动查看更多', 'SCROLL FOR MORE'),
        px + 176 + (pw - 300) / 2,
        bottom + 22,
        10,
        pw - 308,
        26,
        C.dim,
      );
  }
}
