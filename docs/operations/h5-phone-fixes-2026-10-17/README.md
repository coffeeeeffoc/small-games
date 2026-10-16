# H5 手机布局、连接诊断与方向配置

本次基于 dev `a7944ed44960a69fc87d946b680c50323619f3a0`；象五子棋子仓保持 `2238989bb5fa9beeaab591b6fa5717cf08fab6c7`。生产 CORS、管理员白名单、权限、凭据与数据库均未修改。

## 实现

- 围捕小队主页插画铺满视口，标题和顶栏独立避让宿主安全区；小横屏菜单在自身区域滚动，角色入口保持可触。设置与玩法页标题、返回和主操作固定。
- 街区追捕移除整个应用的安全区缩进。背景及画布延伸至边缘，主页/选关/HUD/队伍栏局部避让；地图按实际 HUD 与队伍栏几何适配，触控映射保持一致。修复短横屏暂停遮挡和结算主按钮溢出。
- 服务错误后出现默认折叠的“查看连接信息”。只显示页面推导且未验证的 Origin、去掉 userinfo/query/hash 的 API base、固定失败阶段、方法和必要头名称。每个快照绑定具体 Error；不显示原始异常、响应体、玩家/房间身份、token、Cookie、OAuth 参数、动作或分数，也不额外探测或上传日志。网络失败不直接称为 CORS。
- 三款 H5 构建清单和每游戏副本记录方向：围捕小队、象五子棋 `portrait`；街区 `preserve`。上传器校验配套清单及 ZIP SHA256，象五子棋和围捕小队使用 CLI 竖屏值 `1`；冲突在调用 CLI 前拒绝。Street 必须显式传已确认的平台方向，缺清单的 ZIP 也不能使用隐式默认值。

## 方向与发布限制

H5 ZIP 本身不能保证 TapTap 宿主方向。配套 JSON 必须跟随 ZIP；上传时按已确认的开发者/App ID 使用 `platforms/h5/deploy-taptap.ps1`。手动上传时在 TapTap 页面明确选竖屏。现有 CLI 回执仅证明请求值，不证明平台已生效；`orientationVerified` 保持 `false`，待服务端回读和 TapTap 手机验证。没有向 H5 包添加原生小游戏 `game.json`。

## 已执行验证

- 身份协议、诊断脱敏、方向契约与构建保留测试 33 项通过；上传器另覆盖无清单必须明确方向、冲突、哈希不符和 preserve，不调用真实 CLI。
- 围捕小队普通 H5 与模拟 TapTap SDK 安全区各 12 项主页、设置、玩法、帮助检查通过，含 320×568、390×844、844×390。手机参考图及实际截图在游戏 `docs/design/top-inset-2026-10-17/`。
- 街区追捕六组视口/宿主入口通过：320×568 UA 回退、390×853 DPR 2.4 SDK、844×390 与 568×320 SDK、390×844 普通浏览器和 iframe。使用真实触屏选择与道路指令，验证暂停计时、恢复、自然失败、旋转保持终局和重试；没有注入胜负或伪造广告完成。记录在游戏 `docs/design/top-inset-2026-10-16/actual/verification.json`。
- 三款实际编译服务开启、广告关闭的检查包，在 320/390 手机视口验证诊断折叠、展开、44px 热区、无横向溢出和固定字段。`connection-actual/verification.json` 记录编译包摘要。外部请求被拦截为网络失败，没有向生产创建会话或提交成绩。

以上为桌面 Chrome 155 手机/触屏模拟，不能称为 TapTap 真机验收。用户后续将最终交付收敛为三款各一个广告开启且服务开启的 H5 包，在配置中心及安全改动完成后生成新批次；不再额外生成其他组合或游戏。构建命令本身只编译和打包，质量检查与真广告验证状态保持如实记录。旧批次保留在根输出及每游戏 `dist/h5-packages`。

## 跨域与身份安全边界

已提供的 TapTap 页面属于 `https://ma-h5-al.tapimg.com`。该 origin 到生产游客会话接口的只读预检曾得到 `403 ORIGIN_REJECTED`。页面推导来源不等于观测到手机 App 实际请求的 Origin；生产尚未放行此来源。

当前 H5 身份键按 API endpoint 和 provider 区分，不含游戏或页面路径。若 TapTap 游戏共用 WebView 存储分区，不同路径会复用身份，同源第三方脚本也可读取 localStorage 凭据。改 key 前缀或缩短令牌期限不能建立同源安全隔离。两个玩家验收必须使用独立存储环境；长期方案需可信独立 origin 或宿主提供经核实的隔离/身份桥接。

公共 API 使用 GET/POST，浏览器预检 OPTIONS；必要头为 content-type 与 authorization，`credentials: omit`、`redirect: error`。若另获批准，CORS 仅在 Competition 应用策略维护精确协议＋域名＋端口，不启用 Cookie 或通配来源，不放宽管理 API。共享 host 无法按 `/h/...` 路径限制。

根 README、根 package.json 及 incremental-publication 文档中另一个任务尚未提交的 `push:no-verify` 改动被原样保留，不属于本次提交；本次继续使用正常 hooks 推送。
