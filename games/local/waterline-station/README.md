# 水位联动站 / Waterline Station

竖屏优先的水位联动解谜。点开黄铜管道上的阀轮，让箱子降到机关平台，让小船升到金色出口线，或用溢流推动水轮。50 关分为港口启航、分舱实验站、支流调度港、溢流动力站与联动总控站五章；旧关卡 ID、整数水量规则和通关记录保持兼容。

## 移动端 Cocos 版

本次按[方案与三屏效果图](docs/design/mobile-cocos-2026-10-25/README.md)重做主页、章节选关、场景、触屏控件、暂停、设置、帮助及结算。深海蓝港口背景由原创程序插画烘焙为 Sprite，水槽、阀门、船箱、管线与 UI 用真实 Cocos Graphics/Label 渲染；帧更新、触摸路由和本地音效由 Cocos 承载。核心规则继续独立于引擎。

引擎是从固定官方源码构建的 **Cocos Engine 3.8.8 Web runtime**，有源提交、构建工具、文件 SHA-256 和许可证；不是 Creator 编辑器导出，不包含微信/抖音原生小游戏包。构建时离线校验 vendor，不依赖 CDN。详见 [vendor/cocos/README.md](vendor/cocos/README.md)。

竖屏适合单手点选的分步解谜；短横屏采用场景与操作区分栏。宽屏居中显示，方向变化保留局面，不使用浏览器全屏入口。按钮至少 44 CSS px，忽略第二触点，拖出/取消不触发操作，失焦进入暂停。屏幕变化同步 Cocos render root、画布与相机，避免只更新 DOM 导致触点与画面错位。

## 运行与验证

仓库工具链：Node 24.21.0 / pnpm 12.6.0。

```sh
pnpm --filter @coffeeeeffoc/waterline-station dev
pnpm --filter @coffeeeeffoc/waterline-station test
pnpm --filter @coffeeeeffoc/waterline-station build
pnpm --filter @coffeeeeffoc/waterline-station test:browser
node games/local/waterline-station/tests/publishing.browser.mjs
pnpm check:games waterline-station
```

开发服务端口 4410，`node server.mjs --dist` 预览生产版。浏览器回归使用仓库锁定的 Playwright Chromium；可显式指定 `BROWSER_EXECUTABLE`、`PLAYWRIGHT_EXECUTABLE_PATH` 或 `CHROMIUM_PATH`。`CAPTURE_GAME_EVIDENCE=1` 将截图写入本次设计目录的 `actual/`，默认写到忽略提交的 `test-results/`。

大厅入口 `#/games/waterline-station`，独立静态页面 `games/waterline-station/index.html`。资源全部使用相对路径，dist 可部署到子目录。

## 操作与成长

- 首页“继续调度”进入当前局；“航线选关”按正常进度解锁。历史 v1 的已选/已通关关卡保持可访问，回访早期关卡不倒退解锁进度。
- 场景内点圆形阀轮开关，每次消耗一步。点管线仅选择、高亮两端水槽，不消耗操作。锁定阀轮说明所需箱子机关，溢流管可点选查看。
- 预测先显示白色虚线水位，再点同一阀轮确认；退出预测不耗步。撤销恢复水量、阀门、锁存机关及水轮动力，结算也可撤销末步。
- 提示读取当前状态最短解，不自动执行。失败后每局可免费加一步；撤销不恢复领取资格。本次保留免费辅助，不新增广告或渠道 SDK。
- 音效在设置中开关，采用原创本地 WAV 与 Cocos AudioSource，加载失败静音降级。尊重系统减弱动态偏好。
- 键盘补充：1–4 阀门、P 预测、Z 撤销、R 重来、H 提示、? 帮助、Esc 暂停/返回。Tab / Enter 可访问按钮，触屏不依赖键盘。

## 规则、存档与挑战

每槽容量 10 格、等宽，以整数千分格结算。连通分量均分水量，整除余量按槽顺序分配，总量守恒。箱子液位不高于平台线时锁存机关；所有船达到出口、所有机关与水轮目标满足即获胜，判胜优先于次数耗尽。溢流按配置顺序逐出口结算，上下游连通时不溢流，下游容量限制转移。星级仅按操作次数。最短解见 [docs/solutions.md](docs/solutions.md)。

存档继续使用 `waterline-station-v1`，保留 selected/sound/best，增量记录 unlocked；存储不可用仍可完整游玩。不跨 origin 迁移存档，不保存关闭网页前的半局。

`station=<关卡ID>&target=<步数>` 为同关邀请，挑战成绩与正常记录隔离。退出、另选普通关或下一站清理邀请与旧目标。提示、预测、撤销或加步标为辅助，分享不带比较成绩；开发跳关同样不写正常进度和比较成绩。分享复用公共 publishing.js，自动去除 dev。系统分享/剪贴板不可用时提供可选择复制的链接面板。

统一 `SmallGamesDev` 支持 URL/存储开关，显式 dev=0 优先。开发面板的调试选关允许访问未解锁站点并标为试玩。`window.__waterlineSnapshot()` 仅返回深复制的观察数据，含页面、局面、viewport 和 CSS 像素命中区域，不提供写入局面的后门。

## 文件与交付资料

- `engine.mjs` / `levels.mjs`：纯规则、求解器及 50 关配置。
- `game.mjs`：流程、Cocos 输入/音频/生命周期、存档与分享适配。
- `render.mjs` / `layout.mjs` / `art.mjs`：真实场景绘制、可测试布局和原创港口插画。
- `tests/`：规则、可解性、手机布局、50 关真实触屏求解、分享及存储隔离。
- [上架资料状态](publishing/STATUS.md)：文案、图标、宣传及实际运行素材。素材完成不代表平台上传、审核或上线。

实际验证是 Linux Chromium 手机视口与浏览器触屏模拟；不等同于 iOS/Android 真机或原生渠道 SDK 验收。
