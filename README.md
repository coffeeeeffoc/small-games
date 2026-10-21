# 摸鱼游戏社：小游戏创作与运行平台

完整游戏目录见 [游戏一览](docs/games.md)，包含各游戏的中文名、文件夹名、源码目录链接和简介。

公司官网子应用见 [能工智人官网](apps/company-web/README.md)，介绍上海能工智人科技有限公司的软件开发、小游戏与 AI 应用业务。运行 `pnpm --filter @coffeeeeffoc/company-web dev` 本地预览。

小游戏创作与运行平台，包含独立游戏、Web 大厅、原生小游戏构建和创作后管。当前游戏清单见 [游戏目录](docs/games.md)。

## 本地启动

工具链固定为 Node.js 24.21.0（LTS）和 pnpm 12.6.0。Volta 用户运行 `volta install node@24.21.0 pnpm@12.6.0`；CI 与 Docker 使用相同版本。pnpm 配置位于 `pnpm-workspace.yaml`，首次克隆先初始化子模块，再运行 `pnpm install --frozen-lockfile`。

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/shell-web dev
```

浏览器访问终端显示的地址（默认 `http://localhost:5173`）。生产检查：

推送 `main`、`dev`、`test` 会分别触发 CI 和 Pages 测试、构建、部署；每次只更新对应环境，保留其他环境已经构建验证的内容。首次启用步骤见 [Pages 三环境部署](docs/deployment/github-pages.md)。

| 分支   | 环境 | 部署后访问路径                                             |
| ------ | ---- | ---------------------------------------------------------- |
| `main` | 正式 | [摸鱼游戏社](https://coffeeeeffoc.github.io/small-games/)  |
| `dev`  | 开发 | [开发版](https://coffeeeeffoc.github.io/small-games/dev/)  |
| `test` | 测试 | [测试版](https://coffeeeeffoc.github.io/small-games/test/) |

本地使用 `pnpm build:pages` 构建同一静态版本，`pnpm test:pages` 验证仓库子路径访问（需安装 Playwright Chromium）；设置 `PAGES_BASE_PATH=/small-games/dev/` 或 `/small-games/test/` 可验证对应嵌套路径。

按游戏和渠道生成交付包，统一使用随 Git 管理的 `game-build.local.mjs` + `pnpm build:games`；手动修改配置后先用 `--dry-run` 预检，再本地试打，验证通过后提交配置，不合适则回退。H5、TapTap 原生、微信等现有平台的配置、产物类型及其他构建命令区别见[统一游戏包构建](docs/operations/game-builds.md)。

```bash
pnpm test
pnpm build
```

## 提交与推送检查

`pnpm install --frozen-lockfile` 的 `prepare` 会在当前仓库设置 `core.hooksPath=.githooks`。已有依赖时可运行 `pnpm prepare` 重新启用，使用 `git config --show-origin --get core.hooksPath` 核实应指向 `.githooks`。

- 提交前：`pre-commit` 运行 `pnpm format:staged`，用锁定的 Prettier 检查暂存区内新增、修改和重命名文件的内容，不改写文件或暂存区；未暂存的格式修复不能掩盖即将提交的错误。
- 推送时：普通 `git push` 的 `pre-push` 仅提示手动校验命令，不自动安装依赖、构建或运行长时检查。提交前的格式检查继续保留。
- 格式修复：运行 `pnpm exec prettier --write <文件路径>` 后重新 `git add <文件路径>`。`pnpm test:hooks` 验证真实 hooks 的成功与拦截行为，CI 也执行这些回归测试。

需要完整增量校验时，对已提交的准确候选显式运行以下命令，详见 [增量发布验证](docs/operations/incremental-publication.md)：

```bash
git fetch origin dev
pnpm validate:candidate --base origin/dev --head HEAD
git push origin dev
```

校验器按准确 base/head 创建隔离快照并执行检查，失败不产生通过记录。`pnpm validate:push` 仍保留原始 pre-push stdin 协议供工具调用。已有 `pnpm push:no-verify` 兼容命令继续可用，通常直接 `git push` 即可。远端 CI/Pages 独立运行，推送成功不表示检查或部署成功。

提交检查沿用当前工作树的 Prettier 配置和忽略规则，配置修改也应一并暂存。本地 hooks 依赖已安装的依赖、启用的 hooksPath 和正常执行 Git hooks；隔离快照检查不能代替远端 CI。远端 CI 继续独立执行全仓格式检查及后续质量检查。

Android 安装包：配置 JDK 17 和 Android SDK 34 后运行 `pnpm android:apk`，将 Web 大厅和六个游戏嵌入 APK，支持离线游玩。工程、Android Studio 操作和设备验证见 [Android Shell](apps/shell-android/README.md)。

## 存档与平台能力

各游戏通过宿主或平台适配层使用存档、音频、广告与账号能力。具体玩法和接入范围以游戏目录内的说明为准。

## 项目结构

```text
apps/
  company-web/       能工智人公司官网（独立静态站点）
  shell-web/         Web 游戏大厅
  shell-android/     内嵌 Web 大厅的 Android 应用与 APK 构建
  shell-minigame/    单款原生小游戏构建
games/local/        本仓库维护的游戏
games/submodules/   独立仓库 Game
  tower-defense-game/
  xiangqi-five/
packages/
  config-eslint/     共享 ESLint 规则
  config-typescript/ 共享 TypeScript 配置
```

根命令由 Turborepo 分发到各 workspace。首次运行前执行 `pnpm games:init` 初始化独立 Game，或使用 `git clone --recurse-submodules` 克隆。Web 大厅已集成月森守卫、象五子棋和潮汐猎手；它们也各自使用 npm/pnpm 独立构建并自动部署 GitHub Pages。详见[独立 Game 开发、版本更新与发布](docs/standalone-games.md)。
