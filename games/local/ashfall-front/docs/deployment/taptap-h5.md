# 灰烬防线 · TapTap H5 上架

本游戏使用 HTML/Canvas 与相对资源，采用 TapTap 的 H5 游戏发布形态。官方 H5 MCP 接受包含 `index.html` 的构建目录，上传方向参数 `screenOrientation: 2` 表示横屏。2026-10-13 重新核对官方上传源码：工具压缩时保留构建目录名；官方手工上传说明也要求 ZIP 只有一个英文/数字顶层文件夹，其下直接包含 `index.html`。

## 准备包体

在仓库根目录使用 Node 24.21.0、pnpm 12.6.0。Windows 打包命令使用系统 PowerShell/.NET，不安装 ZIP 依赖；普通构建与浏览器测试仍跨平台：

```powershell
pnpm --filter @coffeeeeffoc/ashfall-front package:taptap
pnpm --filter @coffeeeeffoc/ashfall-front test
pnpm --filter @coffeeeeffoc/ashfall-front test:browser
```

命令先构建，再写入 `outputs/ashfall-front/ashfall-front-taptap-h5.zip`，逐一解压读取并核对全部文件大小与 SHA-256；拒绝符号链接、非预期文件、重复/缺失条目与内容不一致。验证成功才替换成品并刷新 [包体记录](../qa/taptap-h5-package.json)。记录中的上传、审核、真机标记始终是本次本地包的待验状态，不能用打包成功代替平台回执。

```text
ashfall-front-taptap-h5.zip
└─ dist/
   ├─ index.html
   ├─ style.css
   ├─ dev-mode.js
   ├─ fullscreen.js
   ├─ src/*.mjs
   └─ assets/emblem.svg
```

| 使用方式                | 所需入口                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| 官方 H5 MCP             | 相对工作区的 `gamePath: "games/local/ashfall-front/dist"`，该目录内是 `index.html`；工具自行加目录层并压缩 |
| 后台手工上传            | 上传上述 ZIP，内部入口是 `dist/index.html`，顶层只有 `dist/`；不要用 `dist/*` 压缩成根层文件               |
| 本地独立 / Shell iframe | 原有 `dist/index.html` 和 Shell 注册；H5 上传包不包含 Shell                                                |

资源和 ES 模块路径保持相对，ZIP 使用 `/` 分隔符，不包含服务器、测试、设计文档、源映射或密钥。应通过 HTTP(S) 加载并保证 `.mjs` 为 JavaScript MIME；双击 `file://` 不是 ES 模块入口验收。构建没有网络服务、外部素材、登录、广告或支付依赖。ZIP 是 H5 静态包；仓库 `platforms/taptap` 的 `tap`/`game.js`/`game.json` 和 Cocos 转换流程属于原生 Tap 小游戏，当前 H5 发布不使用这些入口。

## 后台发布

1. 登录本人开发者账号，创建或选择“灰烬防线”的 H5 游戏，核对开发者主体、应用 ID 与发布通道。本会话没有 TapTap 账号连接或平台回执，仓库中没有待填写的必需密钥。
2. 官方 MCP 先通过 `get_current_app_info` 核对已选应用，再使用 `prepare_h5_upload` 检查上述相对构建目录；核对结果后调用 `upload_h5_game` 并指定 `screenOrientation: 2`。不要将 ZIP 文件路径当作 `gamePath`，也不要把仓库根作为上传目录。
3. 如后台提供手工 H5/Web 包上传入口，上传上述 ZIP；以当前后台实际字段为准，不沿用未核实的旧版菜单名称。核对包体解析结果、H5 启动 URL、版本/包 ID和服务端横屏设置，保留回执；方向查询失败时先查状态，避免重复上传。
4. 先开放内部测试并完成下表真机验收，再补齐平台要求的厂商与游戏资料、年龄分级、图标/推广图、实际运行截图和视频。仓库版本为 `1.0.0`；后台版本字段及递增规则须按当前应用确认。
5. 按所选发布通道核实资质、隐私说明、启动校验/防沉迷要求。当前没有 TapTap 登录或启动校验 SDK、防沉迷集成及其验收视频，不能填“已接入”；若后台要求 H5 SDK，须取得该通道官方接口后接入并重新验收，不能用原生 `tap` API 顶替。满足后台门槛后提交审核，另行记录审核和线上启动结果。

简介可使用：在废墟工厂中跳跃、冲刺、方向连射，引爆连锁油桶并组合战地改装，突破拆解者的机械防线。

横屏适配使用完整容器与安全区；浏览器方向锁定失败时仍可旋转游玩。Android WebView 方向 meta 是辅助提示，TapTap 后台横屏配置才是渠道发布设置。测试包不依赖登录、服务器或外部素材，存储不可用时保留本次会话进度。

手机端主页或暂停页打开“操作指南”显示触屏说明：按住橙色射击键连射，朝目标方向拖动瞄准；向右上/右下拖即向右上/右下射击，左上/左下同理，松开停止。电脑端显示 I / J / K 单键射击说明。操作指南跟随实际触屏/键鼠输入切换；从暂停进入时不恢复战斗。

## 发布验收

本地从 ZIP 解压后的 `/dist/` 入口执行完整生产浏览器流程，记录见 [发布准备验证](../qa/taptap-h5-verification-2026-10-13.md)。浏览器脚本支持 `ASHFALL_TEST_URL` 指向已启动的 HTTP(S) 构建入口，`ASHFALL_QA_DIR` 指定截图/报告目录；指定入口时不会重新构建或启动源代码服务器，避免误测另一份产物。

| 仍需实际设备 / 后台完成           | 验收与留存                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 真实 TapTap 手机 H5 WebView冷启动 | 记录客户端/系统/WebView版本、设备型号、包 ID、启动 URL和首屏耗时；确认模块 MIME 与全部资源加载成功                    |
| 物理横屏、关闭自动旋转、刘海/圆角 | 三种手机比例之外观察实际握持，检查全部页面安全区、按钮热区、旋转触控方向；重点观察右手按钮附近的敌人                  |
| 移动 + 拖动瞄准 + 跳跃/冲刺       | 多指同时操作，移出热区、来电/系统手势取消后输入不残留；真实 WebView体验不可由 CDP 触屏代替                            |
| 前后台、音效、全屏拒绝/退出       | 锁屏/切应用后保持暂停，继续无计时跳变/重复射击；用户手势解锁音效；全屏不支持时普通视口仍能玩                          |
| 全流程与存档                      | 三战区、两次改装、Boss、失败重试、结算返回与选关；关闭/重启、更新包后保持同源存档；渠道域名变化可能不会继承原站点存档 |
| 平台内测试/资料/审核              | 留存实际回执与审核状态，补齐本通道所需资质、SDK及实机素材；正式启动链接不附带 `dev=1`                                 |

存档使用该 H5 origin 的本地存储，不是 TapTap 云存档；无存储权限时只保留当前会话。H5 可保留浏览器全屏入口；实际客户端的方向/全屏策略仍需确认。当前仅完成本地生产包与 Chromium 手机触屏模拟，不表示已上传、审核通过或真机验证。

官方依据（2026-10-13 核查）：[开发服务的 H5/WEB 形态](https://developer.taptap.cn/)、[H5 上传工具与横屏参数](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/tools.ts)、[H5 上传与 ZIP 实现](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/handlers.ts)、[官方手工包体说明](https://www.taptap.cn/moment/598609424361196724)、[PC/H5 内部测试与发布通道说明](https://developer.taptap.cn/docs/pc-store/guide/document-guide/)。
