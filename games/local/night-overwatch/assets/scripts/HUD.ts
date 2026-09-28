import {
  Camera,
  Canvas,
  Color,
  Graphics,
  Label,
  Layers,
  Mask,
  Node,
  UITransform,
  view,
  ResolutionPolicy,
  sys,
} from 'cc';
import { ACTIONS, action, actionLabel, bindingLabel, TUTORIAL, tutorialText } from './core/Actions';
import { drawEffects } from './Effects';
import {
  WEAPONS,
  MISSION,
  MAP,
  ROUTE,
  SECTORS,
  aircraft,
  HOLD_POINTS,
  routePoint,
  PROTECTED,
  UNITS,
  text,
  type Language,
  type Point,
} from './core/Data';
import type { Simulation } from './core/Simulation';
import type { World } from './World';
const C = {
  ink: '#0c171eef',
  line: '#36545d',
  white: '#e4ece7',
  dim: '#94acae',
  mint: '#8df3cf',
  amber: '#f5ba76',
  red: '#ff525b',
};
const col = (hex: string) => new Color().fromHEX(hex);
export type ButtonRect = { id: string; x: number; y: number; w: number; h: number; label: Label };
export class HUD {
  root: Node;
  camera: Camera;
  g: Graphics;
  marks: Graphics;
  w = 960;
  h = 540;
  lang: Language = 'zh';
  touch = sys.isMobile;
  buttons: ButtonRect[] = [];
  labels = new Map<string, Label>();
  modal?: Node;
  modalKey = '';
  helpGroup: 'basic' | 'advanced' | 'rules' = 'basic';
  helpTouch = false;
  scroll = 0;
  scrollMax = 0;
  scrollNode?: Node;
  scrollArea = { x: 0, y: 0, w: 0, h: 0 };
  tutorial = true;
  muted = false;
  fullscreen = false;
  toast = '';
  toastUntil = 0;
  unitLabels = new Map<number, Label>();
  lastHelpLine = '';
  safe = { left: 0, right: 0, top: 0, bottom: 0 };
  constructor(parent: Node) {
    this.root = new Node('OverwatchHUD');
    parent.addChild(this.root);
    this.root.layer = Layers.Enum.UI_2D;
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas),
      cn = new Node('UICamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.priority = 10;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    this.g = this.node('Backdrop', this.root).addComponent(Graphics);
    this.marks = this.node('Telemetry', this.root).addComponent(Graphics);
    this.resize();
  }
  t(zh: string, en: string) {
    return this.lang === 'zh' ? zh : en;
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  resize() {
    const size = view.getFrameSize();
    this.w = size.width;
    this.h = size.height;
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.EXACT_FIT);
    // Creator returns this rectangle in UI coordinates, already adjusted for DPR.
    const rect = sys.getSafeAreaRect();
    this.safe = {
      left: Math.max(0, rect.x),
      right: Math.max(0, this.w - rect.x - rect.width),
      bottom: Math.max(0, rect.y),
      top: Math.max(0, this.h - rect.y - rect.height),
    };
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2, 0);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    for (const b of this.buttons) b.label.node.destroy();
    this.buttons = [];
    for (const l of Array.from(this.labels.values())) l.node.destroy();
    this.labels.clear();
    for (const label of Array.from(this.unitLabels.values())) label.node.destroy();
    this.unitLabels.clear();
    this.modal?.destroy();
    this.modal = undefined;
    this.modalKey = '';
    this.buildControls();
  }
  label(
    parent: Node,
    str: string,
    x: number,
    y: number,
    size: number,
    width: number,
    height: number,
    hex = C.white,
  ) {
    const n = this.node(str.slice(0, 20), parent);
    n.setPosition(x - this.w / 2, this.h / 2 - y);
    n.getComponent(UITransform)!.setContentSize(width, height);
    const l = n.addComponent(Label);
    l.string = str;
    l.fontFamily = 'Microsoft YaHei';
    l.fontSize = size;
    l.lineHeight = size * 1.5;
    l.color = col(hex);
    l.overflow = Label.Overflow.CLAMP;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
  }
  button(id: string, label: string, x: number, y: number, w: number, h = 44, parent = this.root) {
    if (parent === this.root) {
      x += x < this.w / 2 ? this.safe.left : -this.safe.right;
      if (y < 80) y += this.safe.top;
      if (y > this.h - 100) y -= this.safe.bottom;
    }
    const l = this.label(parent, label, x + w / 2, y + h / 2, this.w < 750 ? 12 : 14, w - 4, h);
    this.buttons.push({ id, x, y, w, h, label: l });
    return l;
  }
  live(id: string, x: number, y: number, size: number, w: number, h: number, hex = C.white) {
    const l = this.label(this.root, '', x, y, size, w, h, hex);
    this.labels.set(id, l);
    return l;
  }
  set(id: string, str: string) {
    const l = this.labels.get(id);
    if (l && l.string !== str) l.string = str;
  }
  buildControls() {
    const w = this.w,
      h = this.h;
    this.live('title', 107 + this.safe.left, 23 + this.safe.top, 15, 200, 30, C.mint);
    this.live(
      'status',
      w < 750 ? w - 66 : w < 840 ? 260 : w / 2,
      (w < 750 ? 60 : 22) + this.safe.top,
      12,
      105,
      30,
    );
    let x = w - 346;
    for (const [id, key, width] of [
      ['sensor', 'sensor', 72],
      ['mission', 'mission', 54],
      ['help', 'help', 54],
      ['pause', 'pause', 54],
      ['fullscreen', 'fullscreen', 76],
    ] as const) {
      this.button(
        id,
        actionLabel(key, this.lang, this.touch).replace(' · ', '\n'),
        x,
        6,
        width,
        44,
      );
      x += width + 3;
    }
    this.live('progress', 126 + this.safe.left, 60 + this.safe.top, 11, 240, 22, C.dim);
    this.live('health', w * 0.56, 60 + this.safe.top, 12, 230, 22, C.mint);
    this.live('aircraft', w / 2, 89 + this.safe.top, 11, 290, 24, C.dim);
    this.live('bearing', w / 2, 112 + this.safe.top, 11, 270, 20, C.white);
    this.live('sector', 96 + this.safe.left, h < 460 ? 237 : 294, 11, 180, 22, C.dim);
    this.button('convoy', '', 12, 78, 124, 44);
    this.live('hold', 78, 134, 11, 135, 28, C.dim);
    this.button(
      'locate',
      actionLabel('locate', this.lang, this.touch).replace(' · ', '\n'),
      w - 76,
      83,
      64,
      44,
    );
    this.button('zoomIn', '+', w - 64, 132, 52, 44);
    this.button('zoomOut', '−', w - 64, 181, 52, 44);
    this.live('zoom', w - 38, 238, 11, 65, 20, C.dim);
    this.live('notice', w / 2, h - 118 - this.safe.bottom, 13, Math.min(w - 170, 760), 28, C.amber);
    const warning = this.live(
      'friendWarning',
      w / 2,
      h - 147 - this.safe.bottom,
      w < 750 ? 17 : 21,
      Math.min(w - 160, 670),
      34,
      C.red,
    );
    warning.isBold = true;
    this.live('target', w / 2, h / 2, 12, 210, 25, C.amber);
    this.live('flight', w / 2, h / 2 + 28, 11, 150, 22, C.white);
    this.live('tutorial', w / 2, h - 89, 12, Math.min(w - 26, 1000), 30, C.mint);
    for (let i = 0; i < 3; i++) this.button('weapon' + i, '', 12 + i * 86, h - 67, 80, 56);
    this.live('weaponState', (274 + w - 154) / 2, h - 38, 12, Math.max(80, w - 428), 58, C.dim);
    this.button('fire', '', w - 146, h - 77, 134, 66);
  }
  rect(g: Graphics, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
    g.fillColor = col(fill);
    g.rect(x - this.w / 2, this.h / 2 - y - h, w, h);
    g.fill();
    if (stroke) {
      g.lineWidth = 1;
      g.strokeColor = col(stroke);
      g.stroke();
    }
  }
  hit(x: number, y: number) {
    return [...this.buttons]
      .reverse()
      .find(
        (b) =>
          x >= b.x &&
          x <= b.x + b.w &&
          y >= b.y &&
          y <= b.y + b.h &&
          b.label.node.activeInHierarchy,
      );
  }
  blocksBattlefield(x: number, y: number) {
    const compact = this.h < 460;
    return (
      !!this.hit(x, y) ||
      y < 75 + this.safe.top ||
      y > this.h - 78 - this.safe.bottom ||
      (x >= 14 + this.safe.left &&
        x <= (compact ? 126 : 174) + this.safe.left &&
        y >= 153 + this.safe.top &&
        y <= 153 + this.safe.top + (compact ? 66 : 110))
    );
  }
  scrollBy(amount: number) {
    this.scroll = Math.max(0, Math.min(this.scrollMax, this.scroll + amount));
    if (this.scrollNode) this.scrollNode.setPosition(0, this.scroll, 0);
  }
  renderModal(key: string, s: Simulation) {
    if (key === this.modalKey) return;
    this.buttons = this.buttons.filter((b) => {
      if (b.label.node.parent !== this.root) {
        b.label.node.destroy();
        return false;
      }
      return true;
    });
    this.modal?.destroy();
    this.modal = undefined;
    this.scrollNode = undefined;
    this.scroll = 0;
    this.scrollMax = 0;
    this.modalKey = key;
    if (!key) return;
    const n = this.node('Panel', this.root);
    this.modal = n;
    const g = n.addComponent(Graphics);
    this.rect(g, 0, 0, this.w, this.h, '#071015cc');
    const pw = Math.min(760, this.w * 0.86),
      ph = this.h * 0.84,
      px = (this.w - pw) / 2,
      py = (this.h - ph) / 2;
    this.rect(g, px, py, pw, ph, '#11232bf9', C.line);
    let title = this.t('任务暂停', 'MISSION PAUSED');
    if (key.startsWith('help')) title = this.t('飞行值勤手册', 'OPERATOR FIELD GUIDE');
    if (key === 'briefing') title = this.t('夜航守望', 'NIGHT OVERWATCH');
    if (key === 'success') title = this.t('撤离走廊已打通', 'CORRIDOR SECURED');
    if (key === 'failure') title = this.t('护送任务中断', 'ESCORT INTERRUPTED');
    if (key === 'orientation') title = this.t('请横过手机', 'ROTATE TO LANDSCAPE');
    if (key === 'mission') title = this.t('01 / 山谷公路撤离', '01 / VALLEY EVACUATION');
    this.label(n, title, px + pw / 2, py + 28, this.w < 750 ? 20 : 28, pw - 100, 44, C.mint);
    const close = ['briefing', 'success', 'failure', 'orientation'].includes(key) ? false : true;
    if (close) this.button('close', this.t('关闭 ×', 'CLOSE ×'), px + pw - 88, py + 7, 80, 44, n);
    if (key === 'pause' || key === 'mission')
      this.button('help', this.t('操作帮助', 'HELP'), px + 8, py + 7, 86, 44, n);
    this.button(
      'fullscreen',
      this.fullscreen ? this.t('退出全屏', 'EXIT FULL') : this.t('全屏', 'FULL SCREEN'),
      px + pw - 110,
      py + ph - (key.startsWith('help') ? 52 : 62),
      98,
      44,
      n,
    );
    if (key.startsWith('help')) {
      const tabs = [
        ['basic', this.t('基础', 'BASICS')],
        ['advanced', this.t('进阶', 'ADVANCED')],
        ['rules', this.t('战斗规则', 'RULES')],
      ];
      tabs.forEach(([id, t], i) => {
        this.button(
          'tab:' + id,
          (this.helpGroup === id ? '• ' : '') + t,
          px + 12 + (i * (pw - 148)) / 3,
          py + 55,
          (pw - 160) / 3,
          44,
          n,
        );
      });
      this.button(
        'input',
        this.helpTouch ? this.t('触控', 'TOUCH') : this.t('键鼠', 'KEYS'),
        px + pw - 114,
        py + 55,
        102,
        44,
        n,
      );
      const vh = ph - 164,
        vw = pw - 36;
      const maskNode = this.node('HelpViewport', n);
      maskNode.setPosition(0, this.h / 2 - (py + 108 + vh / 2));
      maskNode.getComponent(UITransform)!.setContentSize(vw, vh);
      maskNode.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      this.scrollArea = { x: px + 18, y: py + 108, w: vw, h: vh };
      const content = this.node('ScrollableInstructions', maskNode);
      this.scrollNode = content;
      const rows = ACTIONS.filter((a) => a.group === this.helpGroup);
      const rowH = this.w < 750 ? 102 : 90,
        total = rows.length * rowH;
      this.scrollMax = Math.max(0, total - vh);
      rows.forEach((a, i) => {
        const l = this.label(
          content,
          `${text(a.name, this.lang)}  ${this.helpTouch ? text(a.touch, this.lang) : bindingLabel(a.id, this.lang)}\n${text(a.description, this.lang)}`,
          this.w / 2,
          0,
          14,
          vw - 12,
          rowH - 4,
          C.white,
        );
        l.node.setPosition(0, vh / 2 - i * rowH - rowH / 2);
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
      });
      this.lastHelpLine = text(rows[rows.length - 1].description, this.lang);
      this.button(
        'tutorial',
        this.t('重玩教学', 'REPLAY COACH'),
        px + 12,
        py + ph - 52,
        122,
        44,
        n,
      );
      this.button(
        'language',
        this.lang === 'zh' ? 'ENGLISH' : '中文',
        px + 140,
        py + ph - 52,
        94,
        44,
        n,
      );
      this.label(
        n,
        this.t('拖动查看 ↓', 'SCROLL ↓'),
        px + (pw + 124) / 2,
        py + ph - 29,
        11,
        Math.max(80, pw - 368),
        30,
        C.dim,
      );
      return;
    }
    let body = this.t(
      '世界与倒计时已冻结。\n继续后，请重新按下开火。',
      'World and clock are frozen.\nPress FIRE again after resuming.',
    );
    if (key === 'briefing' || key === 'mission')
      body = this.t(
        '你是「夜航 07」机载火控员，飞机自动盘旋。\n护送救援车穿越盘山路、河谷桥，抵达东岭营地。\n方框＋红色友方文字：保护；菱形＋敌方文字：清除。\n炮弹需要飞行时间。先清前路，必要时让车队待命。',
        'You operate NIGHT 07’s guns. The aircraft orbits automatically.\nEscort rescue through switchbacks, river bridge and eastern ridge.\nSquares + FRIENDLY: protect. Diamonds + HOSTILE: engage.\nAllow shell flight time. Clear the road; hold the convoy when needed.',
      );
    if (key === 'success' || key === 'failure')
      body =
        key === 'success'
          ? this.t(
              `评价 ${s.rating}    救援车 ${Math.round((s.rescue.hp / s.rescue.maxHp) * 100)}%\n友伤 ${Math.round(s.friendlyDamage)}  ·  威胁清除 ${s.kills} / ${MISSION.events.length}\n用时 ${Math.floor(s.time)} 秒 · 剩余重炮 ${s.guns[2].ammo} 发`,
              `RATING ${s.rating}    RESCUE ${Math.round((s.rescue.hp / s.rescue.maxHp) * 100)}%\nFriendly damage ${Math.round(s.friendlyDamage)} · Threats cleared ${s.kills}/${MISSION.events.length}\nTime ${Math.floor(s.time)}s · Heavy rounds left ${s.guns[2].ammo}`,
            )
          : this.t(
              `${s.failure === 'vehicle' ? '关键救援车被毁' : '撤离窗口已关闭'}\n${s.friendlyDamage > 0 ? '友伤较高：开炮前检查爆炸范围。' : '先清除前路炮台，用重型炮处理重甲。'}\n清除威胁 ${s.kills} / ${MISSION.events.length} · 用时 ${Math.floor(s.time)} 秒`,
              `${s.failure === 'vehicle' ? 'Critical rescue vehicle destroyed' : 'Evacuation window closed'}\n${s.friendlyDamage > 0 ? 'Check your blast radius for friendlies.' : 'Clear emplacements early; use Heavy on armor.'}\nThreats ${s.kills}/${MISSION.events.length} · Time ${Math.floor(s.time)}s`,
            );
    if (key === 'orientation')
      body = this.t(
        '任务已暂停。横屏后恢复原来的状态。\n可打开帮助查看触控操作。',
        'Mission paused. Rotate to restore your previous state.\nHelp remains available.',
      );
    this.label(
      n,
      body,
      this.w / 2,
      py + ph * 0.48,
      this.w < 750 ? 14 : 18,
      pw - 40,
      Math.max(96, ph * 0.48),
      C.white,
    );
    const y = py + ph - 62;
    if (key === 'briefing') {
      this.button(
        'start',
        this.t('开始护送  →', 'BEGIN ESCORT  →'),
        this.w / 2 - 130,
        y,
        260,
        48,
        n,
      );
      this.button('help', this.t('操作帮助', 'HELP'), px + 10, y, 90, 48, n);
    } else if (key === 'success' || key === 'failure')
      this.button(
        'retry',
        this.t('再次出动  ↻', 'RETRY MISSION  ↻'),
        this.w / 2 - 125,
        y,
        250,
        48,
        n,
      );
    else if (key === 'orientation')
      this.button('help', this.t('查看帮助', 'OPEN HELP'), this.w / 2 - 85, y, 170, 48, n);
    else {
      this.button('resume', this.t('继续任务', 'RESUME'), this.w / 2 - 88, y, 176, 48, n);
      this.button(
        'sound',
        this.muted ? this.t('声音：关', 'SOUND OFF') : this.t('声音：开', 'SOUND ON'),
        px + 12,
        y,
        100,
        48,
        n,
      );
    }
  }
  update(s: Simulation, world: World) {
    const w = this.w,
      h = this.h,
      g = this.g;
    g.clear();
    this.rect(g, 0, 0, w, 74, '#0c171ee8');
    this.rect(g, 0, h - 74, w, 74, '#0c171ef5');
    this.rect(g, 12, 70, (w - 24) * s.ratio, 2, C.mint);
    this.drawSensor(s);
    const index = this.lang === 'zh' ? 0 : 1,
      gun = s.guns[s.selected],
      weapon = WEAPONS[s.selected];
    this.set('title', this.t('夜航 07 / 机载火控', 'NIGHT 07 / FIRE CONTROL'));
    this.set(
      'status',
      `${world.thermal ? 'IR' : 'DAY'}  •  ${Math.floor(Math.ceil(s.remaining) / 60)}:${String(Math.ceil(s.remaining) % 60).padStart(2, '0')}`,
    );
    this.set(
      'progress',
      this.t(
        `撤离 ${Math.round(s.ratio * 100)}%   清除 ${s.kills}/${MISSION.events.length}`,
        `ROUTE ${Math.round(s.ratio * 100)}%   CLEAR ${s.kills}/${MISSION.events.length}`,
      ),
    );
    this.set(
      'health',
      this.t(
        `□ 友方救援车 ${Math.ceil((s.rescue.hp / s.rescue.maxHp) * 100)}%`,
        `□ FRIENDLY RESCUE ${Math.ceil((s.rescue.hp / s.rescue.maxHp) * 100)}%`,
      ),
    );
    this.labels.get('health')!.color = col(C.red);
    const plane = aircraft(s.time);
    this.set(
      'aircraft',
      this.t('高空盘旋 · 高度 1,800 m · 传感器稳定', 'ORBIT · ALT 1,800 m · SENSOR STABILIZED'),
    );
    this.set(
      'bearing',
      this.t(
        `机头 ${String(Math.round(plane.heading) % 360).padStart(3, '0')}°   │   地图 ↑ 北`,
        `HDG ${String(Math.round(plane.heading) % 360).padStart(3, '0')}°   │   MAP ↑ N`,
      ),
    );
    this.set('sector', text(SECTORS.find((a) => s.ratio <= a.end)!.name, this.lang));
    this.set('zoom', `${(world.zoom * (world.temporary ? 1.5 : 1)).toFixed(1)}×`);
    this.set(
      'hold',
      text(
        (
          {
            moving: ['车队行进中', 'CONVOY MOVING'],
            holdRequested: ['前往下一待命点', 'HOLD REQUESTED'],
            holding: ['待命中 · 时间继续', 'HOLDING · CLOCK RUNS'],
            arrived: ['已抵达撤离区', 'ARRIVED'],
          } as const
        )[s.convoy],
        this.lang,
      ),
    );
    this.set(
      'weaponState',
      this.t(
        `${weapon.flight} 秒弹着 · 热量 ${Math.round(gun.heat)}\n${gun.cooldown > 0 ? '装填 ' + gun.cooldown.toFixed(1) + ' 秒' : s.reason() === 'ready' ? '可以开火' : '暂不可开火'}`,
        `${weapon.flight}s FLIGHT · HEAT ${Math.round(gun.heat)}\n${gun.cooldown > 0 ? 'RELOAD ' + gun.cooldown.toFixed(1) + 's' : s.reason() === 'ready' ? 'READY' : 'FIRE BLOCKED'}`,
      ),
    );
    let notice = '';
    const reason = s.reason();
    const reasons = {
      protected: ['保护区内禁止开火', 'PROTECTED ZONE — FIRE BLOCKED'],
      overheated: ['武器过热，降至 40 恢复', 'OVERHEATED — COOL TO 40'],
      empty: ['当前武器无弹药，请切枪', 'NO AMMO — SWITCH WEAPON'],
      cooldown: [`装填中 ${gun.cooldown.toFixed(1)} 秒`, `RELOADING ${gun.cooldown.toFixed(1)}s`],
      outside: ['准星超出任务区域', 'AIM OUTSIDE MISSION AREA'],
      paused: ['已暂停', 'PAUSED'],
    };
    if (reason in reasons) notice = text(reasons[reason as keyof typeof reasons], this.lang);
    else if (s.rescue.hp / s.rescue.maxHp < 0.3 && s.phase === 'playing')
      notice = this.t('救援车危急！清除附近威胁', 'RESCUE CRITICAL — CLEAR NEARBY THREATS');
    else if (s.time - s.waveAt < 4 && s.lastWave >= 0)
      notice = text(MISSION.events[s.lastWave].direction, this.lang);
    else if (s.convoy === 'holding')
      notice = this.t('待命点：前路安全后，点击继续', 'HOLD POINT — CLEAR THE ROAD, THEN GO');
    else if (s.warning === 'armor')
      notice = this.t(
        '重甲抗速射：使用 ' + actionLabel('weapon2', this.lang, this.touch),
        'ARMOR RESISTS RAPID — ' + actionLabel('weapon2', this.lang, this.touch),
      );
    else if (s.warning === 'lead')
      notice = this.t(
        '瞄准移动方向前方，留出弹着提前量',
        'LEAD MOVING TARGETS — ALLOW FOR FLIGHT TIME',
      );
    if (Date.now() < this.toastUntil) notice = this.toast;
    this.set('notice', notice);
    const danger = s.friendlyRisk || s.time - s.friendHitAt < 2;
    this.set(
      'friendWarning',
      danger && s.phase === 'playing'
        ? s.time - s.friendHitAt < 2
          ? this.t('正在误伤友方！停止射击', 'FRIENDLY HIT! CEASE FIRE')
          : this.t('友方 · 当心误伤！', 'FRIENDLY · WATCH YOUR FIRE!')
        : '',
    );
    if (danger && s.phase === 'playing')
      this.rect(
        g,
        w / 2 - Math.min(w - 160, 510) / 2,
        h - 164 - this.safe.bottom,
        Math.min(w - 160, 510),
        34,
        '#340e18ec',
        C.red,
      );
    if (notice)
      this.rect(
        g,
        w / 2 - Math.min(w - 170, 760) / 2,
        h - 132 - this.safe.bottom,
        Math.min(w - 170, 760),
        27,
        '#0c171edc',
      );
    const step = TUTORIAL.find((e) => !s.completed.has(e));
    this.set(
      'tutorial',
      this.tutorial && step
        ? `${TUTORIAL.indexOf(step) + 1}/8  ${tutorialText(step, this.lang, this.touch)}`
        : '',
    );
    for (const b of this.buttons)
      if (b.id === 'fullscreen')
        b.label.string = this.fullscreen
          ? this.t('退出全屏', 'EXIT FULL')
          : this.t('全屏 ⛶', 'FULL ⛶');
    for (const b of this.buttons.filter((b) => b.label.node.parent === this.root)) {
      if (b.id.startsWith('weapon')) {
        const i = Number(b.id.slice(-1)),
          a = s.guns[i];
        b.label.string = `${actionLabel(b.id, this.lang, this.touch)}\n${a.ammo === Infinity ? '∞' : a.ammo}  ${Math.round(a.heat)}°`;
      }
      if (b.id === 'convoy')
        b.label.string =
          (this.touch ? '' : action('convoy').binding + ' · ') +
          (s.convoy === 'moving'
            ? this.t('车队等待', 'HOLD')
            : s.convoy === 'holdRequested'
              ? this.t('取消等待', 'CANCEL HOLD')
              : this.t('车队继续', 'GO'));
      if (b.id === 'fire')
        b.label.string =
          actionLabel('fire', this.lang, this.touch, weapon.automatic) +
          '\n' +
          (weapon.automatic
            ? this.t('松开即停', 'Release to stop')
            : this.t('每次一发', 'One shot per press'));
      if (b.id === 'fullscreen')
        b.label.string = this.fullscreen
          ? this.t('退出全屏', 'EXIT FULL')
          : this.t('全屏 ⛶', 'FULL ⛶');
      if (b.id === 'sensor')
        b.label.string =
          (this.touch ? '' : action('sensor').binding + ' · ') +
          (world.thermal ? this.t('热成像', 'THERMAL') : this.t('日光', 'DAYLIGHT'));
      this.rect(
        g,
        b.x,
        b.y,
        b.w,
        b.h,
        b.id === 'fire'
          ? danger
            ? '#521c28'
            : '#26483f'
          : b.id === 'weapon' + s.selected
            ? '#244a43'
            : C.ink,
        b.id === 'fire' && danger ? C.red : b.id === 'weapon' + s.selected ? C.mint : C.line,
      );
      if (b.id.startsWith('weapon')) {
        const a = s.guns[Number(b.id.slice(-1))];
        this.rect(
          g,
          b.x + 2,
          b.y + b.h - 3,
          ((b.w - 4) * a.heat) / 100,
          2,
          a.overheated ? C.red : C.amber,
        );
      }
    }
    this.drawWorld(s, world);
    let key =
      s.phase === 'briefing'
        ? 'briefing'
        : s.phase === 'success'
          ? 'success'
          : s.phase === 'failure'
            ? 'failure'
            : '';
    if (s.pauses.has('help')) key = 'help:' + this.helpGroup + this.helpTouch + this.lang;
    else if (s.pauses.has('orientation')) key = 'orientation';
    else if (s.pauses.has('mission')) key = 'mission';
    else if (s.paused) key = 'pause';
    if (key !== this.modalKey) {
      this.renderModal(key, s);
      if (this.modal) {
        const mg = this.modal.getComponent(Graphics)!;
        for (const b of this.buttons.filter((b) => b.label.node.parent === this.modal))
          this.rect(mg, b.x, b.y, b.w, b.h, '#213b43', C.line);
      }
    }
  }
  drawSensor(s: Simulation) {
    const g = this.g,
      w = this.w,
      h = this.h;
    // Sensor glass stays separate from world projection so recoil cannot move a shot's aim.
    for (let i = 0; i < 4; i++) {
      this.rect(g, i * 3, 75, 3, h - 150, '#04101725');
      this.rect(g, w - (i + 1) * 3, 75, 3, h - 150, '#04101725');
    }
    g.strokeColor = col('#92b8ae65');
    g.lineWidth = 1;
    for (const x of [15, w - 15])
      for (const y of [83, h - 84]) {
        const dx = x < w / 2 ? 20 : -20,
          dy = y < h / 2 ? 20 : -20;
        g.moveTo(x + dx - w / 2, h / 2 - y);
        g.lineTo(x - w / 2, h / 2 - y);
        g.lineTo(x - w / 2, h / 2 - y - dy);
      }
    g.stroke();
    const mw = h < 460 ? 112 : 160,
      mh = h < 460 ? 66 : 110,
      mx = 14 + this.safe.left,
      my = 153 + this.safe.top;
    this.rect(g, mx, my, mw, mh, '#07141adf', '#36545d');
    const point = (p: Point) => ({
      x: mx + mw / 2 + (p.x / 190) * (mw / 2 - 5) - w / 2,
      y: h / 2 - my - mh / 2 - (p.z / 110) * (mh / 2 - 5),
    });
    g.strokeColor = col('#718d8c');
    g.lineWidth = 1;
    ROUTE.forEach((p, i) => {
      const q = point(p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.stroke();
    g.strokeColor = col('#42655d');
    g.ellipse(
      mx + mw / 2 - w / 2,
      h / 2 - my - mh / 2,
      ((mw / 2 - 5) * 145) / 190,
      ((mh / 2 - 5) * 100) / 110,
    );
    g.stroke();
    for (const u of s.units)
      if (u.hp > 0) {
        const q = point(u);
        g.fillColor = col(u.friendly ? C.mint : C.amber);
        g.rect(q.x - 2, q.y - 2, 4, 4);
        g.fill();
      }
    const plane = aircraft(s.time),
      p = point(plane),
      a = (-plane.heading * Math.PI) / 180;
    const vertex = (x: number, y: number) => ({
      x: p.x + x * Math.cos(a) - y * Math.sin(a),
      y: p.y + x * Math.sin(a) + y * Math.cos(a),
    });
    const shape = [
      [0, 7],
      [2, 1],
      [7, -2],
      [2, -2],
      [2, -5],
      [4, -6],
      [-4, -6],
      [-2, -5],
      [-2, -2],
      [-7, -2],
      [-2, 1],
    ];
    g.fillColor = col(C.white);
    shape.forEach(([x, y], i) => {
      const q = vertex(x, y);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.close();
    g.fill();
  }
  drawWorld(s: Simulation, world: World) {
    const g = this.marks;
    g.clear();
    drawEffects(g, s, world, this.w, this.h);
    const project = (p: Point, y = 0) => {
      const q = world.project(p, y);
      return { x: q.x / view.getScaleX() - this.w / 2, y: q.y / view.getScaleY() - this.h / 2 };
    };
    for (const [id, l] of Array.from(this.unitLabels.entries())) {
      if (!s.units.some((u) => u.id === id)) {
        l.node.destroy();
        this.unitLabels.delete(id);
      } else l.node.active = false;
    }
    for (const p of PROTECTED) {
      const q = project(p);
      g.strokeColor = col('#729e91');
      g.lineWidth = 1;
      const ex = project({ x: p.x + p.radius, z: p.z }),
        ez = project({ x: p.x, z: p.z + p.radius });
      g.ellipse(q.x, q.y, Math.abs(ex.x - q.x), Math.abs(ez.y - q.y));
      g.stroke();
    }
    for (const d of HOLD_POINTS) {
      const q = project(routePoint(d));
      g.strokeColor = col(C.amber);
      g.lineWidth = 1;
      g.circle(q.x, q.y, 9);
      g.stroke();
    }
    const placed: { x: number; y: number }[] = [];
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      const q = project(u, 2.3),
        r = u.kind === 'heavy' ? 11 : 8;
      if (
        q.x < -this.w / 2 + 5 ||
        q.x > this.w / 2 - 5 ||
        q.y > this.h / 2 - 78 ||
        q.y < -this.h / 2 + 78
      )
        continue;
      let label = this.unitLabels.get(u.id);
      if (!label) {
        label = this.label(this.root, '', 0, 0, this.w < 750 ? 10 : 12, 94, 20);
        label.isBold = true;
        this.unitLabels.set(u.id, label);
      }
      label.node.active = true;
      label.color = col(u.friendly ? C.red : C.amber);
      label.string = u.friendly
        ? u.kind === 'rescue'
          ? this.t('友方 · 救援车', 'FRIENDLY RESCUE')
          : this.t('友方 · 护卫', 'FRIENDLY ESCORT')
        : this.t('敌方 · ', 'HOSTILE ') +
          this.t(
            u.kind === 'heavy' ? '重甲' : u.kind === 'turret' ? '炮台' : '轻车',
            u.kind.toUpperCase(),
          );
      let tag = { x: q.x, y: q.y + (u.kind === 'rescue' ? -25 : 28) };
      for (const [dx, dy] of [
        [0, u.kind === 'rescue' ? -25 : 28],
        [0, -28],
        [0, 48],
        [62, 12],
        [-62, 12],
        [62, -28],
      ]) {
        tag = {
          x: Math.max(-this.w / 2 + 53, Math.min(this.w / 2 - 53, q.x + dx)),
          y: Math.max(-this.h / 2 + 150, Math.min(this.h / 2 - 132, q.y + dy)),
        };
        if (!placed.some((p) => Math.abs(p.x - tag.x) < 94 && Math.abs(p.y - tag.y) < 22)) break;
      }
      placed.push(tag);
      label.node.setPosition(tag.x, tag.y);
      if (Math.abs(tag.x - q.x) > 10 || Math.abs(tag.y - q.y) > 35) {
        g.strokeColor = col(u.friendly ? '#ff525b80' : '#f5ba7680');
        g.lineWidth = 1;
        g.moveTo(q.x, q.y);
        g.lineTo(tag.x, tag.y);
        g.stroke();
      }
      g.lineWidth = 1.5;
      g.strokeColor = col(u.friendly ? C.mint : C.amber);
      if (u.friendly) g.rect(q.x - r, q.y - r, r * 2, r * 2);
      else {
        g.moveTo(q.x, q.y + r);
        g.lineTo(q.x + r, q.y);
        g.lineTo(q.x, q.y - r);
        g.lineTo(q.x - r, q.y);
        g.close();
      }
      g.stroke();
      g.fillColor = col(u.friendly ? C.mint : C.amber);
      g.rect(q.x - 12, q.y + 15, (24 * u.hp) / u.maxHp, 2);
      g.fill();
      if (!u.friendly && s.time - u.born < 4) {
        g.strokeColor = col(C.amber);
        g.circle(q.x, q.y, 12 + Math.sin(s.time * 7) * 2);
        g.stroke();
      }
    }
    const q = project(s.aim),
      radius = WEAPONS[s.selected].radius;
    const edge = project({ x: s.aim.x + radius, z: s.aim.z }),
      rz = project({ x: s.aim.x, z: s.aim.z + radius });
    g.strokeColor = col(s.reason() === 'protected' || s.friendlyRisk ? C.red : C.mint);
    g.lineWidth = s.friendlyRisk ? 2 : 1;
    g.ellipse(q.x, q.y, Math.abs(edge.x - q.x), Math.abs(rz.y - q.y));
    g.stroke();
    for (const sign of [-1, 1]) {
      g.moveTo(q.x + sign * 8, q.y);
      g.lineTo(q.x + sign * 19, q.y);
      g.moveTo(q.x, q.y + sign * 8);
      g.lineTo(q.x, q.y + sign * 19);
    }
    g.stroke();
    g.circle(q.x, q.y, 2);
    g.stroke();
    const target = s.aimedUnit,
      label = this.labels.get('target')!;
    label.string = target
      ? target.friendly
        ? this.t('友方目标 · 请勿射击', 'FRIENDLY · DO NOT FIRE')
        : this.t('敌方目标 · ', 'HOSTILE · ') + Math.ceil((target.hp / target.maxHp) * 100) + '%'
      : '';
    label.color = col(target?.friendly ? C.red : C.amber);
    label.node.setPosition(0, this.h / 2 - 136 - this.safe.top);
    const next = s.shots[0],
      flight = this.labels.get('flight')!;
    flight.string = next
      ? this.t(
          `弹着 ${(next.due - s.time).toFixed(1)} 秒 · ${s.shots.length} 发在途`,
          `IMPACT ${(next.due - s.time).toFixed(1)}s · ${s.shots.length} IN FLIGHT`,
        )
      : '';
    if (next) {
      const p = project(next);
      flight.node.setPosition(
        Math.max(-this.w / 2 + 85, Math.min(this.w / 2 - 85, p.x)),
        Math.max(-this.h / 2 + 174, Math.min(this.h / 2 - 132, p.y + 34)),
      );
    }
  }
}
