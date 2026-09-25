# 六款游戏 × 两个平台原生验收记录

核验日期：2026-09-23（Asia/Shanghai）。独立验收 agent：`native_acceptance`。当前结论：**12 个独立构建目标存在并通过 JavaScript 语法检查；微信卡丁车已在真实开发者工具中进入竞速、暂停和好友面板。其余目标尚未完成原生运行，12 个目标均未完成原生平台登录 → 双人 PK → 结算 → 全站榜单的验收，不能宣布平台接入整体完成。**

本记录区分打包、实际开发者工具操作、平台服务和实体设备。没有使用 SDK mock、浏览器模拟器或截图代替原生工具运行。

## 实际环境与证据

- 微信开发者工具：安装位置 `D:/微信web开发者工具`，窗口版本 `Stable 2.02.2608070`。本轮 `cli.bat islogin` 已登录；真实 CLI HTTP 服务为 `127.0.0.1:60752`。此账号的登录状态不代表它拥有其余 11 个目标的应用权限。
- B站开发者工具：已安装 `2.0.11.0`，位置 `C:/Users/15211/AppData/Local/Programs/small-app-ide`；本轮实际启动到项目列表窗口。其自带官方 `bili-sgame-cli 2.1.21` 的 `--help` 和 `serve --help` 可执行。未调用上传/发布指令。
- Windows 原生工具通过 `computer-use` 的 `node_repl + @oai/sky` 操作。B站窗口捕获连续出现 `window capture timed out: timed out waiting on channel` 和 `FrameArrived timed out: timed out waiting on channel`；刷新并重选窗口后仍失败，未盲点导入。已关闭本轮启动的 B站进程以释放内存，没有关闭用户原有微信工具。
- 微信窗口显式激活后可正常查看和操作。刚执行鼠标动作时，抓帧可能仍显示动作前画面；已等待后续观察确认变化，未据旧帧认定按钮失败。
- `adb devices` 实际返回空设备列表。未连接 Android 实体设备；未完成 iPhone 或微信/B站真机流程。
- 本地详细 CLI 输出、当前 `game.js` SHA-256、构建时间和语法检查结果保存在 Git 忽略目录 `.scratch/competition/native-validation/`：`wechat-<gameId>.log`、`artifacts.json`、`syntax.json`。这些是本机证据，不随仓库提交，不含 AppSecret。

## 12 个目标矩阵

下表“构建”指本轮实际产物及 `node --check game.js`，并非平台 SDK 编译或真机运行。“未验”表示未取得对应证据。

