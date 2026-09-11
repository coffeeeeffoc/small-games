# 独立 Game 与统一管理

## 潮汐猎手（fishing）

第四款独立游戏位于 `games/fishing` 子模块，工作区包名 `tidebreak`，静态产物 `dist/`。使用 `pnpm --filter tidebreak dev` 开发（端口 43210）。独立仓库使用 `npm ci` 和 `package-lock.json`，父工作区使用根 `pnpm-lock.yaml`。

推送 fishing 的 `main` 发布[独立站点](https://coffeeeeffoc.github.io/fishing/)。随后在父仓库更新、提交 `games/fishing` 指针并推送 `main`，发布[大厅入口](https://coffeeeeffoc.github.io/small-games/games/fishing/index.html)。Android 的 `bundleWeb` 和 `syncWeb` 自动将同一产物打入 APK，支持离线进入游戏。父仓库不会自动跟随未提交的子模块远端更新。

| Game                | pnpm 包                            | 静态产物      | 独立站点                                                    |
| ------------------- | ---------------------------------- | ------------- | ----------------------------------------------------------- |
| 月森守卫            | `@coffeeeeffoc/tower-defense-game` | `dist-pages/` | [Pages](https://coffeeeeffoc.github.io/tower-defense-game/) |
| 象五子棋            | `@coffeeeeffoc/xiangqi-five`       | `dist/`       | [Pages](https://coffeeeeffoc.github.io/xiangqi-five/)       |
| 工位偷闲 · 第一人称 | `@coffeeeeffoc/office-slacking`    | `dist/`       | [Pages](https://coffeeeeffoc.github.io/office-slacking/)    |

## 首次检出与启动

```sh
git clone --recurse-submodules https://github.com/coffeeeeffoc/small-games.git
cd small-games
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/shell-web dev
```

已有检出先运行 `pnpm games:init`。每次拉取父仓库后运行 `git submodule update --init --recursive`，检出父仓库记录的精确版本。普通 `git pull` 不保证更新 submodule 工作目录。

Web Shell 的 dev/build 自动构建并复制四个 Game（Turbo 缓存避免重复编译）。修改 Game 后，独立 dev 有即时反馈；大厅集成预览需要重启 Shell dev，刷新静态副本。根目录 `pnpm games:build` 串行构建四个 Game，`pnpm games:test` 串行运行它们的测试。`pnpm build --concurrency=1` 构建全部 workspace；Web Shell 最终部署目录为 `apps/shell-web/dist/`，已经包含四款 Game。

日常只启动需要的 Game，避免同时启动全平台与全部开发服务：

```sh
pnpm --filter @coffeeeeffoc/tower-defense-game dev
pnpm --filter @coffeeeeffoc/xiangqi-five dev
pnpm --filter @coffeeeeffoc/office-slacking dev
```

三个命令分别独立使用，默认端口为 5174、4173、5173。完整独立部署也可直接克隆任意子仓库，运行 `pnpm install --frozen-lockfile && pnpm test && pnpm build`，无需获取 small-games。

## 修改与提交

submodule 初始化通常处于 detached HEAD。修改前在对应仓库切到 main 或创建分支：

```sh
git -C games/xiangqi-five switch main
git -C games/xiangqi-five pull --ff-only
# 修改并完成验证
git -C games/xiangqi-five add <修改的文件>
git -C games/xiangqi-five commit -m "Describe the Game change"
git -C games/xiangqi-five push origin main
git add games/xiangqi-five
git commit -m "Update xiangqi-five"
git push origin main
```

父仓库提交只记录 commit，不包含子仓库文件。切换版本前检查 `git status` 和 `git submodule foreach git status --short`，保留未提交修改。原来同级的三个目录仍可作为独立检出使用，通过同一 GitHub 远端同步；不要在两个目录重复开发同一未提交变更。

原三款子仓库的 `pnpm-lock.yaml`（fishing 使用 `package-lock.json`） 用于独立 CI，根 `pnpm-lock.yaml` 用于统一管理。修改依赖时在独立克隆中运行 `pnpm install --lockfile-only` 更新子仓库锁文件，再更新 submodule 指针并在父仓库运行 `pnpm install` 更新根锁文件。不要在 workspace 内误以为 `pnpm install` 会更新子仓库锁文件。

## 自动发布与边界

父仓库的格式化和 ESLint 命令只检查平台代码，独立 Game 沿用自身工具；测试、构建和依赖边界检查包含 `games/*`。塔防的现有 `pnpm lint` 仍有历史 UI/React Compiler 报错，本次迁移不将它作为 Pages 发布门槛，原 lint 命令保留用于后续治理。

Turbo 2.5 不允许同时使用 `--affected` 和排除过滤器，因此 `lint:affected` 委托完整平台 lint，仍复用 Turbo 缓存；其他 affected 命令保持按变更选择。

四个子仓库的 `.github/workflows/pages.yml` 在每次 push、PR 和手动触发时安装锁定依赖、测试并构建；只有 main 部署对应 GitHub Pages。仓库 Settings → Pages → Source 使用 GitHub Actions。

small-games 的 `.github/workflows/pages.yml` 递归检出父仓库记录的 Game 版本，执行游戏测试、`pnpm build:pages`、Shell 测试和真实浏览器子路径检查。推送 main 或在 main 手动触发后，发布 `apps/shell-web/dist/` 到[统一大厅](https://coffeeeeffoc.github.io/small-games/)；PR 只验证、不部署。父仓库推送更新统一站点，不会触发四个独立站点发布；更新游戏时仍需先推送子仓库，再提交父仓库的 submodule 指针。

Pages 构建使用相对资源路径，并关闭 Runtime 连接、发布版本选择和云存档账号入口，保留本地游戏与存档。普通 `pnpm build` / dev 继续支持 Runtime。可直接访问以下静态入口：

- [月森守卫](https://coffeeeeffoc.github.io/small-games/games/tower-defense-game/index.html)
- [象五子棋](https://coffeeeeffoc.github.io/small-games/games/xiangqi-five/index.html)
- [工位偷闲 · 第一人称](https://coffeeeeffoc.github.io/small-games/games/office-slacking/index.html)

本地回归：`pnpm exec playwright install chromium` 后运行 `pnpm test:pages`。该检查把产物挂在 `/small-games/` 下，验证四款 Game 的嵌入、独立入口、返回目录和资源响应，防止只在根路径可用。

Web 大厅支持返回目录、重新进入和独立打开。四款 Game 的入口与资源随 Shell 一起部署，不从公网加载游戏代码；它们暂不使用平台 Game Host 的云存档、广告或 Runtime 发布版本。象五子棋好友房间需要额外 Node 服务，Pages 只运行静态同屏模式。当前集成面向 Web Shell，B 站原生 Canvas Shell 仍需单独技术适配。
