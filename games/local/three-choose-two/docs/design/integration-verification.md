# 宿主接入与实际验证

日期：2026-10-07。以下记录为工作区构建和运行结果；最终候选 SHA、增量门禁与远端推送结果由仓库交付记录另行保存。

## H5 与 Shell

游戏使用独立 H5 页面，通过 `apps/shell-web/src/standalone-games.json` 登记，不复制一套 Shell 内置玩法。开发模式、全屏和 competition 客户端携带公共源文件的原样副本。Shell 沉浸消息沿用 `small-games-display` 契约，严格检查同源、iframe 来源及游戏 ID；开始游玩和暂停隐藏目录外围，返回首页恢复目录。

生产构建的独立页面与 Pages iframe 均实际运行过桌面鼠标和 390 × 844 手机触屏输入。语义入口检查走通首页、关卡说明、游玩、取消拖放、首关真实解法、三星结算、重试、暂停恢复、选关与正常解锁；正常玩家不能直接选择第 30 关。Pages 五个阶段 `embedded-load`、`embedded-gameplay`、`embedded-return`、`mobile-load`、`mobile-gameplay` 全部通过，运行时没有页面错误或资源隔离违规。

相关检查：

```sh
node scripts/sync-game-dev-mode.mjs --check
node scripts/sync-h5-fullscreen.mjs --check
node --test scripts/game-dev-mode.test.mjs apps/shell-web/scripts/standalone-game-entry.test.mjs
pnpm --filter @coffeeeeffoc/shell-web exec vitest run tests/standalone.integration.test.tsx tests/standalone-immersive.integration.test.tsx
# 在 apps/shell-web 目录运行，先准备本游戏生产副本及 Shell pages 构建
PAGES_GAME_IDS='["three-choose-two"]' PAGES_SKIP_BUILTINS=1 PAGES_SCREENSHOTS=0 node scripts/pages-smoke.mjs
```

同步检查通过，入口开关单元测试 10 项通过，Shell 接入与沉浸契约测试 82 项通过。开发模式生产浏览器验收还由准确候选的增量门禁执行，不能由这些单元测试替代。

## 微信与 B 站原生入口

同一纯规则、关卡和进度模块由 `native/canvas.mjs` 使用，通过现有 Canvas Game Host 和两个平台适配器启动；存档走宿主 storage port，广告走 advertising port，平台前后台和触点取消走现有 native target。原生工程设置竖屏，由宿主全屏承载，不显示浏览器全屏按钮。六个本地原创 WAV 音效和一个 55 KB 的原创背景音乐循环随包构建，暂停与后台停止音频，卸载释放声音、监听和计时器。

```sh
node apps/shell-minigame/scripts/build.mjs --game three-choose-two --platform wechat --preview
node scripts/native-game-smoke.mjs --standalone --game three-choose-two --platform wechat
node apps/shell-minigame/scripts/build.mjs --game three-choose-two --platform bilibili --preview
node scripts/native-game-smoke.mjs --standalone --game three-choose-two --platform bilibili
node games/local/three-choose-two/native/browser-check.mjs
```

两个平台实际 CJS 构建及 SDK 模拟运行冒烟均通过。Canvas 生产包在 Chromium 中使用模拟微信 SDK 和真实触屏事件，12 项流程通过：正常锁关、非法/取消拖放、多触点、首关三星与解锁、三次限额的单步撤销、前后台取消手势、首页继续、卸载后精确恢复、无尽练习、不含私有会话数据的真实练习成绩分享、320 × 640 小屏以及资源清理。实际声音加载和清理覆盖 7 个 WAV，设置保存覆盖音效、音乐、振动、高对比及减少闪光。截图与完整记录在 [native-actual/verification.json](native-actual/verification.json)。它们是浏览器与 SDK 模拟结果，尚未进行微信/B 站真机验收。

最终普通 preview 的微信 `game.js` 为 231,642 字节，整个包 344,129 字节；B 站 `game.js` 为 238,258 字节，整个包 350,774 字节。7 个 WAV 合计 112,074 字节，完整包统计包含入口、平台配置、发布状态记录和音频。

## 原生在线配置

