# 乌龙城

这座城市，总差一点才正常。24 个原创单屏喜剧解谜关卡，原四章主线加四关新尾声、纸片 Canvas 场景、本机存档、三级提示、奇遇记录与结尾日报。

源码由 `prototypes/games4` 复制到 `small-games/games/local/wulong-city`，原目录保留。保留原玩法，并修复了通关时仍按住方向、松手误触结算按钮的问题；没有迁入依赖或生成的截图、JSON 证据。Workspace 包名为 `@coffeeeeffoc/wulong-city`，`coffeeeeffoc.role` 为 `game`，已接入 Shell 游戏目录。

## 安装与运行

在 **small-games 根目录**执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/wulong-city dev
```

打开 `http://127.0.0.1:4174/`，环境变量 `PORT` 可覆盖端口。Shell 中选择“乌龙城”，或访问 Shell 的 `#/games/wulong-city` 路由。

- 电脑：A/D 或方向键移动，空格跳跃；鼠标点、拖物件；Esc 暂停。
- 手机：底部左右与跳跃按钮，场景点拖，移动与跳跃最多双指。
- 同一方向上的多指、键盘与触摸输入独立释放；松开其中一次操作不会打断其它仍按住的操作。场景拖动只接受开始拖动的手指，失去其指针捕获会取消预览并恢复角色，避免角色卡在拖动状态。
- 键盘解谜：Tab 找物件，Enter 操作；拖动点 Enter 抓取、方向键调整、Enter 松开，Esc 取消并暂停。
- 顶栏提供选关、奇遇记录、音效、全屏和暂停；下方提供重试与三级提示。
- 普通模式从 L01 顺序解锁。存档键 `wulong-city-v1` 保持不变；换域名或端口不会自动迁移浏览器存储。
- 已完成旧 L20 的存档保留当前关、奇遇记录和音效设置，并解锁 L21；仅到达 L20 的存档仍需先完成它。新增四关依次解锁。
- 结算提供“分享这段奇遇”。公开 `?challenge=1` 至 `?challenge=24` 以分享体验运行，可试玩未解锁关卡，完成与重玩均不改主线存档。无效或重复参数明确退回主线；从选关进入已解锁关卡后恢复正常进度。
- 开发入口 `?dev=1&level=18` 可选关，并提供只读快照，没有自动通关 API。

## 构建与测试

在仓库根目录执行：

```sh
pnpm --filter @coffeeeeffoc/wulong-city test
pnpm --filter @coffeeeeffoc/wulong-city build
pnpm --filter @coffeeeeffoc/wulong-city preview
```

`test` 使用 Node 内置测试，无需预先启动服务器、安装浏览器或加载第三方依赖，可直接供 CI 使用。12 项检查覆盖全部 24 关内容与初始化独立性，以及原有谜题和新增四关的错误尝试、实际机关组合及完成条件；实际分享函数检查还覆盖 URL 用户信息、私有参数及子路径清理。

`build` 将 `index.html`、`style.css`、`levels-data.js`、`game.js`、`levels.js` 复制到静态 `dist/`，保留经典脚本顺序与相对资源地址，可部署到任意子目录。`preview` 服务构建结果。游戏本身零运行依赖；也可在游戏目录直接执行 `node --test tests/game.test.mjs`、`node build.mjs`、`node server.mjs --dist`。

### 真实浏览器回归

保持 `preview` 运行，另一终端执行：

```sh
pnpm --filter @coffeeeeffoc/wulong-city test:browser
pnpm --filter @coffeeeeffoc/wulong-city test:lifecycle
pnpm --filter @coffeeeeffoc/wulong-city test:progression
```

需要 Playwright Chromium；可在根目录执行 `pnpm exec playwright install chromium` 准备浏览器，或设置 `PLAYWRIGHT_EXECUTABLE_PATH` 指向本机兼容浏览器。测试包按正常 Node 包规则解析，不依赖固定机器路径。

| 环境变量 | 用途 |
| --- | --- |
| `BASE_URL` | 完整游戏入口，默认 `http://127.0.0.1:4174/`；支持生产子路径，例如 `http://127.0.0.1:4173/games/wulong-city/index.html` |
| `INPUT=touch` | 通关测试改用 CDP 触摸和底部按钮，不借用键盘移动 |
| `WIDTH=360` | 通关测试视口宽度，默认 390 |
| `FLOW=1` | 检查下一关、菜单回访和连续重试 |

在游戏目录执行 `node tests/playtest.mjs 2 11 18` 可仅测指定关卡。生命周期测试可单独运行，会自行创建证据目录。截图路径使用 `fileURLToPath`，兼容 Windows、Linux 和空格路径；截图和报告保存在被忽略的 `tests/evidence/`。

生命周期回归覆盖同一方向双指、键盘与触摸混用、两个同向按键的独立释放，以及地图拖动的无关指针取消和指针捕获丢失。

`test:progression` 检查旧 20 关存档兼容、未解锁分享体验通关与重玩不写主线、分享 URL 清理、对象形式的取消错误、无剪贴板时的手动链接和非法参数回退。浏览器分享优先使用系统分享，取消不会再复制；缺少系统分享时复制公开挑战链接，再缺少剪贴板则显示可选中的链接。

新增内容：L21 让风扇背对床单送风；L22 洗掉衣服名字中的“脏”字；L23 用长话与句号固定聊天桥；L24 将奖杯从展示柜递向画面外的玩家。可用 `INPUT=touch WIDTH=360 FLOW=1 node tests/playtest.mjs 20 21 22 23 24` 验证旧结尾到新尾声的衔接、逐关真实解题、下一关、回访和重试。

2026-10-01 第二轮云验证：12 项规则/分享函数检查、静态构建、24 关提示/暂停/重试生命周期与存档/分享隔离检查通过；L20–L24 的 360px CDP 触摸实玩与连续关卡检查通过，L21–L24 另由交叉审查独立复跑。没有把这些模拟器结果计为实体手机、Safari 或真人首次解谜验收。

### Shell 验证

在仓库根目录执行 `pnpm test:pages`，验证已构建的 Pages 产物；更新游戏后可先运行 `pnpm build:pages`。

乌龙城的桌面 iframe 与触屏分支在普通生产模式操作，不依赖开发快照：等待首关热点 `[data-zone="shy-door"]`，点击得到反馈；右移让门后退，左移背对让门打开，再右移完成首关；点击 `#next` 后确认 `#counter` 为 `02 / 24`，并检查两级提示。全新上下文的 `#title` 应为“出口很害羞”；已有存档可能恢复到其它关。

发布回归使用 360×900 窄屏，覆盖按住方向跨越结算弹窗后松手，确认不会误触“再玩这关”；弹窗只接受在本次弹窗内开始的指针操作，键盘激活保留。

这些自动化结果不替代实体手机、Safari 或真人首次解谜验收。

## 设计记录

- [产品方向](docs/PRODUCT.md)
- [逐关规格](docs/LEVELS.md)
- [迁移前完成状态](docs/PROGRESS.md)
- [迁移前试玩记录与边界](docs/PLAYTEST.md)

原文档中的 games4 和证据路径表示迁移前历史，当前命令以本 README 为准。原创程序图形与 Web Audio 合成音效；未接入账号、后台、广告或设备权限。

当前交付支持 Web / H5 浏览器。24 关规则可在没有 DOM 的环境独立验证，但正式入口仍使用 DOM 热点、对话框、浏览器存储及 Web Audio；微信、B 站、抖音、快手原生小游戏需要独立的 Canvas UI、输入和 Game Host 入口后再逐渠道验收。
