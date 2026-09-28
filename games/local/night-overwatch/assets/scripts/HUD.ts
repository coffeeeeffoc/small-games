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
  ROUTE,
  HOLD_POINTS,
  routePoint,
  PROTECTED,
  SECTORS,
  text,
  type Language,
  type Point,
} from './core/Data';
import type { Simulation } from './core/Simulation';
import type { World } from './World';

const C = {
  ink: '#101e24f5',
  line: '#3b535a',
  white: '#eef3ea',
  dim: '#a2b5b5',
  mint: '#91e6cb',
  amber: '#f2bc77',
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
  touch = sys.isMobile || (sys.isBrowser && window.matchMedia('(pointer: coarse)').matches);
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
  reducedEffects = false;
  fullscreen = false;
  toolsOpen = false;
  toast = '';
  toastUntil = 0;
  unitLabels = new Map<number, Label>();
  lastHelpLine = '';
  safe = { left: 0, right: 0, top: 0, bottom: 0 };
  get compact() {
    return this.h < 500;
  }
  get footer() {
    return this.compact ? 74 : 90;
  }
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
    for (const l of Array.from(this.unitLabels.values())) l.node.destroy();
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
    l.lineHeight = size * 1.45;
    l.color = col(hex);
    l.overflow = Label.Overflow.CLAMP;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
  }
  button(id: string, str: string, x: number, y: number, w: number, h = 44, parent = this.root) {
    const l = this.label(parent, str, x + w / 2, y + h / 2, this.compact ? 13 : 14, w - 8, h - 2);
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
      h = this.h,
      left = 12 + this.safe.left,
      right = w - 12 - this.safe.right,
      top = this.safe.top;
    this.live('title', left + 49, top + 24, this.compact ? 15 : 18, 98, 34, C.mint).isBold = true;
    this.live('health', left + 183, top + 19, 14, 152, 25);
    this.live('progress', left + 183, top + 41, 11, 152, 20, C.dim);
    this.live('status', right - 155, top + 26, 12, 60, 40, C.dim);
    this.button('tools', this.t('战术 ▾', 'TOOLS'), right - 122, top + 6, 62);
    this.button('pause', this.t('暂停 Ⅱ', 'PAUSE'), right - 56, top + 6, 56);
    this.live('sector', w / 2, top + 26, 13, 230, 30, C.dim);
    const by = h - this.footer - this.safe.bottom;
    const cardW = this.compact ? 78 : 112;
    for (let i = 0; i < 3; i++)
      this.button('weapon' + i, '', left + i * (cardW + 6), by + 10, cardW, this.footer - 20);
    const fireW = this.compact ? 110 : 150;
    this.button('fire', '', right - fireW, by + 8, fireW, this.footer - 16);
    const stateX = left + 3 * (cardW + 6) + 8,
      stateW = right - fireW - stateX - 12;
    this.live(
      'weaponState',
      stateX + stateW / 2,
      by + this.footer / 2,
      this.compact ? 12 : 14,
      Math.max(60, stateW),
      this.footer - 14,
      C.dim,
    );
    this.live(
      'notice',
      this.compact ? (w + 158) / 2 : w / 2,
      top + 79,
      this.compact ? 12 : 15,
      Math.min(w - 184, 600),
      40,
      C.amber,
    );
    this.live(
      'friendWarning',
      w / 2,
      top + 105,
      this.compact ? 14 : 17,
      Math.min(w - 32, 560),
      28,
      C.red,
    ).isBold = true;
    this.live('tutorial', w / 2, by - 17, this.compact ? 12 : 14, w - 40, 28, C.mint);
    this.live('target', w / 2, by - 45, 12, 156, 24, C.amber);
    this.live('flight', w / 2, h / 2, 12, 130, 24, C.white);
    this.live('hold', left + 70, top + 119, 12, 140, 24, C.dim);
    this.button('convoy', '', left, top + 64, 140, 44);
    const tx = this.compact ? left : right - 242,
      ty = top + 62,
      columns = this.compact ? 4 : 2,
      toolWidth = this.compact ? (right - left - 18) / 4 : 116;
    for (const [i, id] of [
      'sensor',
      'locate',
      'zoomOut',
      'zoomIn',
      'mission',
      'help',
      'fullscreen',
      'sound',
    ].entries())
      this.button(
        id,
        id === 'zoomIn'
          ? '+'
          : id === 'zoomOut'
            ? '−'
            : id === 'sound'
              ? this.t('声音', 'SOUND')
              : actionLabel(id, this.lang, true),
        tx + (i % columns) * (toolWidth + 6),
        ty + Math.floor(i / columns) * 48,
        toolWidth,
        44,
      );
  }
  rect(g: Graphics, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
    if (w <= 0 || h <= 0) return;
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
    return (
      !!this.hit(x, y) ||
      y < 58 + this.safe.top ||
      y > this.h - this.footer - this.safe.bottom ||
      (this.toolsOpen &&
        (this.compact
          ? y < 164 + this.safe.top
          : x > this.w - 266 - this.safe.right && y < 256 + this.safe.top))
    );
  }
  scrollBy(amount: number) {
    this.scroll = Math.max(0, Math.min(this.scrollMax, this.scroll + amount));
    if (this.scrollNode) this.scrollNode.setPosition(0, this.scroll, 0);
  }
  routeGraphic(g: Graphics, x: number, y: number, w: number, h: number, progress = 0) {
    const point = (p: Point) => ({
      x: x + ((p.x + 100) / 210) * w - this.w / 2,
      y: this.h / 2 - y - ((p.z + 42) / 82) * h,
    });
    g.lineWidth = 3;
    g.strokeColor = col(C.line);
    ROUTE.forEach((p, i) => {
      const q = point(p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.stroke();
    for (const [i, p] of [
      ROUTE[0],
      routePoint(HOLD_POINTS[0]),
      routePoint(HOLD_POINTS[1]),
      ROUTE[ROUTE.length - 1],
    ].entries()) {
      const q = point(p);
      g.fillColor = col(i === 3 ? C.mint : C.dim);
      g.circle(q.x, q.y, i === 3 ? 5 : 3);
      g.fill();
    }
    const q = point(routePoint(progress));
    g.strokeColor = col(C.mint);
    g.lineWidth = 2;
    g.rect(q.x - 6, q.y - 6, 12, 12);
    g.stroke();
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
    this.toolsOpen = false;
    const n = this.node('Panel', this.root);
    this.modal = n;
    const g = n.addComponent(Graphics);
    this.rect(g, 0, 0, this.w, this.h, '#061116d9');
    const pw = Math.min(880, this.w - this.safe.left - this.safe.right - 32),
      ph = Math.min(540, this.h - this.safe.top - this.safe.bottom - 28);
    const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2,
      py = this.safe.top + (this.h - this.safe.top - this.safe.bottom - ph) / 2;
    this.rect(g, px, py, pw, ph, '#101e24fb', C.line);
    this.rect(g, px, py, 4, ph, key === 'failure' ? C.red : C.mint);
    const small = this.compact || this.w < 600,
      low = ph < 280,
      help = key.startsWith('help');
    const heading =
      key === 'briefing'
        ? this.t('夜航守望', 'NIGHT OVERWATCH')
        : key === 'success'
          ? this.t('车队安全抵达', 'CONVOY EXTRACTED')
          : key === 'failure'
            ? this.t('护送中断', 'ESCORT INTERRUPTED')
            : key === 'orientation'
              ? this.t('横屏，进入火控席', 'ROTATE TO LANDSCAPE')
              : help
                ? this.t('飞行值勤手册', 'FIELD GUIDE')
                : key === 'mission'
                  ? this.t('山谷公路撤离', 'VALLEY EVACUATION')
                  : this.t('任务已暂停', 'MISSION PAUSED');
    const headingLabel = this.label(
      n,
      heading,
      px + pw / 2,
      py + (small ? 29 : 48),
      small ? 23 : 36,
      pw - (help ? 112 : 56),
      small ? 46 : 60,
      C.white,
    );
    headingLabel.isBold = true;
    if (!['briefing', 'success', 'failure', 'orientation'].includes(key))
      this.button('close', '×', px + pw - 56, py + 8, 44, 44, n);
    const bottom = py + ph - 58;
    if (help) {
      const tabs = [
        ['basic', this.t('基础', 'BASIC')],
        ['advanced', this.t('进阶', 'ADVANCED')],
        ['rules', this.t('规则', 'RULES')],
      ];
      tabs.forEach(([id, str], i) =>
        this.button(
          'tab:' + id,
          str,
          px + 16 + (i * (pw - 144)) / 3,
          py + 58,
          (pw - 160) / 3,
          44,
          n,
        ),
      );
      this.button(
        'input',
        this.helpTouch ? this.t('触控', 'TOUCH') : this.t('键鼠', 'KEYS'),
        px + pw - 110,
        py + 58,
        94,
        44,
        n,
      );
      const vh = ph - 174,
        vw = pw - 44,
        mask = this.node('HelpViewport', n);
      mask.setPosition(0, this.h / 2 - (py + 112 + vh / 2));
      mask.getComponent(UITransform)!.setContentSize(vw, vh);
      mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      this.scrollArea = { x: px + 22, y: py + 112, w: vw, h: vh };
      const content = this.node('Instructions', mask);
      this.scrollNode = content;
      const rows = ACTIONS.filter(
          (a) =>
            a.group === this.helpGroup &&
            !(this.helpTouch && ['previous', 'next', 'focus'].includes(a.id)),
        ),
        rowH = this.compact && this.w >= 500 ? 56 : 90;
      this.scrollMax = Math.max(0, rows.length * rowH - vh);
      rows.forEach((a, i) => {
        const l = this.label(
          content,
          `${text(a.name, this.lang)}  ·  ${this.helpTouch ? text(a.touch, this.lang) : bindingLabel(a.id, this.lang)}\n${text(a.description, this.lang)}`,
          this.w / 2,
          0,
          rowH === 56 ? 12 : 14,
          vw - 16,
          rowH - 8,
        );
        l.node.setPosition(0, vh / 2 - i * rowH - rowH / 2);
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
      });
      this.lastHelpLine = text(rows[rows.length - 1].description, this.lang);
      this.button(
        'tutorial',
        this.t('重玩教学', 'COACH'),
        px + 16,
        bottom,
        pw < 360 ? 90 : 108,
        44,
        n,
      );
      this.button(
        'language',
        this.lang === 'zh' ? 'EN' : '中文',
        px + (pw < 360 ? 114 : 132),
        bottom,
        pw < 360 ? 44 : 56,
        44,
        n,
      );
      this.label(
        n,
        pw >= 500 ? this.t('上下滑动查看', 'SCROLL FOR MORE') : '',
        px + pw / 2 + 18,
        bottom + 22,
        11,
        Math.max(72, pw - 408),
        30,
        C.dim,
      );
      this.button(
        'fullscreen',
        this.t('全屏', 'FULL SCREEN'),
        px + pw - (pw < 360 ? 102 : 120),
        bottom,
        pw < 360 ? 86 : 104,
        44,
        n,
      );
    } else if (key === 'briefing' || key === 'mission') {
      const split = !small,
        contentTop = py + (low ? 52 : small ? 65 : 118);
      if (split) {
        this.label(n, 'NIGHT 07  /  OPERATION 01', px + pw / 2, py + 86, 12, pw - 48, 24, C.mint);
        this.routeGraphic(g, px + pw * 0.48, contentTop + 28, pw * 0.46, ph - 235);
        this.label(
          n,
          this.t('西岭 → 河谷桥 → 东岭营地', 'WEST RIDGE → RIVER → EXTRACTION'),
          px + pw * 0.71,
          py + ph - 104,
          13,
          pw * 0.5,
          32,
          C.dim,
        );
      }
      const cx = split ? px + pw * 0.25 : px + pw / 2,
        cw = split ? pw * 0.42 : pw - 36;
      this.label(
        n,
        this.t('保护救援车，打通撤离走廊。', 'Protect the rescue. Clear the road.'),
        cx,
        contentTop + 14,
        small ? 16 : 21,
        cw,
        42,
        C.white,
      ).isBold = true;
      for (const [i, message] of [
        this.t('□  救援车与护卫：保护', '□  Rescue & escort: protect'),
        this.t('◇  轻车、炮台与重甲：清除', '◇  Rovers, turrets & armor: engage'),
      ].entries())
        this.label(
          n,
          message,
          cx,
          contentTop + (low ? 52 : small ? 61 : 90) + (i - 0.5) * 24,
          small ? 14 : 17,
          cw,
          30,
          i === 0 ? C.mint : C.amber,
        );
      this.label(
        n,
        this.touch
          ? this.t('左手拖动瞄准 · 右手按住开火', 'Drag to aim · Hold FIRE with other thumb')
          : this.t(
              '鼠标瞄准 · 按住左键开火 · 1 / 2 / 3 切枪',
              'Mouse aims · Hold left button · 1 / 2 / 3 weapons',
            ),
        cx,
        contentTop + (low ? 95 : small ? 116 : 159),
        small ? 12 : 14,
        cw,
        low ? 28 : 44,
        C.dim,
      );
      const primaryW = Math.min(260, pw - 240);
      this.button(
        key === 'briefing' ? 'start' : 'resume',
        key === 'briefing'
          ? this.t('开始护送  →', 'BEGIN ESCORT  →')
          : this.t('返回任务', 'RESUME'),
        px + pw / 2 - primaryW / 2,
        bottom,
        primaryW,
        44,
        n,
      );
      this.button('help', this.t('操作帮助', 'HELP'), px + 16, bottom, 96, 44, n);
      this.button('fullscreen', this.t('全屏', 'FULL SCREEN'), px + pw - 112, bottom, 96, 44, n);
    } else if (key === 'success' || key === 'failure') {
      const success = key === 'success';
      const mainThreat = Object.entries(s.damageByThreat).sort((a, b) => b[1] - a[1])[0];
      const threatAdvice =
        mainThreat &&
        {
          light: [
            `轻车造成 ${Math.round(mainThreat[1])} 伤害。下次用速射追踪，并瞄准前方。`,
            `Light patrol: ${Math.round(mainThreat[1])} damage. Track with Rapid; lead its movement.`,
          ],
          turret: [
            `炮台造成 ${Math.round(mainThreat[1])} 伤害。下次优先用爆破炮清除固定威胁。`,
            `Turrets: ${Math.round(mainThreat[1])} damage. Clear fixed threats with Burst first.`,
          ],
          heavy: [
            `重甲造成 ${Math.round(mainThreat[1])} 伤害。下次用重炮，预留弹着提前量。`,
            `Armor: ${Math.round(mainThreat[1])} damage. Use Heavy and allow for flight time.`,
          ],
        }[mainThreat[0]];
      this.label(
        n,
        success
          ? this.t(`护送评价  ${s.rating}`, `RATING  ${s.rating}`)
          : this.t(
              s.failure === 'vehicle' ? '救援车被毁' : '撤离窗口关闭',
              s.failure === 'vehicle' ? 'Rescue vehicle lost' : 'Evacuation window closed',
            ),
        px + pw / 2,
        py + (low ? 73 : small ? 75 : 120),
        small ? 24 : 44,
        pw - 40,
        low ? 36 : 60,
        success ? C.mint : C.red,
      ).isBold = true;
      const statY = py + (low ? 110 : small ? 123 : 212),
        statW = (pw - 48) / 3;
      for (const [i, [value, caption]] of [
        [`${Math.round((s.rescue.hp / s.rescue.maxHp) * 100)}%`, this.t('救援车生命', 'RESCUE')],
        [`${s.kills} / ${MISSION.events.length}`, this.t('清除威胁', 'THREATS')],
        [`${Math.round(s.friendlyDamage)}`, this.t('友方损伤', 'FRIENDLY DAMAGE')],
      ].entries()) {
        const x = px + 24 + statW * (i + 0.5);
        this.label(n, value, x, statY, small ? 21 : 32, statW - 8, low ? 36 : 44, C.white);
        this.label(n, caption, x, statY + 29, 12, statW - 8, 22, C.dim);
      }
      const advice = success
        ? s.rating === 'S'
          ? this.t(
              `用时 ${Math.floor(s.time)}s · 开火 ${s.fired} 发。再挑战：保住车队，减少耗弹。`,
              `Time ${Math.floor(s.time)}s · ${s.fired} rounds. Challenge: same escort, fewer shots.`,
            )
          : this.t(
              '下次目标：救援车 ≥70%，全程零友伤，获得 S。',
              'Next: ≥70% rescue health and zero friendly damage for S.',
            )
        : s.failure === 'timeout'
          ? this.t(
              '待命期间倒计时继续。清路后尽快点击「车队继续」。',
              'HOLD does not stop the clock. Clear the road and GO.',
            )
          : s.failureCause === 'friendly'
            ? this.t(
                '致命伤来自己方火力。下次开炮前检查范围圈。',
                'Lost to friendly fire. Check the blast circle before shooting.',
              )
            : threatAdvice
              ? text(threatAdvice, this.lang)
              : this.t(
                  '敌袭摧毁救援车。清除沿线威胁，必要时让车队待命。',
                  'Lost to hostile fire. Clear nearby threats; HOLD if needed.',
                );
      this.label(
        n,
        advice,
        px + pw / 2,
        py + ph - (low ? 74 : small ? 86 : 126),
        small ? 13 : 16,
        pw - 42,
        low ? 24 : small ? 44 : 62,
        C.dim,
      );
      this.button(
        'retry',
        this.t('再次出动  ↻', 'RETRY  ↻'),
        px + pw / 2 - 105,
        bottom,
        210,
        44,
        n,
      );
      this.button('fullscreen', this.t('全屏', 'FULL SCREEN'), px + pw - 112, bottom, 96, 44, n);
    } else if (key === 'orientation') {
      this.label(n, '↻', px + pw / 2, py + ph * 0.32, 60, pw - 30, 90, C.mint);
      this.label(
        n,
        this.t(
          '双手操作，更容易看清前路。\n任务已暂停，横屏后继续。',
          'Two thumbs. A clear view of the road.\nMission paused until landscape.',
        ),
        px + pw / 2,
        py + ph * 0.53,
        15,
        pw - 30,
        110,
        C.white,
      );
      this.button('help', this.t('操作帮助', 'HELP'), px + 16, bottom, (pw - 40) / 2, 44, n);
      this.button(
        'fullscreen',
        this.t('全屏', 'FULL SCREEN'),
        px + 24 + (pw - 40) / 2,
        bottom,
        (pw - 40) / 2,
        44,
        n,
      );
    } else {
      this.label(
        n,
        this.t('松开扳机，稍作休整。', 'Take a breath. Trigger released.'),
        px + pw / 2,
        py + (low ? 76 : small ? 92 : ph * 0.39),
        small ? 17 : 24,
        pw - 48,
        44,
        C.white,
      );
      this.label(
        n,
        this.t(
          '世界与倒计时已冻结 · 继续后重新按下开火',
          'World and clock frozen · Press FIRE again after resuming',
        ),
        px + pw / 2,
        py + (low ? 104 : small ? 131 : ph * 0.55),
        small ? 12 : 15,
        pw - 40,
        low ? 24 : 32,
        C.dim,
      );
      const gap = 8,
        bw = Math.min(130, (pw - 56) / 4),
        total = bw * 4 + gap * 3,
        bx = px + (pw - total) / 2;
      this.button('help', this.t('操作帮助', 'HELP'), bx, py + ph - 114, bw, 44, n);
      this.button(
        'sound',
        this.muted ? this.t('声音：关', 'SOUND OFF') : this.t('声音：开', 'SOUND ON'),
        bx + bw + gap,
        py + ph - 114,
        bw,
        44,
        n,
      );
      this.button(
        'effects',
        this.reducedEffects ? this.t('特效：简', 'FX: LOW') : this.t('特效：全', 'FX: FULL'),
        bx + 2 * (bw + gap),
        py + ph - 114,
        bw,
        44,
        n,
      );
      this.button(
        'fullscreen',
        this.t('全屏', 'FULL SCREEN'),
        bx + 3 * (bw + gap),
        py + ph - 114,
        bw,
        44,
        n,
      );
      this.button(
        'resume',
        this.t('继续护送  →', 'RESUME ESCORT  →'),
        px + pw / 2 - 110,
        bottom,
        220,
        44,
        n,
      );
    }
    for (const b of this.buttons.filter((b) => b.label.node.parent === n)) {
      const primary = ['start', 'retry', 'resume'].includes(b.id);
      this.rect(g, b.x, b.y, b.w, b.h, primary ? '#91e6cb' : '#1b3038', primary ? C.mint : C.line);
      b.label.color = col(primary ? '#10252a' : C.white);
      b.label.isBold = primary;
    }
  }
  update(s: Simulation, world: World) {
    const w = this.w,
      h = this.h,
      g = this.g,
      top = this.safe.top,
      by = h - this.footer - this.safe.bottom;
    let key = s.phase === 'playing' ? '' : s.phase;
    if (s.pauses.has('help')) key = 'help:' + this.helpGroup + this.helpTouch + this.lang;
    else if (s.pauses.has('orientation')) key = 'orientation';
    else if (s.pauses.has('mission')) key = 'mission';
    else if (s.paused) key = 'pause';
    this.renderModal(key, s);
    g.clear();
    this.marks.clear();
    for (const l of Array.from(this.labels.values())) l.node.active = !key;
    for (const l of Array.from(this.unitLabels.values())) l.node.active = false;
    const secondary = [
      'sensor',
      'locate',
      'zoomOut',
      'zoomIn',
      'mission',
      'help',
      'fullscreen',
      'sound',
    ];
    for (const b of this.buttons) {
      if (b.label.node.parent === this.root)
        b.label.node.active = !key && (!secondary.includes(b.id) || this.toolsOpen);
      if (b.id === 'fullscreen')
        b.label.string = this.fullscreen
          ? this.t('退出全屏', 'EXIT FULL')
          : this.t('全屏', 'FULL SCREEN');
    }
    if (key) return;
    this.rect(g, 0, 0, w, 58 + top, '#0c191ff5');
    this.rect(g, 0, by, w, this.footer + this.safe.bottom, '#0c191ff5');
    this.rect(
      g,
      12 + this.safe.left,
      56 + top,
      (w - 24 - this.safe.left - this.safe.right) * s.ratio,
      2,
      C.mint,
    );
    const gun = s.guns[s.selected],
      weapon = WEAPONS[s.selected],
      reason = s.reason(),
      danger = s.friendlyRisk || s.time - s.friendHitAt < 2;
    this.set('title', this.t('夜航 / 07', 'NIGHT / 07'));
    this.set(
      'health',
      this.t(
        `□ 救援车  ${Math.ceil((s.rescue.hp / s.rescue.maxHp) * 100)}%`,
        `□ RESCUE  ${Math.ceil((s.rescue.hp / s.rescue.maxHp) * 100)}%`,
      ),
    );
    this.labels.get('health')!.color = col(s.rescue.hp / s.rescue.maxHp < 0.3 ? C.red : C.mint);
    this.set(
      'progress',
      this.t(
        `撤离 ${Math.floor(s.ratio * 100)}%  ·  清除 ${s.kills}/${MISSION.events.length}`,
        `ROUTE ${Math.floor(s.ratio * 100)}% · ${s.kills}/${MISSION.events.length}`,
      ),
    );
    this.set(
      'status',
      `${world.thermal ? 'IR' : 'DAY'}   ${Math.floor(s.remaining / 60)}:${String(Math.ceil(s.remaining) % 60).padStart(2, '0')}`,
    );
    this.set(
      'sector',
      w > 1000 ? text(SECTORS.find((a) => s.ratio <= a.end)!.name, this.lang) : '',
    );
    this.set(
      'hold',
      s.convoy === 'holdRequested'
        ? this.t('前往下一待命点', 'TO NEXT HOLD POINT')
        : s.convoy === 'holding'
          ? this.t('待命中 · 时间继续', 'HOLDING · CLOCK RUNS')
          : '',
    );
    this.set(
      'weaponState',
      this.t(
        `${weapon.flight.toFixed(2)}s 弹着\n${gun.overheated ? '过热 · 冷却至40' : gun.cooldown > 0 && s.selected > 0 ? '装填 ' + gun.cooldown.toFixed(1) + 's' : '热量 ' + Math.round(gun.heat) + '%'}`,
        `${weapon.flight.toFixed(2)}s FLIGHT\n${gun.overheated ? 'OVERHEATED' : gun.cooldown > 0 && s.selected > 0 ? 'RELOAD ' + gun.cooldown.toFixed(1) + 's' : 'HEAT ' + Math.round(gun.heat) + '%'}`,
      ),
    );
    const reasons: Record<string, string[]> = {
      protected: ['保护区 · 禁止开火', 'PROTECTED ZONE · FIRE BLOCKED'],
      overheated: ['武器过热 · 等待降温或切枪', 'OVERHEATED · COOL OR SWITCH'],
      empty: ['弹药耗尽 · 切换武器', 'EMPTY · SWITCH WEAPON'],
      outside: ['准星超出任务区域', 'OUTSIDE MISSION AREA'],
    };
    let notice = reasons[reason]
      ? text(reasons[reason], this.lang)
      : s.rescue.hp / s.rescue.maxHp < 0.3
        ? this.t('救援车危急 · 优先清除附近威胁', 'RESCUE CRITICAL · CLEAR NEARBY THREATS')
        : s.time - s.waveAt < 4
          ? text(MISSION.events[s.lastWave]?.direction || ['', ''], this.lang)
          : s.convoy === 'holding'
            ? this.t('前路安全后，点击「车队继续」', 'CLEAR THE ROAD, THEN GO')
            : s.warning === 'armor'
              ? this.t('重甲抗速射 · 切换 3 重型炮', 'ARMOR · SWITCH TO 3 HEAVY')
              : s.warning === 'lead'
                ? this.t('炮弹有延迟 · 瞄准移动方向前方', 'LEAD THE TARGET · ALLOW FLIGHT TIME')
                : '';
    if (Date.now() < this.toastUntil) notice = this.toast;
    this.set('notice', notice);
    this.set(
      'friendWarning',
      danger
        ? s.time - s.friendHitAt < 2
          ? this.t('！正在误伤友方 · 停止射击', '! FRIENDLY HIT · CEASE FIRE')
          : this.t('！范围内有友方 · 当心误伤', '! FRIENDLY IN BLAST RADIUS')
        : '',
    );
    if (notice)
      this.rect(
        g,
        (this.compact ? (w + 158) / 2 : w / 2) - Math.min(w - 184, 600) / 2,
        top + 59,
        Math.min(w - 184, 600),
        40,
        '#14252aec',
      );
    if (danger)
      this.rect(
        g,
        w / 2 - Math.min(w - 32, 560) / 2,
        top + 91,
        Math.min(w - 32, 560),
        28,
        '#381c26ed',
      );
    const step = TUTORIAL.find((e) => !s.completed.has(e));
    this.set(
      'tutorial',
      this.tutorial && step
        ? `${TUTORIAL.indexOf(step) + 1}/${TUTORIAL.length}  ${tutorialText(step, this.lang, this.touch)}`
        : '',
    );
    if (this.tutorial && step)
      this.rect(
        g,
        12 + this.safe.left,
        by - 32,
        w - 24 - this.safe.left - this.safe.right,
        30,
        '#10232bdd',
      );
    if (this.toolsOpen) {
      this.rect(
        g,
        this.compact ? 8 + this.safe.left : w - 266 - this.safe.right,
        top + 58,
        this.compact ? w - 16 - this.safe.left - this.safe.right : 258,
        this.compact ? 102 : 198,
        C.ink,
        C.line,
      );
      for (const id of ['notice', 'friendWarning', 'hold', 'target', 'flight'])
        this.labels.get(id)!.node.active = false;
    }
    for (const b of this.buttons.filter(
      (b) => b.label.node.parent === this.root && b.label.node.active,
    )) {
      const selected = b.id === 'weapon' + s.selected;
      if (b.id.startsWith('weapon')) {
        const i = Number(b.id.slice(-1)),
          a = s.guns[i];
        b.label.string = `${this.touch ? '' : i + 1 + ' '}${text(WEAPONS[i].name, this.lang)}\n${this.t(['轻车', '炮台', '重甲'][i], ['LIGHT', 'TURRET', 'ARMOR'][i])} · ${a.ammo === Infinity ? '∞' : a.ammo}`;
      }
      if (b.id === 'convoy')
        b.label.string =
          (this.touch ? '' : 'T · ') +
          (s.convoy === 'moving'
            ? this.t('车队等待', 'HOLD CONVOY')
            : s.convoy === 'holdRequested'
              ? this.t('取消等待', 'CANCEL HOLD')
              : this.t('车队继续 →', 'CONVOY GO →'));
      if (b.id === 'fire')
        b.label.string =
          actionLabel('fire', this.lang, this.touch, weapon.automatic) +
          '\n' +
          (reason === 'protected'
            ? this.t('禁止开火', 'BLOCKED')
            : reason === 'overheated'
              ? this.t('过热', 'OVERHEATED')
              : reason === 'empty'
                ? this.t('无弹药', 'EMPTY')
                : gun.cooldown > 0 && s.selected > 0
                  ? this.t(
                      '装填 ' + gun.cooldown.toFixed(1) + 's',
                      'RELOAD ' + gun.cooldown.toFixed(1) + 's',
                    )
                  : weapon.automatic
                    ? this.t('松开即停', 'RELEASE TO STOP')
                    : this.t('每次一发', 'ONE SHOT / PRESS'));
      if (b.id === 'sensor')
        b.label.string = world.thermal
          ? this.t('热成像 → 日光', 'THERMAL → DAY')
          : this.t('日光 → 热成像', 'DAY → THERMAL');
      if (b.id === 'sound')
        b.label.string = this.muted
          ? this.t('声音：关', 'SOUND OFF')
          : this.t('声音：开', 'SOUND ON');
      this.rect(
        g,
        b.x,
        b.y,
        b.w,
        b.h,
        b.id === 'fire' ? (danger ? '#482832' : '#234a42') : selected ? '#233e40' : '#12252c',
        b.id === 'fire' && danger ? C.red : selected ? C.mint : C.line,
      );
      b.label.color = col(selected ? C.mint : C.white);
      b.label.isBold = selected || b.id === 'fire';
      if (b.id.startsWith('weapon')) {
        const a = s.guns[Number(b.id.slice(-1))];
        if (selected) this.rect(g, b.x, b.y, 3, b.h, C.mint);
        this.rect(
          g,
          b.x + 5,
          b.y + b.h - 5,
          ((b.w - 10) * a.heat) / 100,
          2,
          a.overheated ? C.red : C.amber,
        );
      }
    }
    if (!this.toolsOpen) this.drawWorld(s, world);
  }
  drawWorld(s: Simulation, world: World) {
    const g = this.marks;
    drawEffects(g, s, world, this.w, this.h, this.reducedEffects);
    const project = (p: Point, y = 0) => {
      const q = world.project(p, y);
      return { x: q.x / view.getScaleX() - this.w / 2, y: q.y / view.getScaleY() - this.h / 2 };
    };
    for (const [id, l] of Array.from(this.unitLabels.entries()))
      if (!s.units.some((u) => u.id === id)) {
        l.node.destroy();
        this.unitLabels.delete(id);
      }
    for (const p of PROTECTED) {
      const q = project(p),
        ex = project({ x: p.x + p.radius, z: p.z }),
        ez = project({ x: p.x, z: p.z + p.radius });
      g.strokeColor = col('#729e9180');
      g.lineWidth = 1;
      g.ellipse(q.x, q.y, Math.abs(ex.x - q.x), Math.abs(ez.y - q.y));
      g.stroke();
    }
    for (const d of HOLD_POINTS) {
      const q = project(routePoint(d));
      g.strokeColor = col(C.amber);
      g.lineWidth = 1;
      g.circle(q.x, q.y, 6);
      g.stroke();
    }
    const placed: { x: number; y: number }[] = [],
      bottom = -this.h / 2 + this.footer + 44,
      top = this.h / 2 - 64 - this.safe.top;
    const banners = ['notice', 'friendWarning', 'hold']
      .map((id) => this.labels.get(id)!)
      .filter((l) => l.node.active && l.string);
    const overBanner = (x: number, y: number, halfWidth: number) =>
      banners.some((l) => {
        const p = l.node.position,
          size = l.node.getComponent(UITransform)!.contentSize;
        return (
          Math.abs(x - p.x) < size.width / 2 + halfWidth && Math.abs(y - p.y) < size.height / 2 + 12
        );
      });
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      const q = project(u, 2.3),
        r = u.kind === 'heavy' ? 11 : 8;
      if (q.x < -this.w / 2 + 8 || q.x > this.w / 2 - 8 || q.y > top || q.y < bottom - 30) continue;
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
      g.rect(q.x - 12, q.y + 14, (24 * u.hp) / u.maxHp, 2);
      g.fill();
      if (u.kind === 'escort') continue;
      let l = this.unitLabels.get(u.id);
      if (!l) {
        l = this.label(this.root, '', 0, 0, 12, 90, 22);
        l.isBold = true;
        this.unitLabels.set(u.id, l);
      }
      l.node.active = true;
      l.color = col(u.friendly ? C.mint : C.amber);
      l.string = u.friendly
        ? this.t('□ 救援车', '□ RESCUE')
        : this.t(
            u.kind === 'heavy' ? '重甲' : u.kind === 'turret' ? '炮台' : '轻车',
            u.kind.toUpperCase(),
          );
      let tag = { x: q.x, y: q.y + 29 },
        fits = false;
      const aim = project(s.aim);
      for (const [dx, dy] of [
        [0, 29],
        [0, -25],
        [62, 10],
        [-62, 10],
        [0, 52],
      ]) {
        tag = {
          x: Math.max(-this.w / 2 + 48, Math.min(this.w / 2 - 48, q.x + dx)),
          y: Math.max(bottom, Math.min(top - 12, q.y + dy)),
        };
        fits =
          !overBanner(tag.x, tag.y, 45) &&
          !placed.some((p) => Math.abs(p.x - tag.x) < 86 && Math.abs(p.y - tag.y) < 24) &&
          !(Math.abs(tag.x - aim.x) < 52 && Math.abs(tag.y - aim.y) < 30) &&
          !s.units.some((other) => {
            const p = project(other, 2.3);
            return other.hp > 0 && Math.abs(tag.x - p.x) < 44 && Math.abs(tag.y - p.y) < 22;
          });
        if (fits) break;
      }
      if (!fits && !u.friendly) {
        l.node.active = false;
        continue;
      }
      placed.push(tag);
      l.node.setPosition(tag.x, tag.y);
      this.rect(g, tag.x + this.w / 2 - 34, this.h / 2 - tag.y - 11, 68, 22, '#0c191fc9');
      if (Math.abs(tag.x - q.x) > 15 || Math.abs(tag.y - q.y) > 36) {
        g.strokeColor = col(C.line);
        g.lineWidth = 1;
        g.moveTo(q.x, q.y);
        g.lineTo(tag.x, tag.y);
        g.stroke();
      }
    }
    const q = project(s.aim),
      radius = WEAPONS[s.selected].radius,
      edge = project({ x: s.aim.x + radius, z: s.aim.z }),
      rz = project({ x: s.aim.x, z: s.aim.z + radius });
    g.strokeColor = col(s.reason() === 'protected' || s.friendlyRisk ? C.red : C.mint);
    g.lineWidth = 1.5;
    g.ellipse(q.x, q.y, Math.abs(edge.x - q.x), Math.abs(rz.y - q.y));
    g.stroke();
    for (const sign of [-1, 1]) {
      g.moveTo(q.x + sign * 7, q.y);
      g.lineTo(q.x + sign * 18, q.y);
      g.moveTo(q.x, q.y + sign * 7);
      g.lineTo(q.x, q.y + sign * 18);
    }
    g.stroke();
    g.circle(q.x, q.y, 2);
    g.stroke();
    const target = s.aimedUnit;
    const recentImpacts = [...s.events]
      .reverse()
      .filter((e) => e.type === 'impact' && s.time - e.time < 1.1);
    // A following round landing on a wreck must not erase the destruction confirmation.
    const impact =
      recentImpacts.find((e) => e.outcome === 'friendly') ||
      recentImpacts.find((e) => e.outcome === 'destroyed') ||
      recentImpacts[0];
    const outcome = impact?.outcome;
    const feedback =
      outcome === 'destroyed'
        ? this.t('◆ 威胁已清除', '◆ THREAT ELIMINATED')
        : outcome === 'friendly'
          ? this.t('！友方受损', '! FRIENDLY DAMAGED')
          : outcome === 'armor'
            ? this.t('装甲低伤 · 换重炮', 'ARMOR · USE HEAVY')
            : outcome === 'hit'
              ? this.t(
                  `命中 −${Math.round(impact!.damage || 0)}`,
                  `HIT −${Math.round(impact!.damage || 0)}`,
                )
              : outcome === 'miss'
                ? this.t('未命中', 'MISS')
                : '';
    this.set(
      'target',
      target?.friendly ? this.t('友方目标 · 请勿射击', 'FRIENDLY · DO NOT FIRE') : feedback,
    );
    this.labels.get('target')!.color = col(
      outcome === 'friendly' || target?.friendly ? C.red : outcome === 'miss' ? C.dim : C.amber,
    );
    // Both transient labels use the same avoidance rule; never clamp text onto the reticle.
    const placeFeedback = (label: Label, p: Point) => {
      const cursor = project(s.aim);
      for (const [dx, dy] of [
        [100, 0],
        [-100, 0],
        [0, -48],
        [0, 48],
        [100, -44],
        [-100, 44],
      ]) {
        const x = p.x + dx,
          y = p.z + dy;
        if (x < -this.w / 2 + 84 || x > this.w / 2 - 84 || y < bottom + 12 || y > top - 24)
          continue;
        if (Math.abs(x - cursor.x) < 100 && Math.abs(y - cursor.y) < 34) continue;
        if (overBanner(x, y, 78)) continue;
        if (placed.some((q) => Math.abs(x - q.x) < 122 && Math.abs(y - q.y) < 26)) continue;
        if (
          s.units.some((u) => {
            const q = project(u, 2.3);
            return u.hp > 0 && Math.abs(x - q.x) < 96 && Math.abs(y - q.y) < 30;
          })
        )
          continue;
        if (this.blocksBattlefield(x + this.w / 2, this.h / 2 - y)) continue;
        label.node.setPosition(x, y);
        placed.push({ x, y });
        return true;
      }
      return false;
    };
    if (impact || target?.friendly) {
      const p = project(target?.friendly ? s.aim : impact!);
      const label = this.labels.get('target')!;
      label.node.active = placeFeedback(label, { x: p.x, z: p.y });
      // Dense fights keep the hit marker; move text to the weapon readout rather than cover targets.
      if (!label.node.active) this.set('weaponState', label.string);
    }
    if (impact && outcome !== 'miss' && s.time - impact.time < 0.22) {
      const p = project(impact);
      g.strokeColor = col(outcome === 'friendly' ? C.red : C.white);
      g.lineWidth = 2;
      for (const x of [-1, 1])
        for (const y of [-1, 1]) {
          g.moveTo(p.x + x * 5, p.y + y * 5);
          g.lineTo(p.x + x * 10, p.y + y * 10);
        }
      g.stroke();
    }
    const next = s.selected > 0 ? s.shots.find((a) => a.weapon > 0) : undefined,
      flight = this.labels.get('flight')!;
    flight.string = next
      ? this.t(
          `弹着 ${(next.due - s.time).toFixed(1)}s`,
          `IMPACT ${(next.due - s.time).toFixed(1)}s`,
        )
      : '';
    if (next) {
      const p = project(next);
      flight.node.active = placeFeedback(flight, { x: p.x, z: p.y });
    }
  }
}
