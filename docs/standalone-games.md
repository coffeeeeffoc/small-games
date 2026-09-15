# Game 目录与统一运行

所有游戏源码集中在 `games/`，按 Git 归属区分：

- `games/local/*`：父仓库直接管理源码，普通 clone 即可取得；`local` 不代表忽略提交。
- `games/submodules/*`：独立 Git 仓库，父仓库固定其 commit。两类目录均属于 pnpm workspace。
- `apps/*`：Web、Android、iOS、B 站 Shell、Creator Studio 和 Workspace Agent。

目录归属与装载方式分开。原四个 Game Host 游戏保留包名、Game ID、公开导出和存档命名空间；独立 H5 游戏通过同源 iframe 运行，静态制品随 Web Shell 打包。

## 父仓库直接管理的 Game

| 源码目录（相对 games/local） | Game                  | workspace 包名                 | 装载方式  |
| ---------------------------- | --------------------- | ------------------------------ | --------- |
| game-arena                   | 电子斗蛐蛐            | @coffeeeeffoc/game-arena       | Game Host |
| game-cricket                 | 秋声斗蟋              | @coffeeeeffoc/game-cricket     | Game Host |
| game-cultivation             | 三分钟修仙            | @coffeeeeffoc/game-cultivation | Game Host |
| game-office                  | 打工人摸鱼记          | @coffeeeeffoc/game-office      | Game Host |
| cops-robbers                 | 围捕小队              | cops-robbers                   | iframe    |
| cops-robbers-realtime        | 别跑！街区围捕        | cops-robbers-realtime          | iframe    |
| h5-security                  | 来电之间              | between-calls                  | iframe    |
| letters-words                | 词了个词 · 单词消消乐 | letters-words                  | iframe    |
| letters-words2               | 词屿 · 字母叠叠乐     | ciyu-word-tiles                | iframe    |
| multi-battle                 | 万象旅团              | multi-battle                   | iframe    |
| puzzle                       | 雨停之前              | before-the-rain-stops          | iframe    |
| travel                       | 去野 · 大理漫游记     | quye-travel                    | iframe    |
| travel2                      | 外滩·一江入梦         | @coffeeeeffoc/travel2          | iframe    |
| merge-front                  | 神机合阵              | @small-games/merge-front       | iframe    |
| night-merge                  | 合成守夜人            | @small-games/night-merge       | iframe    |
| travel-bund                  | 江风入境 · 外滩漫游   | @coffeeeeffoc/travel-bund      | iframe    |
| travel-bund-2.5D             | 外滩 · 空中漫游       | @coffeeeeffoc/travel-bund-25d  | iframe    |
| vibeJam-myself-delivery      | 橘风速递              | tangerine-express              | iframe    |
| vibeJam-myself-history-guess | 此时 · 此地           | here-and-then                  | iframe    |
| vibeJam-myself-nullrange     | 零域 · NULL RANGE     | null-range-mobile-cn           | iframe    |

原 `apps/game-*` 通过 `git mv` 迁移，使用 `git log --follow -- games/local/game-cultivation/src/domain/trial.ts` 可以追溯迁移前的提交。

新增十一款从同级目录导入源码、素材、测试及文档，排除 `node_modules`、构建输出、缓存和生成的测试截图。原同级目录保留作核对；后续统一在本仓库的新目录开发，避免维护两份未同步源码。

`app-game-research`、`prompts`、`vibeJam` 未导入；`xiangqi-five-promo` 为宣传素材，不作为游戏注册。

## 独立 Git 子模块

| 源码目录                            | Game                | workspace 包名                   | 静态输出    |
| ----------------------------------- | ------------------- | -------------------------------- | ----------- |
| games/submodules/fishing            | 潮汐猎手            | tidebreak                        | dist/       |
| games/submodules/tower-defense-game | 月森守卫            | @coffeeeeffoc/tower-defense-game | dist-pages/ |
| games/submodules/xiangqi-five       | 象五子棋            | @coffeeeeffoc/xiangqi-five       | dist/       |
| games/submodules/office-slacking    | 工位偷闲 · 第一人称 | @coffeeeeffoc/office-slacking    | dist/       |

四个子模块也通过 `git mv` 迁移，保留子仓库历史及原 commit。`.gitmodules` 的 `path` 指向新目录；section 名称保留为已有子模块的内部标识。

首次取得完整仓库：

