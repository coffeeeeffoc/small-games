# 摆消乐 · Place & Clear

竖屏 8×8 积木消除游戏：每组三块，放下两块，剩下一块自动舍弃；填满整行或整列就会消除。保留原花园插画、音效、120 关、两种无尽玩法和旧存档。

## Cocos Creator 3.8.8

唯一 Web 发布入口为 Creator 构建的 dist/index.html。assets/scripts/PlaceAndClear.ts、GardenView.ts、GameSession.ts 使用 Sprite、Graphics、Label、input 和 AudioSource；游戏画面及交互在 Creator 场景中执行，HTML 仅承载启动、共享平台桥和无障碍镜像。

在仓库根安装冻结依赖，再在本目录运行：

~~~sh
pnpm typecheck
pnpm test
pnpm build
pnpm dev
pnpm test:browser
pnpm test:publishing:browser
~~~

预览 [http://localhost:4422](http://localhost:4422)。开发前先构建；修改后重新构建。浏览器专项会启动自己的临时端口，也可用 PLACE_AND_CLEAR_BROWSER_URL 指向已有生产预览。PLAYWRIGHT_EXECUTABLE_PATH 可指定 Chromium。

构建需要真实 Creator 3.8.8，或 sourceHash、运行产物摘要和引擎声明均匹配的 PLACE_AND_CLEAR_PREBUILT_DIR。纯规则 src/*.mjs 是服务端和兼容宿主的同一来源；prepare.mjs 确定性生成 Creator 使用的 JS 模块，不维护第二份规则。

## 操作和开发模式

- 手机拖动积木，或先点候选、再点棋盘落点；电脑也可鼠标拖放/点选。
- 选关、帮助、暂停等长页面可滑动或滚轮滚动。取消手势不会落子。
- 首页返回保留本局；暂停页“退出关卡”放弃当前局，保留已获星级和解锁。
- 默认关闭开发模式。?dev=1 或统一 localStorage.dev 开启，?dev=0 显式关闭。开发选关四页共 120 关，可任意试玩，不修改正式进度、纪录或排位。
- PlaceAndClearDev 保留参考解、撤销补充、重置、清空棋盘、参数调整和调试动作注册。分享不会携带开发参数。
- “消除闪光”关闭后仍保留得分文字；原 reducedFlash 存档语义不变。
- 游戏不显示或注入“全屏”按钮。

getPlaceAndClearSnapshot() 是只读验收接口，包含 Creator 版本、ready、screen/state、controls、viewport 和 layout（棋盘 inset/pitch、候选位置）。浏览器门禁读取布局后发出真实鼠标或触屏输入，不靠改写状态通关。

## 可选的激励重置

游玩中点击“重置选项”，确认“看广告并重置”。仅 completed 完成回调替换未放置候选；棋盘、分数、组数、目标、已用槽和正常出块随机序列保持。重置后不允许撤销回奖励前。取消、失败、不可用、旧局/旧请求迟到均不发奖。

复用 SmallGamesRewardAds.offer；原生宿主可提供 PlaceAndClearHost.ads。当前无广告位，按钮会提示暂不可用，正常游玩、重开和免费撤销不受影响。后续 H5 配置 H5_ADS_ENABLED=1 和 TAPTAP_PLACE_AND_CLEAR_AD_UNIT_ID 后重新构建，使用共享 provider。没有默认模拟完成广告。

在线排位与好友同种子挑战不允许重置；已重置无尽局仅分享成绩，不生成公平同局挑战链接。完成奖励先写收据，正式存档成功后清理，恢复时不会用旧收据覆盖较新的局面。

## 规则、存档与在线

120 关配置和全部合法参考路径保留。每关有三次免费单步撤销；普通三选二放两块后弃一块，“立即补位”每放一块仅补原槽，分别保存本地纪录。规则版本 three-choose-two-v1、进度 key three-choose-two-progress-v1 和在线恢复 key three-choose-two-online-v1 不变。

API 路径 /api/competition/v1/three-choose-two，沿用现有服务器秘密种子、顺序动作、幂等结算和排行榜。H5 匿名在线试玩不入正式榜；离线分数不上传为排位。服务不可用时离线玩法仍可继续。开发模式不修改正式在线成绩。

真实服务与 PostgreSQL 专项保留在 tests/online.browser.mjs，需要隔离的 PLACE_AND_CLEAR_TEST_DATABASE_URL（数据库名 competition_test）、已构建的 Runtime 和迁移 010–012，运行 pnpm test:online:browser。平台身份夹具不能代替官方 SDK 登录或真机验收。

## 兼容和交付证据

原 ./engine、./shapes、./levels、./progress、./canvas 导出保留。build:native:legacy / test:native:legacy 明确服务旧 Canvas 宿主，不能当成本次 Cocos 原生包。main.mjs/style.css 仅为历史外观参考，根 index.html 不再加载它们；fullscreen.js 仅保留未引用的兼容副本。新原生目标需独立构建和真机验收。

- [设计及素材来源](docs/design/cocos-2026-10-23/design.md)
- [改名验证](docs/design/rename-2026-10-25.md)
- [Creator 迁移验证](docs/design/cocos-2026-10-23/VALIDATION.md)
- [上架资料八类清单](publishing/STATUS.md)
- [历史花园设计](docs/design/garden-2026-10-07/refinement.md)

## 名称与兼容标识

游戏中文名为「摆消乐」，英文名为 **Place & Clear**；源码目录、workspace 包、公开目录入口及新构建标识使用 `place-and-clear`。通过 `git mv` 迁移文件并保留 Cocos 场景、脚本和资源 UUID。

旧大厅分享路由与 `/games/three-choose-two/index.html` 继续指向新入口，保留挑战参数。同一 origin 下沿用已有进度、在线恢复和奖励收据；旧规则版本、随机哈希域、Creator 生成资源命名空间，以及 `/api/competition/v1/three-choose-two` 鉴权与数据库身份保持稳定。兼容 Canvas 宿主通过独立 `storageGameId` 继续访问旧原生存档及 B站收藏签记录。

新的广告变量为 `TAPTAP_PLACE_AND_CLEAR_AD_UNIT_ID`，未配置时兼容原 `TAPTAP_THREE_CHOOSE_TWO_AD_UNIT_ID`。新宿主桥使用 `PlaceAndClearHost.ads`，也接受旧 `ThreeChooseTwoHost.ads`。
