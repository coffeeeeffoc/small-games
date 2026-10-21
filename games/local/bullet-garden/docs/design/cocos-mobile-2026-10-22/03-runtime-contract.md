# Cocos 运行接入契约

本游戏正式入口为 Creator 3.8.8 场景 `assets/scenes/main.scene`。旧 `src` 中模拟、关卡、成长、战斗、世界及负载模块经 esbuild 编译为 ignored `assets/scripts/generated/core.js`，不运行旧网页渲染器。`scripts/typecheck.mjs` 和 build 都先 prepare，因此 clean checkout 可执行 typecheck → test → build。

## 根集成入口

- `node build.mjs` 薄转发；package build 为 `node scripts/build.mjs web-mobile`。
- `node scripts/build.mjs web-mobile|web-desktop|wechatgame`；后者作为官方 TapTap 转换输入，方向 portrait。
- `node scripts/serve.mjs` 仅预览生产 dist，默认4356；`--desktop` 预览 web-desktop，默认4357；PORT 可覆盖。
- `BULLET_GARDEN_PREBUILT_DIR` 指向含 `dist/`、真实 `cc.d.ts` 的游戏制品目录。验证 Creator版本、target、sourceHash、配置及完整文件 inventory，拒绝内容更改及额外运行文件。
- 公共开发开关副本在 `scripts/dev-mode.js`，由根同步脚本登记这个位置；Web开机先加载。没有全屏入口及 fullscreen 公共源。
- package 新增已有版本 esbuild 0.28.2、typescript 7.0.2、@playwright/test 1.55.1，根锁文件由主会话接入。临时本地 node_modules junction 仅指向此 checkout 已安装的准确包，不作为可发布输入。

## 渠道配置

`BULLET_GARDEN_PLATFORM_CONFIG` 指向严格 JSON（模板 `platform-build.example.json`）。只接受四字段：platform 为 preview / taptap / taptap-h5；appId、adUnitId 为字符串；adsEnabled 为布尔。无配置默认 preview、空ID、false。启用广告须提供本游戏真实ID，不使用其他游戏ID。原生只接受 taptap 或 preview，Web只接受 taptap-h5 或 preview。配置编译为 Creator模块，不靠 URL 或可写快照注入。

提供商是公共 `platforms/h5/platform-ads.js`，两渠道均使用 tap。公共源已提供明确的 taptap native 映射、multiton 及 onShown；本游戏不操作平台后台。默认无配置隐藏两种补给，普通游玩免费。仅 completed 授奖，每局复活/治疗各一次。hidden 收到完成先暂存，show 后授奖且保持暂停。native hide 可早于 onShown；只有同一广告租约可继续，重开/返回/销毁立即失效。

## 只读快照

`globalThis.__bulletGarden.snapshot()` 返回独立数据副本：

- `engine`、`screen`（home/levels/playing/upgrade/paused/failed/result/camp/catalog/settings/help）、`phase`（模拟状态）。
- `controls.developerMode`、practice、joystickActive、skillAiming、move。
- `buttons[]` 含 id、label、disabled、rect、clientRect；rect 为逻辑坐标，clientRect 为浏览器客户区坐标，均 x/y/w/h。
- `viewport` 含 width/height、safeTop/safeBottom、battle和camera(x/y/zoom)。
- `state` 含 levelId/mapId/phase/time/duration/kills/coins/player、轻量enemies、skills能量、stats、upgrades、boons。
- `profile` 为旧存档schema的副本；`ads` 含 configured/platform/pending/used/status；`art` 含 ready/loaded。

主要按钮ID：start、levels、level:ruins（等稳定ID）、depart、pause、resume、upgrade:技能ID、finish、next、home、camp、help、settings、developer、move、dash、skill:0/1、ad:revive/supply。真实输入通过返回的clientRect定位。没有state setter、时间加速或自然胜利注入。

## 验证状态

实施过程见 [04-implementation-handoff.md](04-implementation-handoff.md)，交付验证以 [05-validation.md](05-validation.md) 为准。广告fixture仅用于测试，默认发布包恢复preview且关闭广告。没有真机或真实SDK验收。