`apps/shell-minigame/release-config.example.json` 中有本游戏的两平台配置项。复制到自己的配置文件，为对应平台填写真实 `appId` 与 API 基础地址，然后使用 `--config <文件>` 构建。API 地址必须为 HTTPS；只有 `--preview` 的本机回环地址允许 HTTP。环境变量 `VITE_THREE_CHOOSE_TWO_API_URL` 或 `THREE_CHOOSE_TWO_API_URL` 可作为 API 地址回退，文件配置优先。平台密钥留在服务端，不进入游戏包。

只有此游戏的 `configureCompetition` 登记项显式开启配置注入，并同时拥有 AppID 与 API 地址时，生产入口才注入公共客户端配置；`release.json` 记录 `competitionConfigured`。缺少配置时仍能闯关和无尽练习，排位入口明确提示不可用，不生成成绩、玩家或排行榜。原生请求通过微信/B 站 `SDK.request`；共享客户端的 H5 fetch 回退在原生运行中没有 `fetch` 可用，冒烟真实执行验证了该边界。

构建配置测试验证显式开启与关闭、HTTPS、仅预览回环 HTTP、URL 用户凭据和查询/片段拒绝。服务端重放与真实 PostgreSQL 验证见 [api-verification.md](api-verification.md)。原生两平台各 8 项、共 16 项在线实际输入检查通过，记录在 [native-actual/online-verification.json](native-actual/online-verification.json)：SDK 登录码通过模拟官方换取 openid 接口进入真实本地身份与令牌服务，SDK.request 转发真实 Runtime HTTP 和 PostgreSQL；响应丢失恢复不重复提交、发出前丢失重试仅一次、重挂确认状态、服务端重放结算与真实榜单、本组断网两步有序缓存且下一组等待服务端、旧排位回包不覆盖新本地练习，以及真实 409 冲突恢复后仍按玩家已发出的结束意图完成结算均通过。模拟只覆盖官方 code-to-openid HTTP 请求，游戏服务、身份令牌、操作序列、重放和成绩不被替换为前端夹具。

当前缺少真实平台 AppID，以上 preview 包不属于平台正式发布，也不声称完成官方登录或真机线上排位。

## 失败、撤销与广告续局

`native/recovery-check.mjs` 在两个平台各通过 9 项真实触屏检查，记录为 [微信](native-actual/recovery-wechat-verification.json) 和 [B 站](native-actual/recovery-bilibili-verification.json)。前置存档由纯规则的三步合法失误生成，第四步在运行中的生产包使用触屏输入，真实产生组数耗尽失败；首页与重新挂载返回失败结算，结果页撤销恢复棋盘和候选且消耗一次机会。

测试包使用现有构建的 `--preview --ad-unit-id native-recovery-fixture` 开启广告配置，模拟 SDK 广告取消、失败与明确 `isEnded=true` 三种结果。取消和失败保留原状态与续局次数；明确完成才增加两组并清除旧撤销，重新挂载不再发放；后台收到完成回执仍保持暂停，主动继续才回到棋盘；已确认 SDK 完成回执在写入后中断，重挂恢复一次。这些结果验证平台回执处理，未播放真实渠道广告。

```sh
node apps/shell-minigame/scripts/build.mjs --game three-choose-two --platform wechat --preview --ad-unit-id native-recovery-fixture
node games/local/three-choose-two/native/recovery-check.mjs --platform wechat
# B 站使用同样的两个命令，将 wechat 改为 bilibili。
# 可用 --artifact <独立目录> 读取已复制的测试包，避免覆盖其他验收的构建输出。
```

## 公共消费者

公共原生冒烟工具的消费者仍为 `shell-minigame` 和 `shell-bilibili`。本次 shell-minigame 全部普通 preview 构建、完整四渠道 CJS 冒烟、类型、lint、28 项 Vitest 和 107 项 Node 脚本测试通过；building-power 冒烟使用其现有 28 项规则测试生成的真实整班输入见证。shell-bilibili 构建、类型、lint、28 项测试与目录 CJS 冒烟通过。准确候选增量验证保留两个消费者，并只选择可证明的本游戏 H5 接入范围。
