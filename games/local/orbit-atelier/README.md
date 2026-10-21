# 星扣工坊 · Orbit Atelier

这轮将游戏重做为 **Cocos Creator 3.8.8 的星仪修复谜题**：拖动互相穿扣的金属环，让缺口同时越过两处接点，松手抽离。新主线以释放指定星核为目标，可以留下无关支路；选择更短的解法会获得更高星级。

**当前状态：已通过真实 Creator 3.8.8 Web Mobile 构建、24 关触屏通关和分享专项。** 2026-10-22 在 Windows 设备 bolanggu 完成构建与桌面 Chromium 触屏模拟，生产画面见 [主页](docs/design/cocos-rebuild-2026-10-21/actual/mobile-home.png)、[游玩](docs/design/cocos-rebuild-2026-10-21/actual/mobile-playing.png) 和 [验证记录](docs/design/cocos-rebuild-2026-10-21/05-verification.md)。物理手机与原生小游戏平台尚未验收。

## 设计与内容

按玩法 → 效果图 → 关卡 → 实现推进：

1. [玩法方案](docs/design/cocos-rebuild-2026-10-21/01-gameplay.md)：核心循环、操作、成长与验收要求。
2. [视觉效果图](docs/design/cocos-rebuild-2026-10-21/02-concept.png)：手机比例的主页、核心玩法、星图选关。
3. [24 关设计](docs/design/cocos-rebuild-2026-10-21/03-levels.md)：四章依次引入路线取舍、指定钥环、宽口、大小环及组合机关。
4. [视觉与交互实现](docs/design/cocos-rebuild-2026-10-21/04-implementation.md)：原生渲染、素材来源及与概念图的核对项。

四章分别修复晨光罗盘、月相仪、折光镜和天穹星仪。每章六关，配置独立、无随机拼关。无提示完成得二星，释放数达到该关最短路线得三星。提示提供下一只可解环和方向，撤回保留已使用的提示次数。

原有 74 关保留为“经典星盘”，仍需释放全部圆环。`orbit-atelier.v2` 存档只读迁移 `orbit-atelier.v1`，两套主线各自解锁，保留旧星级与设置。挑战邀请、开发试玩不写玩家进度。

## 工程与运行

在 Cocos Creator **3.8.8** 中打开本目录，启动场景为 `assets/scenes/main.scene`。运行层为原生 `Component`、`Graphics`、`Sprite`、`Label`、`Input` 和 `AudioSource`；DOM 仅用于无障碍按钮、分享降级和公共平台适配，不承担棋盘渲染。

```sh
# 在仓库根目录执行；使用仓库指定的 Node / pnpm
# Windows 构建机可设置 COCOS_CREATOR 为真实 Creator 可执行文件
pnpm --filter @coffeeeeffoc/orbit-atelier typecheck
pnpm --filter @coffeeeeffoc/orbit-atelier test
pnpm --filter @coffeeeeffoc/orbit-atelier build
pnpm --filter @coffeeeeffoc/orbit-atelier dev
pnpm --filter @coffeeeeffoc/orbit-atelier test:browser
pnpm --filter @coffeeeeffoc/orbit-atelier test:publishing:browser
```

`dev` 仅服务 Creator 已生成的 `dist`，端口 4340；不自动回退运行旧版 Vite 页面。`ORBIT_ATELIER_PREBUILT_DIR` 可指定真实构建制品目录，目录须含 `dist/` 和 Creator 导出的 `cc.d.ts`；引擎版本、源摘要和所有运行文件摘要必须匹配。浏览器脚本默认自行启动临时端口，也可用 `ORBIT_URL` 指向已运行的同版本服务。

`assets/scripts/core` 为无引擎依赖的规则、关卡与存档层；`AtelierView.ts` 负责场景与视觉，`OrbitAtelier.ts` 负责输入、流程和生命周期。`src/`、`tests/legacy-*` 及旧设计目录作为历史实现和迁移参考保留，不是当前运行入口或本轮验收证据。

Web 采用竖屏优先，并提供横屏布局、暂停恢复、撤回、提示、全屏和声音/触感/减少动态设置。公共开发工具通过 `?dev=1` 显式开启，`?dev=0` 显式关闭。分享链接只携带关卡挑战参数，广告默认关闭。本轮仅配置 Web Mobile / Web Desktop 构建，未完成微信、抖音、B 站或 Android/iOS 真机验收。