```sh
git clone --recurse-submodules https://github.com/coffeeeeffoc/small-games.git
cd small-games
pnpm install --frozen-lockfile
```

已有检出运行 `pnpm games:init`。拉取父仓库后运行 `git submodule update --init --recursive`，取得父仓库记录的版本；普通 `git pull` 不保证更新子模块工作目录。

## 构建、开发与测试

```sh
# 指定一个游戏开发；不同游戏原有端口可能相同，按需单独启动
pnpm --filter multi-battle dev
pnpm --filter @coffeeeeffoc/game-cultivation dev

# 全部游戏，复用 Turbo 的依赖构建和缓存
pnpm games:build
pnpm games:test

# 从源码目录发现漏接入的新游戏（不依赖清单枚举）
pnpm check:games
pnpm test:game-config

# 大厅开发与正式静态制品
pnpm --filter @coffeeeeffoc/shell-web dev
pnpm build:pages
pnpm test:pages

# 包边界、代码检查和移动端 Web 素材打包
pnpm check:dependencies
pnpm test:boundaries
pnpm format:check
python scripts/test-mobile-assets.py
python scripts/mobile-assets.py
```

`letters-words`、`letters-words2` 和 `travel` 的 `build.mjs` 只复制明确列出的运行文件到 `dist/`，不引入打包依赖，也不发布测试、服务器代码或开发配置。其余游戏沿用各自构建脚本。`puzzle` 的 `test` 复用原有规则检查。

静态 H5 的注册信息在 `apps/shell-web/src/standalone-games.json`：`id` 为稳定访问标识，`source` 为相对仓库根的源码目录，`output` 为该游戏构建输出目录。准备脚本按清单构建，再复制到 `apps/shell-web/public/games/<id>/`。

Web Shell 最终部署目录是 `apps/shell-web/dist/`。源码迁移不改变现有 `/games/<id>/index.html` 地址。新增游戏采用同样地址，例如 `/games/multi-battle/index.html`。大厅开发服务启动时生成静态副本；修改独立 H5 后需重新执行准备流程，或直接使用该游戏的 dev 服务调试。

父仓库的格式化保留四个 Game Host 包的检查，导入的独立 H5 沿用各自格式。lint 排除 Git 子模块，普通游戏中存在 lint 命令的包仍参与检查。测试和依赖边界检查覆盖两类游戏目录。

## 游戏接入检查

`scripts/check-game-config.mjs` 从 `games/local/*` 和 `games/submodules/*` 的实际目录发现游戏，核对注册清单或 Game Host 注册、workspace、锁文件、大厅依赖、构建与测试脚本、浏览器操作用例，以及 CI、Pages、Android/iOS 和 B 站 SDK 的构建链路。新建目录但漏配任一必要入口时返回非零退出码；不会自动修改配置。

```sh
# 快速检查全部目录；适合提交前与 CI
pnpm check:games

# 检查四款游戏；仍报告其他目录的接入遗漏
pnpm check:games merge-front night-merge travel-bund travel-bund-2.5D

# 检查现有制品的资源路径和源 dist / 大厅副本逐文件一致性
pnpm check:games --artifacts

# 实际执行选中游戏测试构建、B 站 SDK 强制构建与 smoke、
# 全量 Pages 构建与浏览器操作回归、移动端 Web ZIP 打包
pnpm check:games merge-front night-merge travel-bund travel-bund-2.5D --verify

# 机器可读结果（不与 --verify 同用）
pnpm check:games --json
```

参数接受目录名、目录路径、访问 id 或包名。`travel-bund-2.5D` 的访问 id 为 `travel-bund-25d`。不传游戏参数时，`--verify` 构建与测试全部游戏。运行浏览器检查前安装 Chromium：`pnpm exec playwright install chromium`。Pages 回归使用完整 Chromium 的 headless 模式；可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定浏览器，或用 `PLAYWRIGHT_BROWSERS_PATH` 指定 Playwright 缓存目录。

CI 执行配置检查及脚本回归测试；Pages 构建前检查配置，构建后检查制品；Android 和 iOS 工作流安装依赖后先检查配置。`--verify` 的移动端检查覆盖 Web 资源包；APK 编译、iOS 模拟器启动及设备归档由 mobile 工作流验证，也可分别运行 `pnpm android:apk`、`pnpm ios:simulator`（需对应 SDK）。四款独立 H5 随 Web/原生 WebView 大厅打包，B 站 Canvas SDK 继续验证其现有 Game Host 游戏。

