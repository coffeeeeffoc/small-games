# 追贼别撞墙

蓝衣玩家追着橙衣小偷穿过老城街巷。跳路障、钻低杆、换道绕木箱；连续稳住三段，冲刺把小偷拉近三米。

## 运行

在仓库根目录使用配置的 Node 24.21.0、pnpm 12.6.0：

```sh
pnpm --filter @coffeeeeffoc/chase-thief dev
```

打开 `http://127.0.0.1:4417/`。本游戏运行时无外部依赖，可直接在游戏目录执行 `node server.mjs`。局域网运行使用 `node server.mjs --host 0.0.0.0 --port 4417`；生产预览使用 `node build.mjs` 后执行 `node server.mjs --dist`。

Shell 入口是 `#/games/chase-thief`，独立静态入口是 `/games/chase-thief/index.html`。游戏、暂停和结算采用沉浸显示，主页保留 Shell 返回入口。

## 操作与规则

- 左右滑动换道，上滑跳跃，下滑滑铲；屏幕按钮可完成所有操作。电脑支持方向键 / WASD，空格跳跃，Esc 暂停。
- 晨光里、骑楼巷、灯火街三个街区各限时 60 秒，正常通关依次解锁，重试免费。
- 小偷起始领先 12 米；每波无碰撞通过追近 0.15 米，连续三波触发两秒冲刺，额外追近三米。双方距离同步反映在角色投影与顶部 HUD。
- 碰撞减速 1.2 秒，距离增加 2.5 米、连续次数清空。第三次碰撞立即失败，计时耗尽也失败；进入 1.5 米范围自动抓捕。
- 每波保留可走的安全道，前三波先教跳跃、滑铲、換道；后续组合增加，冲刺最高速度下仍有至少 2.5 秒的波次间隔。小偷使用固定路线，接近抓捕时不会加速。
- 保存已解锁街区、最快正常抓捕记录、声音和震动设置；存储不可用时继续使用内存进度。切换尺寸、方向及全屏不会重置对局，切到后台自动暂停。

## 文件边界

`engine.mjs` 只管理模拟、动作、连击与胜败；`levels.mjs` 独立管理内容、配色和 schema 校验；`progress.mjs` 校验版本化存档及纯结算。它们不依赖 DOM、SDK 或 Shell。

`scene.mjs` 使用原创 Canvas 插画和缓存绘制角色、街巷及三类障碍；`audio.mjs` 合成原创短音效；`main.mjs` 负责触屏、页面、存储和生命周期。运行资源仅使用相对路径，静态构建不会带入文档、测试或服务器。

公共 `dev-mode.js` / `fullscreen.js` 复用仓库 H5 能力并保留独立运行副本。`?dev=1` 或统一 `localStorage.dev` 启用开发面板，`?dev=0` 优先关闭；默认不暴露 `__chaseDev`。开发跳关、手动时钟与参数修改会将对局标记为试玩，不解锁或记录成绩。

## 验证

```sh
pnpm --filter @coffeeeeffoc/chase-thief test
pnpm --filter @coffeeeeffoc/chase-thief build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/chase-thief test:browser
```

规则测试覆盖可通过关卡、三连冲刺、动作窗口、两次失误后恢复、三撞失败、超时、暂停、不同帧长、固定小偷路线、解锁、试玩隔离及坏存档；服务测试覆盖资源白名单、请求方法和路径检查。浏览器脚本使用生产制品、手机尺寸及真实触屏事件走通页面和操作。

效果图、页面关系和实际截图见 [设计说明](docs/design/README.md)。2026-10-06 验收：23 项规则/存档/服务测试通过；Chromium 151 生产制品的 12 组浏览器流程通过，覆盖三个手机尺寸、三关正常通关及坏存储降级；Web Shell 生产构建、iframe 与手机 Pages 操作回归通过。详细记录保存在 [浏览器报告](docs/design/report.json)。

首版提供本地最好成绩和免费重试。广告续关、付费外观及远端成绩榜待渠道 SDK 接入后再扩展；本版没有模拟广告或支付。已验证的手机尺寸浏览器模拟不代表物理手机、原生小游戏渠道或 iOS Safari 验收。
