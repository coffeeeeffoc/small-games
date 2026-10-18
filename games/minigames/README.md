# 三款 Cocos 小游戏

使用 Cocos Creator **3.8.8**，优先生成 TapTap 小游戏工程与官方 ZIP。三个独立工程为 `cops-robbers`、`cops-robbers-realtime`、`xiangqi-five`。

本目录不属于 pnpm workspace，也不进入 H5 游戏目录。现有 `games/local` / `games/submodules`、Shell 登记、GitHub Pages 构建和存档均沿用原入口。这里导入原有规则、关卡、AI 和联机协议；生成的脚本只写入各 Cocos 工程的 `assets/scripts`，不会覆盖旧游戏。

围捕小队的 Cocos 首页与棋盘直接复用原 H5 的追逃插画、花园背景、角色图集及布局映射，构建记录包含素材指纹；网页 DOM/CSS 仍由各入口分别实现。视觉恢复与实际引擎截图见[原版美术恢复记录](docs/design/cops-original-art-2026-10-16.md)。三款本轮的菜单、触屏、暂停、练习恢复及存档对齐见[对齐记录](docs/design/h5-parity-2026-10-19.md)；象棋细节另见[山亭界面记录](../../platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/README.md)。Canvas 浏览器证据与真实 Creator／真机验收分别记录。

## 工具与 TapTap 打包

日常打包统一使用仓库根的 `pnpm build:games`，由 `game-build.local.mjs` 版本 2 的 `targets` 选择平台、H5/原生类型及每款 AppID；运行 `pnpm build:games --dry-run` 可先检查计划。使用方法、最终上传文件及其他构建命令的区别见[统一游戏包构建](../../docs/operations/game-builds.md)。下列命令保留为底层工具和 CI 入口，不读取该本地配置。

