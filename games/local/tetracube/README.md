# 重力方舱

移动端优先的 3D Tetracube 堆叠消除原型。调整四连立方体的位置与三轴姿态，观察幽灵落点，填满平面获得消除；颠倒整个容器后，所有小方块统一向下落到底面或其他方块上，继续检测消除。

## 运行与验证

```sh
pnpm --filter @coffeeeeffoc/tetracube dev
# http://localhost:4178/
pnpm --filter @coffeeeeffoc/tetracube test
pnpm --filter @coffeeeeffoc/tetracube build
pnpm --filter @coffeeeeffoc/tetracube preview
pnpm --filter @coffeeeeffoc/tetracube test:browser
```

无需运行时依赖，也可直接在本目录使用 `node server.mjs`、`node build.mjs` 和 `node --test tests/*.test.mjs`。服务支持 `--port`、`--host` 以及 `PORT`、`HOST` 环境变量。浏览器检查使用仓库的 Playwright；可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chromium。

独立静态入口为 `/games/tetracube/index.html`；Shell 通过同源 iframe 装载。构建仅复制明确列出的入口、样式、公共 H5 控件与 `src/`，所有资源路径相对当前目录，支持子路径部署。

## 操作与范围

- 在场景中拖动移动方块；XY、XZ、YZ 按钮分别旋转 90°；“落下”立即放置。
- 切换「观察」后拖动改变镜头角度，移动和观察是两种明确独立的模式。
- 幽灵轮廓显示真实碰撞计算得出的落点；完整平面消除后继续压实，连续消除累积 Combo。
- 点击「颠倒容器」转动 180°，或在观察工具中向左右侧翻 90°；世界重力始终向下。当前方块参与翻转并落定，随后从顶部生成下一块。
- 主页、暂停与返回流程保持对局状态；帮助集中说明规则与快捷键。

本版验证核心堆叠、三轴操作、容器翻转和连锁反馈；未接入广告、在线排行榜、付费皮肤或原生小游戏 SDK。

首版仅提供经典无尽，不显示未实现的选关入口。6×6×12 容器可不限次数翻转，用于验证重构玩法；出生区堵塞时另外提供一次最后干预。随机袋包含 8 种四连立方体。每格落定得 5 分，快速下落每格距离 2 分，每次消层得 `250 × Combo` 分；连续成功消层延续 Combo，无消层的落定或重构会重置当前连锁。

## 验收记录

52 项规则测试覆盖物理翻转、固定向下落定、碰撞、消层、三轴旋转、随机袋、连锁与存档。浏览器用例验证触控、手势取消、颠倒救场、保存继续、四种视口和存储禁用降级。见 [实际截图与测试记录](docs/qa/README.md)。测试环境是桌面 Chromium 的手机触控模拟，尚未进行真机或原生平台 SDK 验收。

## 文件边界

- `src/config.mjs`：棋盘、方块与玩法配置。
- `src/engine.mjs`：不依赖 DOM 的碰撞、姿态、堆叠、压实、消除和状态规则。
- `src/render.mjs`：三维投影、容器与方块表现。
- `src/app.mjs`：页面流程、触屏输入、镜头、计时与本地记录。
- `tests/`：规则测试与浏览器验收；`docs/design/`：手机效果图及设计说明。

Web 开发模式遵循仓库统一约定：URL `?dev=1` 或 `localStorage.dev` 开启，`?dev=0` 显式关闭。`dev-mode.js`、`dev-mode.d.ts` 和 `fullscreen.js` 是 `platforms/h5/` 的同步副本，不在游戏内单独修改。
