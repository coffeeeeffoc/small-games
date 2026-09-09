# 摸鱼游戏社：小游戏创作与运行平台

一套可直接在浏览器预览的 React + TypeScript 小游戏原型，包含：

- **三分钟修仙**：3 章 18 个事件、三次章末劫难、属性成长、境界、结局与广告福缘转世。
- **打工人摸鱼记**：连续 5 个工作日，逐日增加老板巡查率，包含每日目标、防窥屏升级与被抓救援。
- **电子斗蛐蛐**：5 级联赛、胜后持续变异、逐级增强的对手、自动战斗与图鉴记录。

v0.2 已加入章节幕布、事件切换、属性跳字、摸鱼角色动作、老板巡视、屏幕震动、怪物待机、攻击冲刺、伤害数字、粒子和通关演出。所有主要动画都遵循系统的“减少动态效果”设置。

## 本地启动

```bash
pnpm games:init
pnpm install
pnpm --filter @coffeeeeffoc/shell-web dev
```

浏览器访问终端显示的地址（默认 `http://localhost:5173`）。生产检查：

在线大厅：[摸鱼游戏社](https://coffeeeeffoc.github.io/small-games/)。每次推送 `main` 自动测试、构建并部署大厅和三款独立 Game；本地使用 `pnpm build:pages` 构建同一静态版本，`pnpm test:pages` 验证仓库子路径访问（需安装 Playwright Chromium）。

```bash
pnpm test
pnpm build
```

Android 安装包：配置 JDK 17 和 Android SDK 34 后运行 `pnpm android:apk`，将 Web 大厅和六个游戏嵌入 APK，支持离线游玩。工程、Android Studio 操作和设备验证见 [Android Shell](apps/shell-android/README.md)。

## 广告模式

大厅右上角齿轮可切换三种模式：

- `预览`（默认）：不调用任何 SDK，模拟约 0.9 秒播放后发放奖励。
- `B站 SDK`：通过 `window.bl.createRewardedVideoAd` 调用真实激励视频。
- `关闭`：不展示模拟过程，直接发放奖励，方便功能调试。

SDK 模式需要在 `.env.local` 配置广告位：

```env
VITE_BILI_AD_UNIT_ID=你的广告位ID
```

真实奖励只在 `onClose` 返回完整观看时发放。SDK 缺失、广告加载失败或中途关闭均不会发奖，也不会阻断正常游戏。正式接入前需在 B 站开发者后台确认广告权限、当日频控和当前审核要求。

## 存档与数据

金币、最佳修为、摸鱼最高分、擂台胜场及物种图鉴保存在浏览器 `localStorage`。开发者设置中可清空存档。当前 MVP 不含服务端排行榜或防作弊；正式上线前应将关键奖励结算迁至可信后端。

## 上线前检查清单

- 替换广告位 ID，并在 B 站客户端真机验证完整观看、中途关闭和无广告库存。
- 接入 B 站登录、启动埋点、侧边栏复访和桌面快捷方式等平台必接能力。
- 根据后台政策添加隐私协议、用户协议、版号/备案及主体信息。
- 为结算、广告请求、广告完成、次日回访添加统计事件。
- 扩充修仙事件池与斗蛐蛐词条池，做至少 20 位玩家的可用性测试。
- 在低端 Android 与 iOS 真机检查字体、音频策略、触摸操作和性能。

## 项目结构

```text
apps/
  shell-web/         Web 游戏大厅
  shell-android/     内嵌 Web 大厅的 Android 应用与 APK 构建
  shell-bilibili/    B 站原生 Shell
  game-*/           平台 Game
games/              独立 pnpm Game（Git submodule）
  tower-defense-game/
  xiangqi-five/
  office-slacking/
packages/
  config-eslint/     共享 ESLint 规则
  config-typescript/ 共享 TypeScript 配置
```

根命令由 Turborepo 分发到各 workspace。首次运行前执行 `pnpm games:init` 初始化三个独立 Game，或使用 `git clone --recurse-submodules` 克隆。Web 大厅已集成月森守卫、象五子棋和第一人称工位偷闲；它们也各自使用 pnpm 独立构建并自动部署 GitHub Pages。详见[独立 Game 开发、版本更新与发布](docs/standalone-games.md)。