在仓库根目录使用 Node 24.21.0、pnpm 12.6.0、Python 3.11+（保留官方 ZIP 中的 UTF-8 文件名）：

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
# Windows：安装固定版本 Creator 和校验过的 TapTap 官方转换插件
node games/minigames/scripts/setup.mjs --taptap
# 三个独立预览包；也可用 --game cops-robbers 指定一款
node games/minigames/scripts/build.mjs --game all --platform taptap
```

macOS 先安装 Creator 3.8.8，并设置 `COCOS_CREATOR` 到真实可执行文件；自动下载 Creator 目前只支持 Windows。Linux 可以准备工程、运行规则与适配测试，真实引擎构建由 `.github/workflows/cocos-minigames.yml` 的 Windows runner 完成。

TapTap 流程是 **Creator 微信原生目标 → 独立转换副本 → 配置 MiniApp ID 和 code2Session 登录 → 官方 v1.2.2 转换及打包 → 校验实际 ZIP**。不会手写宿主 adapter 或自行重打官方 ZIP。插件 ZIP 有固定 SHA-256；依赖按官方 lockfile 安装且禁用生命周期脚本。

每款产物：

- `games/minigames/<game>/build/taptap/game/`：导入 TapTap 官方开发者工具。
- `games/minigames/<game>/build/taptap/game.zip`：官方插件生成的 ZIP。
- `games/minigames/<game>/build/taptap.receipt.json`：源码、配置、引擎版本、官方插件、文件清单和 Git SHA 的构建记录。
- `games/minigames/<game>/reports/`：引擎日志与构建配置。

默认生成无服务端预览包。正式包增加 `--release` 并提供真实 AppID；`--without-service` 可生成无服务端正式包，`--with-service` 要求有效的服务地址。统一配置为 `COMPETITION_SERVICE_ENABLED=0/1` 和 `COMPETITION_PUBLIC_API_URL`，详见[服务配置说明](../../docs/operations/competition-service.md)。环境变量见 `.env.example`，需由终端显式设置，不自动加载该文件。各游戏可用 `MINIGAME_<游戏名大写且横线转下划线>_<平台大写>_APP_ID/API_URL/AD_UNIT_ID` 覆盖公共渠道变量。所有字段均为公开配置，客户端不放 AppSecret。

```sh
node games/minigames/scripts/build.mjs --game xiangqi-five --platform taptap --release
node games/minigames/scripts/build.mjs --verify games/minigames/xiangqi-five/build/taptap/game --receipt games/minigames/xiangqi-five/build/taptap.receipt.json
```

三款原生应用分别为围捕小队 `984485`（MiniApp ID `tapmcyeuvshseosntg`）、街区追捕 `984546`（`tapmcfcyjcnccm3pvq`）、象五子棋 `984547`（`tapmcgymnoqi9kdbls`）。旧 H5 应用分别为 `982507`、`980554`、`982449`，不能混用应用、排行榜或广告位配置。公开映射以根目录 `game-build.local.mjs` 为准。Tap 小站及 SDK 好友房独立于共享后端开关；配置和存档边界见[Tap 服务说明](../../platforms/taptap/docs/game-services.md)。原生广告位尚未配置，当前原生目标关闭广告；旧 H5 的[广告验收记录](../../platforms/competition/xiangqi-five/docs/design/ads-2026-10-18.md)不能作为原生广告可用证明。

## 其他渠道

所有命令都支持 `--game all` 或这三款之一。也提供 `pnpm --dir games/minigames build:<平台>` 脚本。

| 平台参数      | 构建方式                                  | 输出与限制                                                         |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `taptap`      | Creator + TapTap 官方转换                 | `build/taptap/game` 和官方 `game.zip`；优先 CI 构建                |
| `wechat`      | Creator `wechatgame`                      | `build/wechat`；官方微信工具导入                                   |
| `douyin`      | Creator `bytedance-mini-game`             | `build/douyin`；抖音开发者工具导入                                 |
| `bilibili`    | Creator + 官方 biligame-builder           | 先 `setup.mjs --bilibili`；输出 `build/biligame`                   |
| `alipay`      | Creator `alipay-mini-game`                | `build/alipay`；在支付宝工具中选择真实应用；暂不接未验证的登录 API |
| `kuaishou`    | Creator 微信源工程 + 官方快手工具自动适配 | 先 `--prepare-source`，按下方导入实际转换结果                      |
| `baidu`       | 不支持                                    | Creator 3.8 于 2022-11-30 移除此目标；脚本明确失败，不输出假包     |
| `web-preview` | Creator `web-mobile`                      | 独立的引擎验证页，不替换 GitHub Pages 的原 H5                      |

```sh
node games/minigames/scripts/build.mjs --game all --platform wechat
node games/minigames/scripts/build.mjs --game all --platform douyin
node games/minigames/scripts/build.mjs --game all --platform alipay
node games/minigames/scripts/setup.mjs --bilibili
node games/minigames/scripts/build.mjs --game all --platform bilibili
node games/minigames/scripts/build.mjs --game cops-robbers --platform kuaishou --prepare-source
```

快手将 `build/kuaishou-source` 导入官方开发者工具执行自动适配，再将真实转换目录传入下面的检查器。`--project-file` 和 `--appid-field` 必须填写该工具实际生成的文件名与字段，不猜测项目 schema。

```sh
node games/minigames/scripts/import-kuaishou.mjs --game cops-robbers --directory /absolute/converted-package --project-file project.config.json --appid-field appid
```

检查器要求真正的 `kwaiadapter.js` 入口、原 Creator 资源完整、方向与 AppID 匹配；不把文件完整性检查当作工具来源或真机认证。官方工具改变转换格式时会阻断，需复核新版格式。百度若成为硬性需求，应单独评估受支持的引擎版本/官方适配插件，不能从现有 3.8.8 工程直接承诺导出。

通用原生主包检查沿用仓库既有 Creator 流程的 4 MiB（4,194,304 字节）口径。实时警匪的微信源工程接近此预算，新增图片或音频时应优先考虑压缩、资源分包，并重新检查实际目标产物。当前自动化优先验证 TapTap；其他渠道仍需各自官方工具和真机验收。

## 开发与验证

```sh
# 只准备编辑器工程和真实控制器 bundle，不声称已完成引擎构建
node games/minigames/scripts/build.mjs --game all --platform web-preview --prepare-only
node --test games/minigames/tests/*.test.mjs
# 真正的 Creator 浏览器构建及鼠标/触摸流程
node games/minigames/scripts/build.mjs --game cops-robbers --platform web-preview
node games/minigames/scripts/browser.mjs --directory games/minigames/cops-robbers/build/web-preview --receipt games/minigames/cops-robbers/build/web-preview.receipt.json
```

准备后可在 Creator 中打开对应工程，场景为 `assets/scenes/main.scene`。直接在编辑器手动切换渠道前，先用脚本准备该渠道，避免运行配置仍指向前一平台。发布构建应走上述脚本，确保静态音效、背景图与官方转换步骤完整。

CI 保存真正的 Creator 产物、日志、浏览器截图与验证报告；源码或产物变化后，旧构建记录不能通过验证。工程设置只将 Git 跟踪的文件计入源码身份，并读取其当前内容；Creator 自动生成的本机配置不参与源码校验。新增需共享的设置应显式纳入 Git 和发布范围分类，渠道构建参数统一由脚本生成。预览诊断接口只在预览包开启，正式包默认关闭。浏览器预览使用独立存档前缀，不会覆盖同域原 H5 的存档。

验证分为三层：Node 的规则/适配/打包契约测试、真实 Creator 浏览器的画面与鼠标/触屏测试、各平台官方工具与真机测试。前两层通过不能代替第三层；构建记录始终不自动标记 `realDeviceVerified`。

设计与取舍见 [迁移设计](docs/design/migration.md)。
