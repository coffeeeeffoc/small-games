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
- 暂存不合适的方块，取下一块或与暂存槽交换；每块可用一次，落地或转动容器后恢复。
- 切换「观察」后拖动改变镜头角度，移动和观察是两种明确独立的模式。
- 幽灵轮廓显示真实碰撞计算得出的落点；完整平面消除后继续压实，连续消除累积 Combo。
- 常驻「转动容器」按钮直接向左右侧翻 90°或颠倒 180°；世界重力始终向下。当前方块参与翻转并落定，随后从顶部生成下一块。
- 移动、三轴旋转和自然下落均有连续过渡；快速下落带速度残影，落地与连锁消除带冲击环、碎光及短暂震屏。减少动态效果偏好下停止摆动、残影、粒子和震屏，保留简短状态过渡。
- 主页、暂停与返回流程保持对局状态；帮助集中说明规则与快捷键。

本版验证核心堆叠、三轴操作、容器翻转和连锁反馈；未接入广告、在线排行榜、付费皮肤或原生小游戏 SDK。

本版提供经典无尽。6×6×18 容器比上一版增加 50% 容量，底面仍为 36 格，增加操作余量同时保持消层面积。容器可不限次数翻转；出生区堵塞时另外提供一次最后干预。随机袋包含 8 种四连立方体。每格落定得 5 分，快速下落每格距离 2 分，每次消层得 `250 × Combo` 分；连续成功消层延续 Combo，无消层的落定或重构会重置当前连锁。v3 存档保留暂存槽和本块交换状态，兼容旧版存档并按实际舱体朝向无损扩容。

## 验收记录

64 项规则测试覆盖物理翻转、固定向下落定、碰撞、消层、三轴旋转、随机袋、暂存、连锁与三代存档。浏览器用例覆盖触屏直达侧翻、暂存、动作过渡、下落反馈、手势取消、暂停恢复、救场、不同视口、iframe 和存储禁用降级。见 [实际截图与测试记录](docs/qa/README.md) 及 [本次手机效果图与交互方案](docs/design/arcade-2026-10-07/README.md)。测试环境是桌面 Chromium 的手机触控模拟，尚未进行真机或原生平台 SDK 验收。

## 文件边界

- `src/config.mjs`：棋盘、方块与玩法配置。
- `src/engine.mjs`：不依赖 DOM 的碰撞、姿态、堆叠、压实、消除和状态规则。
- `src/render.mjs`：三维投影、容器与方块表现。
- `src/app.mjs`：页面流程、触屏输入、镜头、计时与本地记录。
- `tests/`：规则测试与浏览器验收；`docs/design/`：手机效果图及设计说明。

Web 开发模式遵循仓库统一约定：URL `?dev=1` 或 `localStorage.dev` 开启，`?dev=0` 显式关闭。`dev-mode.js`、`dev-mode.d.ts` 和 `fullscreen.js` 是 `platforms/h5/` 的同步副本，不在游戏内单独修改。
