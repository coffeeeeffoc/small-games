# 九款游戏的平台接入状态

核验日期：2026-10-01（Asia/Shanghai）。这里区分浏览器入口、原生构建入口、本轮实际制品验证与官方工具/真机验收。浏览器 H5 与原生小游戏是不同运行环境；原生竞争工程仅覆盖其好友竞赛玩法，不能代表完整单机产品已迁移。

## 入口与当前原生状态

| 游戏                | Web / H5 入口                                               | 微信小游戏                                           | B站小游戏                                                     | 抖音小游戏                                              | 快手小游戏                                                  |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| 浪湾卡丁车          | `games/local/carding-car`，Cocos Web                        | 现有 Cocos `wechatgame` 构建入口；本轮缺引擎制品未验 | 现有 Cocos `biligame` 构建入口；本轮制品未验                  | 新增 `bytedance-mini-game` 配置与构建入口；配置检查通过 | 缺 Creator 3.8.8 已验证适配插件，未注册假目标               |
| 围捕小队            | `games/local/cops-robbers`                                  | Canvas 好友赛制品 / VM 通过                          | Canvas 好友赛制品 / VM 通过                                   | Canvas 好友赛制品 / VM 通过；服务端登录待接入           | Canvas 好友赛制品 / VM 通过；SDK/工具配置及服务端登录待核验 |
| 别跑！街区围捕      | `games/local/cops-robbers-realtime`                         | Canvas 好友赛制品 / VM 通过                          | Canvas 好友赛制品 / VM 通过                                   | Canvas 好友赛制品 / VM 通过；服务端登录待接入           | Canvas 好友赛制品 / VM 通过；SDK/工具配置及服务端登录待核验 |
| 词屿 · 字母叠叠乐   | `games/local/letters-words2`                                | Canvas 好友赛制品 / VM 通过                          | Canvas 好友赛制品 / VM 通过                                   | Canvas 好友赛制品 / VM 通过；服务端登录待接入           | Canvas 好友赛制品 / VM 通过；SDK/工具配置及服务端登录待核验 |
| 此时·此地           | `games/local/vibeJam-myself-history-guess`                  | Canvas 好友赛及本地场景制品 / VM 通过                | Canvas 好友赛及本地场景制品 / VM 通过                         | Canvas 好友赛制品 / VM 通过；服务端登录待接入           | Canvas 好友赛制品 / VM 通过；SDK/工具配置及服务端登录待核验 |
| 象五子棋            | `games/submodules/xiangqi-five`                             | Canvas 好友赛制品 / VM 通过                          | Canvas 好友赛制品 / VM 通过                                   | Canvas 好友赛制品 / VM 通过；服务端登录待接入           | Canvas 好友赛制品 / VM 通过；SDK/工具配置及服务端登录待核验 |
| 江风入境 · 外滩漫游 | `games/local/travel-bund`，React Three Fiber/Three/物理场景 | 需原生场景、输入、界面与音频适配                     | 同左                                                          | 同左                                                    | 同左                                                        |
| 夜航守望            | `games/local/night-overwatch`，Cocos Web                    | 新增 Cocos 构建入口；配置检查通过，制品未验          | 新增 Cocos 构建入口及官方 B站插件复用；配置检查通过，制品未验 | 新增 Cocos 构建入口；配置检查通过，制品未验             | 缺 Creator 3.8.8 已验证适配插件，未注册假目标               |
| 乌龙城              | `games/local/wulong-city`，Canvas 场景及 DOM 界面           | 需原生界面、输入、媒体与宿主适配                     | 同左                                                          | 同左                                                    | 同左                                                        |

上述五款 Canvas 工程分别输出至 `apps/shell-minigame/dist/<platform>/<game>/`。本轮已实际生成 20 份 `game.js`、平台配置、共享确认音，以及历史游戏的本地场景资源。`release.json` 记录 `gameplayScope: server-authoritative friend competition only`、`nativeRuntimeVerified: false`、`platformLoginVerified: false`；填写 AppID 不会自动把这两个值改成通过。

本轮没有官方开发工具或实体设备证据，不以 VM 通过更新既有原生验收记录。微信卡丁车的历史工具验证见 [六款原生验收记录](native-target-validation.md)，其历史证据不覆盖本次代码变更。

## 复现本轮 Canvas 制品检查

```sh
# 五款 × 四原生渠道；也可加 --game=xiangqi-five --platform=kuaishou。
node scripts/competition-build.mjs --native
node scripts/competition-native-smoke.mjs
node scripts/competition-client.test.mjs

# 共享运行层和渠道适配回归。
pnpm --filter @coffeeeeffoc/platform-kuaishou test
pnpm --filter @coffeeeeffoc/platform-douyin test
pnpm --filter @coffeeeeffoc/shell-minigame test
```

制品检查在没有 `document` / `window` / `fetch` 的 VM 里执行实际 `game.js`，通过 SDK fixture 使用真正的服务端游戏规则验证：围捕路口移动、实时围捕道路命令、词屿触摸字母并提交一个正确词、历史地图落点与年代输入并提交揭晓、象五子棋抽子及棋盘部署。每个目标还覆盖后台输入/轮询拒绝、按渠道/游戏隔离存档、存储故障时保留声音控制、DPR 变化、Canvas save/restore 平衡、退出监听/计时器/媒体清理。

20 个目标各执行正常音频、创建失败、初始化失败、播放失败四种场景，共 80 场景通过；可选启动参数返回空值或抛错、分享抛错仍保留房间码邀请。图片检查确认制品内资源存在并可传入绘制接口，没有声称完成真实 SDK 图片解码、字体兼容、官方包体限制或完整对局实玩。共享通用 Game Host 的另五款历史 Canvas 游戏也完成四渠道构建及 20 份制品回归，用于防止共同运行层改动破坏既有玩法；它们不计入用户指定的九款接入数量。

## 平台配置与剩余验证

复制 `platforms/competition/release-config.example.json` 到 Git 忽略目录，按每款 × 每平台分别填写真实 AppID 与 HTTPS API 地址，用 `COMPETITION_RELEASE_CONFIG` 传入构建。AppSecret 仅供服务端安全配置，不写入前端工程或文档。

抖音/快手客户端分别使用 `tt` / `ks` 原生 SDK，把有效 login `code` 发给已有服务端登录路由；缺少 SDK 或无效 code 明确失败，并不会回退浏览器游客身份。本轮无法读取两渠道官方 code2Session 文档，因此没有猜测服务端换码协议。服务端明示 `PLATFORM_LOGIN_UNAVAILABLE`，玩家看到“此平台的好友挑战暂不可用，请稍后再试。”；模拟已登录 fixture 仅用于制品/玩法回归。

快手基础 SDK 运行端口与配置边界见 [快手接入说明](../../platforms/kuaishou/README.md)。快手广告尚未核验，配置广告位会被构建器拒绝。Cocos 两款的快手目标需可信适配插件；江风入境和乌龙城需原生玩法渲染及界面迁移，H5 iframe 不提供此能力。

取得官方资料、各游戏平台应用权限、后端认证绑定与设备后，逐款逐渠道完成启动、实际玩法、音频、存档、前后台、邀请参数、两独立身份同局、结算与榜单、断线恢复；真实广告完整观看/提前关闭/失败另行验收。当前状态均不表示已经上传、提审或上线。
