# 转塔留一脚刹车

一个移动端优先的竖屏圆塔短挑战。球自动弹跳和下落，左右滑动转动整座塔，把缺口对准球，抵达第 12 层终点。30 套布局按通关进度解锁。

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
| `levels.mjs`                    | 30 套十二层配置、无尽楼层生成及内容校验       |
| `progress.mjs`                  | 解锁、成绩、偏好设置与存档恢复                |
| `render.mjs`                    | Canvas 圆环、球、轨迹、危险纹理与落点预告     |
| `main.mjs`                      | 页面切换、手势、音效、生命周期与规则层连接    |
| `dev-mode.js` / `fullscreen.js` | 公共 H5 开发模式与全屏能力副本                |

进度保存在当前浏览器。存储不可用时使用会话内进度并提示，不阻断游玩。纯净挑战与使用续关的成绩分别记录，开发模式中的试玩也与正常成绩隔离。

H5 版本未接真实广告 SDK，失败后提供明确标注的“免费续关”，每局最多一次，从最近平台继续。该入口不模拟广告观看或发放付费奖励。所有皮肤免费，当前版本没有支付流程。战役续关成绩不上传全站排行榜，无尽挑战不提供续关。

开发功能遵循仓库统一 `SmallGamesDev`：URL `?dev=1` 或 `localStorage.dev = '1'` 显式启用，`?dev=0` 明确关闭，默认不显示。公共副本应通过仓库同步脚本维护，不在游戏内修改。

## Shell 接入与验证边界

访问 ID 为 `tower-brake`，workspace 包名为 `@coffeeeeffoc/tower-brake`，独立静态路径为 `/games/tower-brake/index.html`。Shell 通过同源 iframe 运行，清单、workspace 依赖、锁文件 importer、就绪标识与真实操作检查均已登记。

检查入口包括 `node scripts/sync-game-dev-mode.mjs --check`、`node --test scripts/game-dev-mode.test.mjs` 和 `node scripts/check-game-config.mjs tower-brake`。完整 Shell 构建与全量回归仍需要完整的 workspace 依赖和已初始化的 Git 子模块。

新游戏的 `game-meta.json` 创建记录来自真实源码提交；后续修改先提交源码，再运行 `pnpm sync:game-meta` 回填。元数据不使用当前时间或虚构 SHA。部分子模块未检出时，可使用相同 `gameHistory` 帮助函数仅回填本游戏，保留其余游戏已有记录。

设计效果图和交互取舍见 [设计说明](docs/design/README.md)。玩法明确借鉴《Helix Jump》的转塔、缺口与连续穿层机制，改动集中于限层路线和可主动触发的刹车；画面、代码、布局与界面独立制作。

本次验证结果与实际运行截图见 [验证记录](docs/TESTING.md)。

## 同场分享与发布配置

结算页提供真实同关挑战链接；打开后从主页的好友挑战入口进入。塔和救援使用稳定关卡配置，弹珠同时保留初始随机种子，挑战结果不改普通关卡解锁和存档。链接剥离 `dev` 等参数；分享不代表服务器认证成绩，尚未提供实时在线对战。弹珠旧存档缺少初始种子时隐藏分享，避免误称复现。

构建复制 `platforms/h5/publishing.js` 公共源，开发服务器映射同一公共文件；不维护游戏副本。默认显式 `mock` 模式，弹层标记“模拟广告”，每三次自然转场最多触发一次插屏，并受公共冷却和会话上限约束。生产入口可以在模块加载前配置 `globalThis.SmallGamesPublishingConfig = { adMode: 'off' }`；真实渠道由统一平台层接入，不把密钥放入页面。救援外部 GameHost 的广告接口保留优先权，只在本地使用公共模拟奖励。塔原免费续关与各款免费重试保留。

本轮规则与触屏校验记录见 [发布改进](docs/design/publishing/README.md)。

## 无尽挑战与通用排行榜

无尽模式持续生成楼层，保留累计穿层/积分，最多缓存 36 层，难度渐进而没有终点。无尽最佳独立存储，不修改战役解锁；旧八关全通存档会继续解锁第九关。

排行榜使用公共 `game-services.js` / `competition.js`，提供闯关、无尽两个榜，显示游客或登录身份。120 Hz 固定步长输入提交统一服务回放验证；开发模式、好友挑战、续关和离线局不上传。服务不可用时仍可本地继续挑战。

本次实现前设计稿和验证记录见 [30 关与无尽](docs/design/endless-2026-10-12/README.md)。

## 章节机制

第 9 关开始出现缓慢往返自转的机关环，第 13 关引入标有双箭头的加速环，第 19 关加入只弱化远处的薄雾，第 25 关起组合三种机制。近处两层、下一个落点及雷达始终可见。自动机关使用模拟时钟，暂停会停止；刹车仅冻结球，仍可转塔，机关也继续移动。续关会按当前机关相位校正塔角度，保留原来的安全落点而不回退计时。无尽模式逐段引入相同机制。

独立静态部署可在构建时设置 `COMPETITION_PUBLIC_API_URL=https://example.com/api/competition/v1`；开发服务器支持同一环境变量。页面注入的 `__COMPETITION_CONFIG__` 优先，无配置时使用同源接口。API 地址仅允许不含账号、查询或片段的 HTTP(S) 基础地址。