## 提交与锁文件

普通游戏直接随父仓库提交。子模块修改先在子仓库提交、推送，再在父仓库更新指针：

```sh
git -C games/submodules/xiangqi-five switch main
# 修改、测试并在子仓库提交后：
git -C games/submodules/xiangqi-five push origin main
git add games/submodules/xiangqi-five
git commit -m "Update xiangqi-five"
```

修改前检查父仓库与子仓库状态；子模块初始化后可能处于 detached HEAD，需要先切换分支。父仓库不会自动跟随远端最新提交。

根 `pnpm-lock.yaml` 用于整体安装与 CI。子模块自己的锁文件用于独立开发和 CI，fishing 使用 npm 锁文件，其余三个使用 pnpm。导入的普通 H5 保留原有独立锁文件；修改依赖时也要同步相应独立锁文件，避免独立运行与父仓库安装不一致。

## 平台边界

iframe H5 保留自身存档和生命周期，不自动接入 Game Host 云存档、广告或 Runtime 发布版本。原四款 Game Host 游戏的 Studio 源码浏览、编辑和 Source Extension 路径已同步迁移；导入 H5 的开发入口为其各自的 workspace 包命令。

Pages 构建关闭 Runtime 连接，保留本地存档；普通开发模式继续支持 Runtime。原独立站点与大厅可能属于不同 origin，浏览器存档不会自动跨站迁移。

Android 的 Web 素材流程复用大厅制品。B 站原生 Canvas Shell 继续加载原四款 Game Host 游戏，DOM/WebGL H5 接入需单独适配。象五子棋的好友房间仍需要 Node 服务，静态制品只提供同屏模式。

新增文件和目录不会自动创建独立 GitHub 仓库，也不会自动发布独立站点。父仓库现有 Pages 工作流递归检出子模块、执行游戏测试、构建大厅和浏览器验证，推送 main 后才部署。

## 2026-09-14 迁移验收

第一阶段提交 `5fc3562`：现有八款全部通过 `git mv` 迁移；四个子模块提交号保持不变。迁移前 31 个测试/依赖构建任务通过，迁移后 42 个游戏、Studio、Shell、Workspace Agent 测试和类型检查任务通过。

第二阶段完成后的检查：

| 检查                                                                                            | 结果                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec turbo run test build --filter=./games/*/* --concurrency=1 --output-logs=errors-only` | 19 款游戏及依赖，共 46 个任务通过                                                                                        |
| 平台应用、原四款 Game Host 游戏与 Repository Bridge 的 test/typecheck/lint                      | 59 个任务通过，包含 B 站 Shell                                                                                           |
| `pnpm build:pages`                                                                              | 32 个任务通过，静态大厅包含 19 个入口                                                                                    |
| `pnpm test:pages`                                                                               | 四款内置游戏操作，以及十五款 iframe 游戏的嵌入、独立打开、返回目录和手机触控通过；无捕获到的页面错误或本地资源 HTTP 错误 |
| `pnpm --filter @coffeeeeffoc/shell-web test`                                                    | 17 项测试通过，独立游戏测试遍历完整清单                                                                                  |
| `pnpm format:check` / `pnpm check:dependencies`                                                 | 通过                                                                                                                     |
| `pnpm test:boundaries`                                                                          | 5 项测试通过                                                                                                             |
| `pnpm install --offline --frozen-lockfile`                                                      | 44 个 workspace 项目安装成功                                                                                             |
| 移动端 Web 打包                                                                                 | 确定性与版本测试通过；实际 ZIP 包含大厅和十五款独立游戏入口                                                              |

原四款游戏额外执行了修仙、斗蟋与办公室的现有完整浏览器回归，覆盖通关/失败、重开、存档、暂停/恢复及相应触控操作；Arena 在正式大厅中验证挑虫、调养、开战、闪避和暂停。

手机回归使用 390×844 竖屏；捕鱼、橘风速递和零域按其玩法使用 844×390 横屏。浏览器报告和截图生成到 `.scratch/game-integration/`，修仙、斗蟋的详细输出位于各自 `.scratch/` 子目录，办公室输出位于游戏的 `test-results/`。

这里验证的是本机浏览器模拟手机与 Web 资源包；没有执行真机 APK/iOS 安装、远端 GitHub Actions 或线上发布。全部运行入口保留原玩法，测试适配了横屏提示、不可选字母牌和旅游风景画卷的实际行为。