五款Canvas公共入口另接入真实 `createInnerAudioContext`，复用仓库短确认音，提供静音开关/存储、后台和音频中断停止、退出释放。对应 [B站音频官方文档](https://miniapp.bilibili.com/small-game-doc/ability/audio/) 于2026-09-23核验；音频资源已打包，实际平台播放与听感仍未验，不以源码接入冒充已听到声音。

| 游戏              | 平台 | 独立导入目录（相对仓库根）                                       | 构建                               | 实际导入与运行进度                                                                                                         | 登录 / PK / 排行榜具体阻塞                                                                                                      | 真机 |
| ----------------- | ---- | ---------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 浪湾卡丁车        | 微信 | `games/local/carding-car/build/wechatgame`                       | Cocos 构建成功；语法通过           | CLI `open` 成功；真实模拟器已显示 3D 场景、开始竞速、收起准备面板、计时/车速/碰撞变化，点击暂停进入“休息一下”；未跑完 3 圈 | 本地 AppID 已存在；共享平台登录对应服务端密钥及 API/WSS 配置尚未完成本轮原生联调；双客户端、结算、全站榜未验                    | 未验 |
| 浪湾卡丁车        | B站  | `games/local/carding-car/build/biligame`                         | Cocos 构建成功；语法通过           | 工具启动到项目列表；本轮目标未导入运行                                                                                     | 当前构建缺有效 B站 AppID/API；工具历史项目的 AppID 不能当成本轮构建配置或权限证明；登录密钥、平台域名及真实两客户端待配置与验证 | 未验 |
| 围捕小队          | 微信 | `apps/shell-minigame/dist/wechat/cops-robbers`                   | 原生 Canvas 包；语法通过           | 实际 CLI `open` 拒绝：`code: 10`，不存在此 AppID；未到 Canvas 启动                                                         | 本游戏微信 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 围捕小队          | B站  | `apps/shell-minigame/dist/bilibili/cops-robbers`                 | 原生 Canvas 包；语法通过           | 未导入；B站窗口捕获失败                                                                                                    | 本游戏 B站 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 别跑！街区围捕    | 微信 | `apps/shell-minigame/dist/wechat/cops-robbers-realtime`          | 原生 Canvas 包；语法通过           | 实际 CLI `open` 拒绝：`code: 10`，不存在此 AppID；未到 Canvas 启动                                                         | 本游戏微信 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 别跑！街区围捕    | B站  | `apps/shell-minigame/dist/bilibili/cops-robbers-realtime`        | 原生 Canvas 包；语法通过           | 未导入；B站窗口捕获失败                                                                                                    | 本游戏 B站 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 词屿 · 字母叠叠乐 | 微信 | `apps/shell-minigame/dist/wechat/letters-words2`                 | 原生 Canvas 包；语法通过           | 实际 CLI `open` 拒绝：`code: 10`，不存在此 AppID；未到 Canvas 启动                                                         | 本游戏微信 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 词屿 · 字母叠叠乐 | B站  | `apps/shell-minigame/dist/bilibili/letters-words2`               | 原生 Canvas 包；语法通过           | 未导入；B站窗口捕获失败                                                                                                    | 本游戏 B站 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 此时·此地         | 微信 | `apps/shell-minigame/dist/wechat/vibeJam-myself-history-guess`   | 原生 Canvas 包与场景资源；语法通过 | 实际 CLI `open` 拒绝：`code: 10`，不存在此 AppID；未到 Canvas 启动                                                         | 本游戏微信 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 此时·此地         | B站  | `apps/shell-minigame/dist/bilibili/vibeJam-myself-history-guess` | 原生 Canvas 包与场景资源；语法通过 | 未导入；B站窗口捕获失败                                                                                                    | 本游戏 B站 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 象五子棋          | 微信 | `apps/shell-minigame/dist/wechat/xiangqi-five`                   | 原生 Canvas 包；语法通过           | 实际 CLI `open` 拒绝：`code: 10`，不存在此 AppID；未到 Canvas 启动                                                         | 本游戏微信 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |
| 象五子棋          | B站  | `apps/shell-minigame/dist/bilibili/xiangqi-five`                 | 原生 Canvas 包；语法通过           | 未导入；B站窗口捕获失败                                                                                                    | 本游戏 B站 AppID、开发成员权限、API 地址及后端平台密钥均待配置；PK/榜未验                                                       | 未验 |

五款 Canvas 每款每平台分别产生自己的 `game.js`、`game.json`、`project.config.json`、`release.json`，没有使用合集作为交付单位。当前十份 `release.json` 明确 `appId: null`、`apiConfigured: false`、`mode: preview-unverified`。其微信 `touristappid` 在本机真实工具中不能打开小游戏，不能把预览标识写成已可运行。围捕小队/街区围捕/词屿/此时此地/象五子棋对应独立核心玩法渲染器，但未获得平台运行证据之前，其触摸、字体、资源、Canvas API 差异和生命周期均仍待实测。

微信 CLI 的上述五次失败**退出码仍为 0**；必须同时检查输出中的 `[error]`、`code` 和 `message`，不能仅用 `$LASTEXITCODE` 判断通过。

## 微信卡丁车操作记录与待复验项

1. 执行实际 `open --project .../build/wechatgame`，输出 `√ open`，窗口标题为 `carding-car`。
2. 模拟器控制台输出 `[carding-car build] 2026-09-22T17:38:52.632Z`，随后 `[carding-car] ready: native Cocos scene, 4 karts, 3 laps`。确认运行的是本轮产物。
3. 准备页点击“开始”；后续真实画面已进入竞速，准备大面板消失，计时从 0 增长，速度与碰撞场景变化。
4. 点击暂停图标；画面出现“休息一下”，时间停在 `2:15.80`，保留当前场景。未完成整场比赛或双人 PK，不把本项扩写为完整核心流程通过。
5. 工具当前使用 iPhone 12/13 竖屏模拟器，虽然 `game.json` 为 `landscape`，未在本轮切换设备方向完成横屏适配验收。
6. 工具 Console 可见“app.json 或自定义编译条件错误：app.json 中未定义自定义编译中指定的启动页面”。这没有阻止上述 Cocos 场景运行，仍需检查项目编译条件，不能忽略错误后宣称零异常。
7. 暂停时点击黄色“好友联机”，后续真实帧已出现完整“好友一起开跑”面板：新建练习、排位好友赛、加入好友、全站 Top 100 / 我的最佳。暂停时间仍为 `2:15.80`。先前因即时抓帧未更新而产生的入口疑点已关闭，没有据此修改玩法代码。原生截图证据为 `.scratch/competition/native-validation/wechat-kart-before-friend.png`（文件名含 before，但内容为已经打开的面板）。
8. 实际点击“排位好友赛”未创建出可用比赛；点击“全站 Top 100 / 我的最佳”后，真实工具显示“海湾标准赛 · 全站 Top 100”面板及“全站服务暂不可用，请稍后刷新”“网络不可用，请重试；成绩尚未得到服务端确认”。没有填充假名次或本地假榜。证据 `.scratch/competition/native-validation/wechat-kart-ranked-unconfigured.png`。本项仅通过服务不可用反馈，未通过平台登录或全站查询。

B站卡丁构建检查实际发现 `project.config.json` 残留微信 AppID；实现 agent 修复后已重新构建，独立执行 `node games/local/carding-car/scripts/build.mjs bilibili --check-output` 返回 `Bilibili output checked: preview-only, AppID missing; official adapters preserved`。修复了平台配置混用，未因此声称获得有效 B站 AppID 或完成 B站工具运行。

总负责人随后补齐卡丁结算页直接展示服务端个人最佳、排名变化和目标差距，并重新构建H5/微信/B站。H5源码hash为 `068623b5b193f3a0a0fc77acee079036b29ca64ec8e21a33f608570685ee0b79`；B站输出平台隔离检查再次通过。上述真实微信工具记录发生在这次结算UI改动前，不能作为新增原生结算UI的运行证据。

## 补齐资源后的复现方法

本地后端、数据库、HTTPS/WSS 隧道和配置方法见 [本地联调说明](six-games-local-integration.md)。阿里云/平台账号准备见 [准备清单](aliyun-preparation-checklist.md)。

```powershell
# 在仓库根目录构建十个独立 Canvas 平台目标。
$env:COMPETITION_RELEASE_CONFIG = (Resolve-Path '.scratch/competition/release-config.local.json').Path
pnpm competition:native

# 卡丁车使用它自己的现有 Cocos 构建入口。
node games/local/carding-car/scripts/build.mjs wechatgame
node games/local/carding-car/scripts/build.mjs bilibili

# 对每个微信目标逐个执行，检查正文而非仅检查 ExitCode。
& 'D:/微信web开发者工具/cli.bat' islogin
& 'D:/微信web开发者工具/cli.bat' open --project (Resolve-Path 'apps/shell-minigame/dist/wechat/cops-robbers').Path
```

先将 `platforms/competition/release-config.example.json` 复制到 `.scratch/competition/release-config.local.json`，其中按游戏 ID 和平台分开填入该应用的 `appId` 与本轮 HTTPS 业务 `apiUrl`。必须是六个游戏各自的平台应用，不能临时把卡丁车 AppID 套给其余五款。AppSecret 只从本机安全配置或部署密钥管理注入后端 `COMPETITION_PLATFORM_CONFIG`，不写入这个前端配置、不写入普通文档、不粘贴在聊天中。改变临时域名后重新构建相应平台目标，并按平台要求配置开发/体验环境域名；跳过开发工具域名检查不能视为满足正式平台要求。

B站选择“小游戏”后导入上表对应的独立目录；确认 `game.json.appId` 和本游戏平台配置一致，再运行。官方 CLI 的 `serve` 是本地调试命令，其 `--help` 可用并不意味着 IDE 已导入，也不意味着真机已连接。补验每个目标都应包含：启动 → 实际核心操作 → 真实平台登录 → 第二独立身份加入 → 双方准备/比赛 → 一致结算 → 全站 Top 100/PB/排名 → 断线重连 → 后台/前台恢复；随后在对应平台实体手机再执行一轮。

## 集中资源缺项

| 准备项                         | 数量与适用范围              | 当前状态                                        | 安全填写位置 / 验收条件                                                       |
| ------------------------------ | --------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| 微信小游戏 AppID               | 六款各 1 个                 | 卡丁本地有配置；其余五款缺                      | 前端本地 release 配置；每款真实工具可打开且开发者权限有效                     |
| B站小游戏 AppID                | 六款各 1 个                 | 本轮构建未配置；卡丁旧 IDE 记录需应用负责人核对 | 前端本地 release 配置；每款真实工具可打开，不沿用其他游戏身份                 |
| 平台登录密钥                   | 每个平台应用各自对应        | 本轮共享后端未完成配置                          | 仅后端安全环境变量/密钥服务 `COMPETITION_PLATFORM_CONFIG`，不得提交 AppSecret |
| 开发者、体验成员及两名真实玩家 | 每款每平台可访问的账号/成员 | 本轮只确认微信工具已登录                        | 平台管理后台由账号负责人配置；每款取得两独立身份完整 PK 证据                  |
| API、Socket、资源和分享配置    | 每款每平台                  | 本轮原生地址未完成联调配置                      | 开发使用本地忽略配置；体验/正式按平台当前域名与邀请规则配置                   |
| 可操作开发者工具窗口           | 2 种工具                    | 微信可操作；B站已启动但捕获失败                 | B站恢复可观察操作后逐目录导入，不从日志推断运行成功                           |
| Android / iOS 实体设备         | 对应支持平台至少双客户端    | ADB 无设备；其他真机未验                        | 两个真实客户端完成登录、邀请参数接收、触摸、音频、前后台、PK 和结算           |

## 官方资料及核验边界

资料检索日期：2026-09-23。

- [B站小游戏开发者工具与 CLI](https://miniapp.bilibili.com/small-game-doc/guide/cli)：官方推荐 IDE；本轮检查的是小游戏工具，未使用小程序 WebView 包装代替原生游戏。
- [B站小游戏发布说明](https://miniapp.bilibili.com/small-game-doc/guide/publish)：AppID 与应用后台配置关联；发布域名限制不能用本地调试通过替代。
- [B站小游戏登录](https://miniapp.bilibili.com/small-game-doc/open/login)、[原生分享](https://miniapp.bilibili.com/small-game-doc/open/share/share)、[域名白名单](https://miniapp.bilibili.com/small-game-doc/guide/urlwhitelist)：用于后续平台登录、原生邀请与网络验收。
- [微信小游戏开发者工具](https://developers.weixin.qq.com/minigame/dev/devtools/devtools.html)、[服务端 code2Session](https://developers.weixin.qq.com/minigame/dev/api-backend/open-api/login/auth.code2Session.html)：本轮检索未能稳定读取微信官方正文，不能声称已重新核验全部最新政策；工具版本、CLI 行为和上述卡丁运行来自本机实测，正式配置仍须在对应官方后台核对。

这些阻塞不被内部体验分抵消。缺资源的目标应维持“构建通过、原生联调未通过”状态，完成上述证据后再更新矩阵。
