# 转塔留一脚刹车

一个移动端优先的竖屏圆塔短挑战。球自动弹跳和下落，左右滑动转动整座塔，把缺口对准球，抵达第 12 层终点。八套布局按通关进度解锁。

- 普通平台会让球弹起；橙红斜纹危险区触碰即失败。
- 开局储存一次刹车。点击刹车后，球暂停 0.8 秒，塔仍可转动。
- 不落地连续穿过三层，补回一次刹车，最多储存一次。落地或使用刹车会重置连续穿层计数。
- 落点预告同时提供俯视位置与区域文字，帮助识别被上层遮住的危险区。

触屏即可完成所有操作。桌面支持鼠标拖动、左右方向键转塔、空格刹车和 Esc 暂停；设置页提供音效与三套免费外观。

## 本地运行

游戏没有第三方运行依赖。在此目录执行：

```sh
node server.mjs
# 默认 http://localhost:4452；也可指定端口和监听地址
PORT=4453 HOST=127.0.0.1 node server.mjs
node server.mjs --port 4453 --host 127.0.0.1

node --test tests/*.test.mjs
node build.mjs
node server.mjs --dist
```

仓库根目录也可运行 `pnpm --filter @coffeeeeffoc/tower-brake dev`、`test` 或 `build`。`build.mjs` 只复制明确列出的运行文件到 `dist/`；测试、设计稿和服务器脚本不会发布到静态制品。

浏览器回归使用仓库提供的 `@playwright/test`：

```sh
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/browser.mjs
```

实际浏览器位置不同的环境可省略或调整 `PLAYWRIGHT_EXECUTABLE_PATH`。浏览器脚本和记录区分桌面浏览器触屏模拟与真机验收；本次未进行真实手机或原生小游戏平台验收。

## 代码与存档

| 文件                            | 职责                                          |
| ------------------------------- | --------------------------------------------- |
| `engine.mjs`                    | 不依赖 DOM 的下落、碰撞、连穿、刹车与胜负模拟 |
| `levels.mjs`                    | 八套十二层配置及游戏自身的内容校验            |
| `progress.mjs`                  | 解锁、成绩、偏好设置与存档恢复                |
| `render.mjs`                    | Canvas 圆环、球、轨迹、危险纹理与落点预告     |
| `main.mjs`                      | 页面切换、手势、音效、生命周期与规则层连接    |
| `dev-mode.js` / `fullscreen.js` | 公共 H5 开发模式与全屏能力副本                |

进度保存在当前浏览器。存储不可用时使用会话内进度并提示，不阻断游玩。纯净挑战与使用续关的成绩分别记录，开发模式中的试玩也与正常成绩隔离。

H5 版本未接真实广告 SDK，失败后提供明确标注的“免费续关”，每局最多一次，从最近平台继续。该入口不模拟广告观看或发放付费奖励。所有皮肤免费，当前版本没有支付流程或联网排行榜。

开发功能遵循仓库统一 `SmallGamesDev`：URL `?dev=1` 或 `localStorage.dev = '1'` 显式启用，`?dev=0` 明确关闭，默认不显示。公共副本应通过仓库同步脚本维护，不在游戏内修改。

## Shell 接入与验证边界

访问 ID 为 `tower-brake`，workspace 包名为 `@coffeeeeffoc/tower-brake`，独立静态路径为 `/games/tower-brake/index.html`。Shell 通过同源 iframe 运行，清单、workspace 依赖、锁文件 importer、就绪标识与真实操作检查均已登记。

检查入口包括 `node scripts/sync-game-dev-mode.mjs --check`、`node --test scripts/game-dev-mode.test.mjs` 和 `node scripts/check-game-config.mjs tower-brake`。完整 Shell 构建与全量回归仍需要完整的 workspace 依赖和已初始化的 Git 子模块。

新游戏的 `game-meta.json` 创建记录来自真实源码提交；后续修改先提交源码，再运行 `pnpm sync:game-meta` 回填。元数据不使用当前时间或虚构 SHA。部分子模块未检出时，可使用相同 `gameHistory` 帮助函数仅回填本游戏，保留其余游戏已有记录。

设计效果图和交互取舍见 [设计说明](docs/design/README.md)。玩法明确借鉴《Helix Jump》的转塔、缺口与连续穿层机制，改动集中于限层路线和可主动触发的刹车；画面、代码、布局与界面独立制作。

本次验证结果与实际运行截图见 [验证记录](docs/TESTING.md)。
