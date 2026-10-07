# 移动端浏览器回归

环境：Headless desktop Chromium with mobile viewport + touch emulation; not a physical phone。

构建：Final production build: Shell immersive + safe bridge camera。

输入：DOM taps, keyboard and CDP Input.dispatchTouchEvent; read-only snapshot/projection。仅通过只读 snapshot / worldToScreen 观察运行状态。

源码与夹具：Custom chapter configurations and Engine.createGame/command/step/serializeGame; normal storage restore。真实第一章通关直接使用章节原配置，移动、战斗、拾取与绘桥均通过浏览器原生触屏输入完成。

结果：passed，16/16 项通过，0 个运行错误。

## 独立生产构建与 sandbox iframe

入口：http://127.0.0.1:4413/games/ink-is-everything/

- 通过：Landscape homepage → stage picker → help → gameplay → pause/equipment → home
- 通过：landscape: move, aim opposite direction, ranged + melee, gesture cancel and blur
- 通过：portrait-rotation: move, aim opposite direction, ranged + melee, gesture cancel and blur
- 通过：small-screen: move, aim opposite direction, ranged + melee, gesture cancel and blur
- 通过：landscape: both bridge anchors visible, native stroke cancellation then successful drawing
- 通过：portrait: both bridge anchors visible, native stroke cancellation then successful drawing
- 通过：small: both bridge anchors visible, native stroke cancellation then successful drawing
- 通过：Rewards continue simulation, ground gear requires deliberate pickup, later choice and save restore
- 通过：Low ink enemy damage → result → retry → result → home remains responsive without findLast
- 通过：Final encounter victory result provides replay and home navigation
- 通过：Resize and fullscreen/orientation rejection preserve run and landscape fallback
- 通过：Fullscreen entry and exit preserve normal portrait landscape fallback
- 通过：Storage unavailable still permits touch gameplay and pause/resume
- 通过：Sandbox iframe landscape/portrait entry and touch remain playable
- 通过：Actual first chapter completed through native touch, deliberate rewards, bridge and two-phase boss

## Shell 生产构建

入口：http://127.0.0.1:4413/#/games/ink-is-everything

- 通过：Real production Shell iframe entry, fullscreen boundary, landscape fallback and touch pause

## 实际运行截图

- [actual-home-landscape.png](./actual-home-landscape.png)
- [actual-chapters-landscape.png](./actual-chapters-landscape.png)
- [actual-help-landscape.png](./actual-help-landscape.png)
- [actual-gameplay-landscape.png](./actual-gameplay-landscape.png)
- [actual-pause-landscape.png](./actual-pause-landscape.png)
- [actual-equipment-landscape.png](./actual-equipment-landscape.png)
- [actual-bridge-landscape.png](./actual-bridge-landscape.png)
- [actual-bridge-portrait.png](./actual-bridge-portrait.png)
- [actual-bridge-small.png](./actual-bridge-small.png)
- [actual-reward-waits-on-ground.png](./actual-reward-waits-on-ground.png)
- [actual-reward-pending-notice.png](./actual-reward-pending-notice.png)
- [actual-reward-player-opens-choice.png](./actual-reward-player-opens-choice.png)
- [actual-ink-exhausted-result-portrait.png](./actual-ink-exhausted-result-portrait.png)
- [actual-victory-result-small.png](./actual-victory-result-small.png)
- [actual-iframe-portrait-pause.png](./actual-iframe-portrait-pause.png)
- [actual-shell-portrait-fullscreen-pause.png](./actual-shell-portrait-fullscreen-pause.png)
- [actual-shell-portrait-playing.png](./actual-shell-portrait-playing.png)
- [actual-chapter-bridge.png](./actual-chapter-bridge.png)
- [actual-chapter-growth.png](./actual-chapter-growth.png)
- [actual-chapter-boss.png](./actual-chapter-boss.png)
- [actual-chapter-victory.png](./actual-chapter-victory.png)

尚未验证：真实 iOS/Android 手机、Safari 真机、原生小游戏宿主。
