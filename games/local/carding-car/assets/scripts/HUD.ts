import {
  Camera,
  Canvas,
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
  view,
  ResolutionPolicy,
  sys,
} from 'cc';
import { KartConfig as C, type KartInput } from './KartConfig';
import type { RaceManager } from './RaceManager';
import { formatTime as time, recordFeedback, type RaceRecord } from './RankingSystem';
import { DrivingCoach } from './DrivingCoach';
import { defaultSelection, vehicles, drivers, selectionRows, type Selection } from './Selection';
import { themes } from './ThemeCatalog';
import { routes } from './RouteCatalog';
import { STAMPS, stampCount, passportCount, earnedStamps, sprintNextGoal, type RoutePassport, type KartChallenge } from './RouteChallenges';
const keyboardHints = sys.isBrowser && !sys.isMobile;
const color = (v: string) => new Color().fromHEX(v);
export class HUD {
  root: Node;
  top: Label;
  timer: Label;
  speed: Label;
  message: Label;
  count: Label;
  panel: Node;
  title: Label;
  detail: Label;
  button: Label;
  standings: Label;
  leaderboard: Label;
  footer: Label;
  nitro: Label;
  restartButton: Node;
  restartLabel: Label;
  garageButton: Node;
  garageLabel: Label;
  picker: Node;
  choices: Label[] = [];
  selection: Selection = { ...defaultSelection };
  tagline: Label;
  meter: Graphics;
  map: Graphics;
  mapRoute: Graphics;
  mappedTrack?: RaceManager['track'];
  controls: Graphics;
  sound: Label;
  lastPhase = '';
  records: RaceRecord[] = [];
  previousBest?: number;
  passport: RoutePassport = {};
  challenge?: KartChallenge;
  challengeNotice = '';
  coach = new DrivingCoach();
  coaching: Label;
  help: Label;
  pause: Label;
  rulesVisible = false;
  constructor(parent: Node) {
    view.setDesignResolutionSize(960, 540, ResolutionPolicy.SHOW_ALL);
    this.root = new Node('HUD');
    this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(960, 540);
    this.root.setPosition(480, 270, 0);
    const canvas = this.root.addComponent(Canvas),
      cameraNode = new Node('HUDCamera');
    parent.addChild(cameraNode);
    cameraNode.setPosition(480, 270, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 270;
    camera.near = 0.1;
    camera.far = 2000;
    camera.priority = 10;
    camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = camera;
    this.box(this.root, -354, 216, 216, 64, '#173c55ee');
    this.top = this.label(this.root, '1 / 4   ·   第 1 / 3 圈', -354, 216, 22, '#fff6dc', 214, 60);
    this.box(this.root, 0, 220, 458, 64, '#173c55ee');
    this.timer = this.label(this.root, '', 0, 220, 20, '#fff6dc', 450, 62);
    this.box(this.root, -410, 90, 96, 48, '#173c55dd');
    this.sound = this.label(this.root, '声音 开', -410, 90, 18, '#fff6dc', 96, 48);
    this.box(this.root, -410, 30, 72, 48, '#173c55');
    this.pause = this.label(this.root, 'Ⅱ', -410, 30, 24, '#fff6dc', 72, 48);
    this.box(this.root, -410, -30, 96, 48, '#173c55');
    this.help = this.label(this.root, '收起教学', -410, -30, 18, '#fff6dc', 96, 48);
    this.box(this.root, 0, -209, 180, 70, '#173c55ee');
    this.speed = this.label(this.root, '0  km/h', 0, -200, 30, '#fff6dc', 180, 48);
    this.label(
      this.root,
      !keyboardHints ? '自动加速' : 'W / ↑ 前进',
      0,
      -230,
      12,
      '#b8dcda',
      180,
      20,
    );
    this.box(this.root, 0, 170, 560, 34, '#173c55dd');
    this.message = this.label(this.root, '', 0, 170, 21, '#fff6dc', 550, 45);
    const coachPanel = new Node('DrivingCoach');
    coachPanel.layer = Layers.Enum.UI_2D;
    this.root.addChild(coachPanel);
    this.box(coachPanel, 65, 129, 620, 36, '#173c55ee');
    this.coaching = this.label(coachPanel, '', 65, 129, 17, '#69dfc0', 610, 36);
    this.count = this.label(this.root, '', 0, 35, 92, '#fff7dd', 700, 150);
    this.meter = this.graphics(this.root, 'DriftMeter');
    this.controls = this.graphics(this.root, 'TouchControls');
    this.label(this.root, '‹          ›', -326, -169, 42, '#fff7dd', 240, 72);
    this.label(this.root, '转向', -326, -225, 14, '#fff6dc', 220, 30);
    this.label(this.root, '刹车/倒车', 194, -171, 18, '#fff7dd', 90, 80);
    this.label(this.root, '漂移', 365, -165, 27, '#193c54', 140, 90);
    this.nitro = this.label(this.root, '', 365, -10, 20, '#193c54', 150, 70);
    this.box(this.root, 340, -229, 230, 26, '#173c55dd');
    this.label(this.root, '按住过弯 · 松手加速', 340, -229, 14, '#fff6dc', 230, 28);
    this.mapRoute = this.graphics(this.root, 'MiniMapRoute');
    this.map = this.graphics(this.root, 'MiniMap');
    this.panel = new Node('Menu');
    this.root.addChild(this.panel);
    this.panel.layer = Layers.Enum.UI_2D;
    this.box(this.panel, 0, -6, 710, 390, '#163b55f5');
    this.tagline = this.label(this.panel, '海湾三圈挑战', 0, 168, 16, '#69dfc0', 530, 25);
    this.title = this.label(this.panel, '浪湾卡丁车', 0, 127, 40, '#fff6dc', 650, 55);
    this.detail = this.label(
      this.panel,
      '3 圈海湾竞速 · 3 位对手\n转弯时按住漂移，松手冲出去',
      0,
      76,
      19,
      '#d1e9e4',
      650,
      52,
    );
    this.standings = this.label(this.panel, '', -174, -23, 18, '#d1e9e4', 325, 146);
    this.leaderboard = this.label(this.panel, '', 174, -23, 18, '#69dfc0', 325, 146);
    this.box(this.panel, 0, -125, 286, 52, '#ffd15a');
    this.button = this.label(this.panel, '开 跑  →', 0, -125, 24, '#173b53', 280, 52);
    this.restartButton = new Node('RestartButton');
    this.restartButton.layer = Layers.Enum.UI_2D;
    this.panel.addChild(this.restartButton);
    this.box(this.restartButton, 263, -125, 170, 52, '#295870');
    this.restartLabel = this.label(this.restartButton, '重新开跑', 263, -125, 20, '#fff6dc', 170, 52);
    this.restartButton.active = false;
    this.garageButton = new Node('GarageButton');
    this.garageButton.layer = Layers.Enum.UI_2D;
    this.panel.addChild(this.garageButton);
    this.box(this.garageButton, -263, -125, 170, 52, '#295870');
    this.garageLabel = this.label(this.garageButton, '更换配置', -263, -125, 20, '#fff6dc', 170, 52);
    this.picker = new Node('Selection');
    this.picker.layer = Layers.Enum.UI_2D;
    this.panel.addChild(this.picker);
    for (const { y } of selectionRows) {
      this.box(this.picker, 0, y, 590, 38, '#295870');
      this.label(this.picker, '‹', -270, y, 30, '#ffd15a', 50, 38);
      this.label(this.picker, '›', 270, y, 30, '#ffd15a', 50, 38);
      this.choices.push(this.label(this.picker, '', 0, y, 20, '#fff6dc', 480, 38));
    }
    this.footer = this.label(this.panel, '', 0, -176, 14, '#a9cdd0', 660, 32);
  }
  graphics(parent: Node, name: string) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform).setContentSize(960, 540);
    return n.addComponent(Graphics);
  }
  box(parent: Node, x: number, y: number, w: number, h: number, hex: string) {
    const g = this.graphics(parent, 'Panel');
    g.fillColor = color(hex);
    g.roundRect(x - w / 2, y - h / 2, w, h, 14);
    g.fill();
    return g;
  }
  label(
    parent: Node,
    text: string,
    x: number,
    y: number,
    size: number,
    hex: string,
    w: number,
    h: number,
  ) {
    const n = new Node(text || 'Text');
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(w, h);
    const l = n.addComponent(Label);
    l.string = text;
    l.fontSize = size;
    l.lineHeight = size * 1.35;
    l.color = color(hex);
    l.isBold = true;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
  }
  update(r: RaceManager, input: KartInput, muted: boolean) {
    const k = r.drivers[0].kart,
      p = r.drivers[0].progress,
      place = r.order.indexOf(0) + 1,
      finishTime = p.finishedAt || r.time;
    this.top.string = `第 ${place} / ${r.drivers.length} 名\n第 ${Math.min(r.laps, p.laps + 1)} / ${r.laps} 圈`;
    this.timer.string = r.mode === 'sprint'
      ? `一圈冲刺 ${time(finishTime)}\n漂移加速 ${r.driftBoosts} 次 · 有益补给 ${r.suppliesCollected} 个`
      : `总计 ${time(finishTime)}   ·   本圈 ${time(r.currentLapTime)}\n最快圈 ${r.bestLapTime ? time(r.bestLapTime) : '—'}`;
    this.speed.string = `${Math.round(k.speed * 3.6)} km/h`;
    this.sound.string = muted ? '声音 关' : '声音 开';
    this.pause.string = r.networked ? '房间' : 'Ⅱ';
    this.help.string = r.networked
      ? this.rulesVisible ? '收起规则' : '竞赛规则'
      : this.coach.enabled ? '收起教学' : '驾驶教学';
    this.coaching.node.parent!.active =
      (r.networked ? this.rulesVisible : this.coach.enabled) && (r.phase === 'racing' || r.phase === 'countdown');
    this.coaching.string = r.networked
      ? '合法完成 3 圈比用时 · 首车冲线后 60 秒截止 · 房间中不暂停比赛'
      : this.coach.hint(keyboardHints);
    this.nitro.string =
      k.nitroCooldown > 0
        ? `氮气 ${k.nitroCooldown.toFixed(1)}s`
        : !keyboardHints
          ? '氮气加速'
          : '氮气 Shift';
    this.panel.active =
      ['ready', 'paused', 'finished'].includes(r.phase) &&
      !this.root.getChildByName('MultiplayerRoom')?.active;
    this.picker.active = r.phase === 'ready';
    this.garageButton.active = !r.networked && r.phase === 'ready' || r.phase === 'paused' || r.phase === 'finished';
    this.garageLabel.string = r.phase === 'ready'
      ? r.mode === 'sprint' ? '选 3 圈竞速' : '选一圈冲刺'
      : r.phase === 'finished' && !r.networked ? '退出本局' : '更换配置';
    this.standings.node.active = this.leaderboard.node.active = r.phase !== 'ready';
    if (r.phase !== this.lastPhase || r.phase === 'finished') {
      this.lastPhase = r.phase;
      this.restartButton.active = r.phase === 'paused' || (r.phase === 'finished' && !r.networked && p.finishedAt > 0);
      this.restartLabel.string = r.phase === 'finished' ? '分享挑战' : '重新开跑';
      this.leaderboard.string = `${r.mode === 'sprint' ? '一圈冲刺' : '本路线'}最快 5 场\n${
        this.records.length
          ? this.records
              .map(
                (record, i) =>
                  `${i + 1}   ${time(record.time)}   ${record.place ? `第 ${record.place} 名` : '旧纪录'}`,
              )
              .join('\n')
          : '完成比赛后记录成绩'
      }`;
      if (r.phase === 'ready') {
        this.title.string = '浪湾卡丁车';
        this.detail.string = '3 圈海湾竞速 · 3 位对手\n转弯时按住漂移，松手冲出去';
        this.button.string = '开 跑  →';
        this.standings.string =
          '驾驶小贴士\n提前转向切入弯心\n转弯时按住漂移蓄力\n松手获得出弯加速';
        this.footer.string = !keyboardHints
          ? '自动加速 · 左手转向 · 右手漂移 / 氮气 · 按住刹车可倒车'
          : 'W/↑ 前进 · S/↓ 倒车 · A D/← → 转向 · 空格漂移 · Shift 氮气';
      }
      if (r.phase === 'paused') {
        this.title.string = '休息一下';
        this.detail.string = '计时已停止\n两手就位，再来一个漂亮的漂移';
        this.button.string = '继续比赛  →';
        this.standings.string = `当前第 ${place} 名\n总计 ${time(r.time)}\n本圈 ${time(r.currentLapTime)}\n最快圈 ${r.bestLapTime ? time(r.bestLapTime) : '—'}`;
        this.footer.string = keyboardHints
          ? 'Enter / P 继续   ·   R 重新开跑   ·   本机成绩仅保存在当前设备'
          : '本机成绩仅保存在当前设备';
      }
      if (r.phase === 'finished') {
        this.title.string = place === 1 ? '冠军，漂亮！' : `第 ${place} 名，冲线！`;
        this.detail.string = r.networked
          ? `${p.finishedAt ? `完赛 ${time(p.finishedAt)}` : '未完成 3 圈，不产生有效成绩'}   ·   最快圈 ${r.bestLapTime ? time(r.bestLapTime) : '—'}\n服务端校验圈数、检查点与完赛时间`
          : `总计 ${time(finishTime)}   ·   最快圈 ${time(r.bestLapTime)}\n${r.boosts} 次加速   ·   ${r.collisions} 次碰撞`;
        this.button.string = '再跑一场  →';
        this.standings.string = `本场成绩 · ${r.drivers.filter(d => d.progress.finishedAt > 0).length}/${r.drivers.length} 完赛\n${r.order
          .map((driver, i) => {
            const progress = r.drivers[driver].progress;
            return `${i + 1}  ${driver === 0 ? '你' : r.names[driver] || `对手 ${driver}`}  ${progress.finishedAt
              ? time(progress.finishedAt) : r.networked ? '未完赛' : `比赛中 · 第 ${Math.min(r.laps, progress.laps + 1)} 圈`}`;
          })
          .join('\n')}`;
        this.footer.string = recordFeedback(finishTime, this.previousBest);
        if (r.mode === 'sprint') {
          this.title.string = place === 1 ? '一圈冠军，爽快冲线！' : `一圈冲刺 · 第 ${place} 名`;
          this.detail.string = `一圈 ${time(finishTime)} · 漂移加速 ${r.driftBoosts} 次\n${r.suppliesCollected} 个有益补给 · ${r.collisions} 次碰撞`;
          this.footer.string = recordFeedback(finishTime, this.previousBest) + '\n' + sprintNextGoal(r);
        } else if (!r.networked) {
          const bits = this.passport[this.selection.route] || 0, earned = earnedStamps(r);
          this.leaderboard.string = `路线印章 ${stampCount(bits)} / 3 · 全路线 ${passportCount(this.passport)} / ${routes.length * 3}\n` +
            STAMPS.map((stamp) => `${bits & stamp.bit ? '★' : '☆'} ${stamp.name}${earned & stamp.bit ? ' · 本场达成' : ''}`).join('\n') +
            `\n本机最快 ${this.records[0] ? time(this.records[0].time) : '—'}`;
        }
      }
    }
    const theme = themes.find((t) => t.id === this.selection.theme)!;
    const selectedRoute = routes.find((r) => r.id === this.selection.route)!;
    this.tagline.string =
      r.phase === 'finished'
        ? !p.finishedAt
          ? '未完赛 · 调整路线，再次挑战'
          : place === 1
          ? '金牌 · 路线冠军'
          : place <= 3
            ? '银牌 · 登上领奖台'
            : `铜牌 · 完成${r.laps === 1 ? '一' : '三'}圈`
        : this.previousBest
          ? `本路线目标：突破 ${time(this.previousBest)} · 本机纪录`
          : '本路线目标：完成 3 圈，赢取首枚完赛奖牌';
    if (r.phase === 'ready') {
      this.tagline.string = this.challenge
        ? `同道具挑战 · ${r.laps === 1 ? '一圈' : '三圈'}目标 ${time(this.challenge.time)}`
        : r.mode === 'sprint' ? '一圈冲刺 · 快速试驾 · 独立本机成绩'
          : `三圈竞速 · 路线印章 ${stampCount(this.passport[this.selection.route] || 0)} / 3 · 全路线 ${passportCount(this.passport)} / ${routes.length * 3}`;
      this.title.string = '浪湾卡丁车 · 出发准备';
      this.detail.string = r.loadError
        ? `素材加载失败：${r.loadError}\n切换配置可重试`
        : r.loaded
          ? `${Math.round(r.track.length)} 米 · ${r.laps === 1 ? '一圈冲刺' : '3 圈竞速'} · ${this.coach.enabled ? '开跑后逐步教你漂移' : '3 位对手 · 随机道具'}`
          : '正在装配主题、路线图与赛车…';
      this.button.string = r.loadError ? '请重试素材加载' : r.loaded ? `${r.laps === 1 ? '一圈冲刺' : '3 圈竞速'}开跑 →` : '装配中…';
      this.choices[0].string = `主题  ${theme.name}  ${themes.indexOf(theme) + 1}/${themes.length}`;
      this.choices[1].string = `路线图  ${selectedRoute.name}  ${routes.indexOf(selectedRoute) + 1}/${routes.length}`;
      this.choices[2].string = `赛车  ${vehicles.find((v) => v[0] === this.selection.vehicle)?.[1]}  ${vehicles.findIndex((v) => v[0] === this.selection.vehicle) + 1}/10`;
      this.choices[3].string = `车手  ${drivers.find((v) => v[0] === this.selection.driver)?.[1]}  ${drivers.findIndex((v) => v[0] === this.selection.driver) + 1}/10`;
      this.footer.string = !keyboardHints
        ? '默认配置即可开跑 · 左手转向 · 右手漂移 · 开跑后自动加速'
        : 'Enter 开跑 · T 切赛制 · W/↑ 前进 · A D 转向 · 空格漂移';
      this.footer.string += r.mode === 'sprint'
        ? '\n一圈快速冲线 · 三位对手 · 成绩不计三圈榜与路线印章'
        : '\n收集印章：冠军 · 4 次漂移加速 · 6 个有益补给';
    }
    if (r.phase === 'finished' && this.challenge && !r.networked) {
      const delta = finishTime - this.challenge.time;
      this.tagline.string = delta <= 0 ? `同道具挑战达成！${delta < 0 ? `快了 ${(-delta).toFixed(2)} 秒` : '追平目标'}`
        : `同道具挑战差 ${delta.toFixed(2)} 秒 · 再跑一次布局不变`;
    }
    if (this.challengeNotice && ['ready', 'paused', 'finished'].includes(r.phase)) this.footer.string = this.challengeNotice;
    this.count.string =
      r.phase === 'countdown'
        ? String(Math.ceil(r.countdown))
        : r.phase === 'racing' && r.time < 0.8
          ? '出发！'
          : '';
    this.message.string =
      r.phase === 'racing'
        ? r.drivers[0].shortcutFailure > 0
          ? '近道失误，回到入口'
          : k.recovery > 0
            ? '回到赛道，继续冲！'
            : k.collision > 0
              ? '稳住方向，重新提速'
              : k.boost > 0
                ? k.nitroCooldown > C.nitroCooldown - C.nitroDuration
                  ? '氮气冲刺！'
                  : '松手加速！'
                : k.tier === 2
                  ? '双阶蓄力 · 松手冲刺'
                  : k.tier === 1
                    ? '已蓄力 · 松手加速'
                    : k.drifting
                      ? '保持过弯，火花正在蓄力'
                      : p.s > r.track.shortcutStart - 65 && p.s < r.track.shortcutStart
                        ? '前方近道：保持直行 · 窄路注意减速'
                        : p.laps === r.laps - 1
                          ? '最后一圈，冲刺！'
                          : '寻找出弯加速的时机'
        : '';
    if (r.phase === 'racing' && k.itemMessageTime > 0)
      this.message.string = `${k.itemMessage}${k.coins ? ` · 金币 ${k.coins}` : ''}`;
    this.meter.clear();
    this.meter.fillColor = color('#193c55');
    this.meter.roundRect(-78, -171, 156, 9, 4);
    this.meter.fill();
    if (k.charge > 0) {
      this.meter.fillColor = color(k.tier === 2 ? '#ffd15a' : '#65e7dc');
      this.meter.roundRect(-78, -171, (156 * k.charge) / C.chargeThresholds[1], 9, 4);
      this.meter.fill();
    }
    this.controls.clear();
    this.controls.fillColor = color(k.nitroCooldown > 0 ? '#71999c' : '#68e2c0');
    this.controls.roundRect(290, -45, 150, 70, 22);
    this.controls.fill();
    for (const [x, radius, hex] of [
      [-326, 69, '#173c55b8'],
      [194, 42, input.brake ? '#ed7666' : '#173c55b8'],
      [365, 65, input.drift ? '#68e2c0' : '#ffd15ae8'],
    ] as const) {
      this.controls.fillColor = color(hex);
      this.controls.circle(x, -171, radius);
      this.controls.fill();
    }
    this.controls.fillColor = color('#ffffff77');
    this.controls.circle(-326 + input.steer * 49, -171, 15);
    this.controls.fill();
    const scale = 0.28,
      cx = 379,
      cy = 91;
    const route = this.mapRoute;
    if (this.mappedTrack !== r.track) {
      this.mappedTrack = r.track;
      route.clear();
      route.lineWidth = 5;
      route.strokeColor = color('#173c5577');
      r.track.main.forEach((p, i) => {
        i
          ? route.lineTo(cx + p.x * scale, cy + p.z * scale)
          : route.moveTo(cx + p.x * scale, cy + p.z * scale);
      });
      route.stroke();
      route.lineWidth = 2;
      route.strokeColor = color('#fff6dc');
      r.track.shortcut.forEach((p, i) => {
        i
          ? route.lineTo(cx + p.x * scale, cy + p.z * scale)
          : route.moveTo(cx + p.x * scale, cy + p.z * scale);
      });
      route.stroke();
    }
    const g = this.map;
    g.clear();
    for (let i = r.drivers.length - 1; i >= 0; i--) {
      const k = r.drivers[i].kart;
      g.fillColor = color(i ? '#193c55' : '#ffd15a');
      g.circle(cx + k.x * scale, cy + k.z * scale, i ? 3 : 5);
      g.fill();
    }
  }
}
