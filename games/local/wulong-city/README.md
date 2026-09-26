# 乌龙城

这座城市，总差一点才正常。20 个原创单屏喜剧解谜关卡，四章主线、纸片 Canvas 场景、本机存档、三级提示、维修记录与结尾日报。

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
- 键盘解谜：Tab 找物件，Enter 操作；拖动点 Enter 抓取、方向键调整、Enter 松开，Esc 取消并暂停。
- 顶栏提供选关、维修记录、音效、全屏和暂停；下方提供重试与三级提示。
- 普通模式从 L01 顺序解锁。存档键 `wulong-city-v1` 保持不变；换域名或端口不会自动迁移浏览器存储。
- 开发入口 `?dev=1&level=18` 可选关，并提供只读快照，没有自动通关 API。

## 构建与测试

在仓库根目录执行：

```sh
pnpm --filter @coffeeeeffoc/wulong-city test
pnpm --filter @coffeeeeffoc/wulong-city build
pnpm --filter @coffeeeeffoc/wulong-city preview
```

`test` 使用 Node 内置测试，无需预先启动服务器、安装浏览器或加载第三方依赖，可直接供 CI 使用。覆盖全部 20 关内容与初始化独立性，以及害羞门、电梯、店界、回声落幕、拖动取消、折城到家的因果规则。

`build` 将 `index.html`、`style.css`、`levels-data.js`、`game.js`、`levels.js` 复制到静态 `dist/`，保留经典脚本顺序与相对资源地址，可部署到任意子目录。`preview` 服务构建结果。游戏本身零运行依赖；也可在游戏目录直接执行 `node --test tests/game.test.mjs`、`node build.mjs`、`node server.mjs --dist`。

### 真实浏览器回归

保持 `preview` 运行，另一终端执行：

```sh
pnpm --filter @coffeeeeffoc/wulong-city test:browser
pnpm --filter @coffeeeeffoc/wulong-city test:lifecycle
```

需要 Playwright Chromium；可在根目录执行 `pnpm exec playwright install chromium` 准备浏览器，或设置 `PLAYWRIGHT_EXECUTABLE_PATH` 指向本机兼容浏览器。测试包按正常 Node 包规则解析，不依赖固定机器路径。

| 环境变量 | 用途 |
| --- | --- |
| `BASE_URL` | 完整游戏入口，默认 `http://127.0.0.1:4174/`；支持生产子路径，例如 `http://127.0.0.1:4173/games/wulong-city/index.html` |
| `INPUT=touch` | 通关测试改用 CDP 触摸和底部按钮，不借用键盘移动 |
| `WIDTH=360` | 通关测试视口宽度，默认 390 |
| `FLOW=1` | 检查下一关、菜单回访和连续重试 |

在游戏目录执行 `node tests/playtest.mjs 2 11 18` 可仅测指定关卡。生命周期测试可单独运行，会自行创建证据目录。截图路径使用 `fileURLToPath`，兼容 Windows、Linux 和空格路径；截图和报告保存在被忽略的 `tests/evidence/`。

### Shell 验证

在仓库根目录执行 `pnpm test:pages`，验证已构建的 Pages 产物；更新游戏后可先运行 `pnpm build:pages`。

乌龙城的桌面 iframe 与触屏分支在普通生产模式操作，不依赖开发快照：等待首关热点 `[data-zone="shy-door"]`，点击得到反馈；右移让门后退，左移背对让门打开，再右移完成首关；点击 `#next` 后确认 `#counter` 为 `02 / 20`，并检查两级提示。全新上下文的 `#title` 应为“出口很害羞”；已有存档可能恢复到其它关。

发布回归使用 360×900 窄屏，覆盖按住方向跨越结算弹窗后松手，确认不会误触“再玩这关”；弹窗只接受在本次弹窗内开始的指针操作，键盘激活保留。

这些自动化结果不替代实体手机、Safari 或真人首次解谜验收。

## 设计记录

- [产品方向](docs/PRODUCT.md)
- [逐关规格](docs/LEVELS.md)
- [迁移前完成状态](docs/PROGRESS.md)
- [迁移前试玩记录与边界](docs/PLAYTEST.md)

原文档中的 games4 和证据路径表示迁移前历史，当前命令以本 README 为准。原创程序图形与 Web Audio 合成音效；未接入账号、后台、广告或设备权限。
