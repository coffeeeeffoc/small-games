# 微信小游戏

微信使用 Creator 3.8.8 官方 `wechatgame` 导出、同一套玩法与 Cocos 输入／音频／生命周期。构建时在独立暂存工程把 `resources` 设为远程 Asset Bundle，脚本保留在主包；原工程的本地分包默认值继续供 B站、快手转换源等消费者使用。未配置 API 或广告位时，对应能力关闭；本机当前配置为本地 Docker 联网、无广告。

## 本地预览

在仓库根目录执行：

```powershell
pnpm --filter @coffeeeeffoc/night-overwatch build:wechat
pnpm --filter @coffeeeeffoc/night-overwatch dev:wechat
```

在微信开发者工具中导入 `games/local/night-overwatch/build/wechatgame`，使用此游戏的公开 AppID。默认 `touristappid` 仅供构建检查，账号或开发者工具若不允许游客小游戏，需要填写正式 AppID。开发工具本地调试时允许回环 HTTP 资源请求；手机无法访问电脑的 `127.0.0.1`，真机预览需重新构建为可访问的 HTTPS 资源地址。

资源服务监听 `127.0.0.1:4320`，根目录是 `build/wechatgame-remote`，引擎访问 `/remote/resources/...`。主包和远程资源必须来自同一次构建。

本机已在忽略提交的 `release-config.local.json` 配置公开 AppID `wx8f283351143d2dd3`，以及 `wechatApiUrl: "http://127.0.0.1:43003/api/competition/v1"`。这是现有 `night-overwatch-taptap-test` Docker 测试服务；沿用数据库和鉴权，没有切换生产后端。资源和 API 的回环地址仅供电脑开发者工具使用，不能填作手机访问地址或微信后台的正式合法域名。

联网新包还需在本地后管「夜航版本」登记 `build/wechatgame/wechat-manifest.json` 内的 `service.release` 六个字段并发布，不能仅以健康检查、登录成功代替新局准入。后管现有清单导入接受顶层 release 对象，故可导入提取的 `reports/wechat-release.json`；不要将整个微信清单伪装为 H5 清单。保持其他渠道、旧包及最新版本指针不变。

## 公开配置与发布构建

复制 `release-config.example.json` 为被 Git 忽略的 `release-config.local.json`，或设置下列环境变量；环境变量优先。不需要 AppSecret。

| 环境变量 | 本地配置字段 | 含义 |
| --- | --- | --- |
| `WECHAT_APP_ID` | `wechatAppId` | 本游戏的 `wx` AppID |
| `NIGHT_WECHAT_RESOURCE_URL` | `wechatResourceUrl` | 资源站根 URL；正式构建必须是 HTTPS |
| `NIGHT_WECHAT_API_URL` | `wechatApiUrl` | 可选的现有 Runtime API 根地址，沿用现有联网包配置；空值关闭联网 |
| `NIGHT_WECHAT_AD_UNIT_ID` | `wechatAdUnitId` | 可选的微信激励广告 `adunit-…`；空值关闭广告，不接受 TapTap 广告位 |

```powershell
pnpm --filter @coffeeeeffoc/night-overwatch build:wechat --release
node games/local/night-overwatch/scripts/build.mjs wechatgame --check-output --release
```

把 **`build/wechatgame-remote` 的内容**上传到资源 URL 根目录，保留其中 `remote/resources` 层级；主包单独导入开发者工具上传。建议资源 URL 含版本目录，保留旧版本资源，避免覆盖仍在使用的包。按微信后台要求配置资源下载域名及联网请求域名，正式验收保留域名校验。配置变化必须重建。

主包执行仓库保守的 4 MiB 门禁（包括构建清单），远程文件单独记录大小与 SHA-256。`wechat-manifest.json` 记录原始／暂存源码摘要、版本、规则、资源 URL 和公开配置；`platform-manifest.json` 记录外层交付证据。统一小游戏构建入口也交付同级 `-remote` 目录，不能只复制主包。每次实际微信编译消耗夜航共享版本号，失败编号不复用。

微信隔离工程默认放系统临时目录，可用 `NIGHT_NATIVE_STAGE_DIR` 指向有空间的构建磁盘。其他渠道保留 `.scratch/nine-native-cocos` 默认值；本机该目录是空间不足的 I 盘缓存联接，跨渠道配置测试使用系统临时目录。暂存位置不会改变最终交付路径。

## 能力与验收边界

- 存档、行动日志与游客会话使用微信同步存储；配额／写入失败继续交给原有保存错误处理，不伪装成功。当前游客身份沿用现有服务，不使用 `wx.login`，不等同于微信账号跨设备登录。
- 配置 API 后复用现有服务端鉴权与 `wx.request`，聊天查询无需浏览器 `URLSearchParams`。联网发布仍需按现有版本准入流程登记清单中的 `service.release`、`channel: wechat` 及准确 `buildId`；仅设置地址不保证服务端已准入。
- 激励广告复用共享 Creator bridge，仅 `isEnded === true` 发奖。准备阶段有超时，展示后等待真实关闭；取消、失败、迟到回调均不能发奖。保留微信菜单分享，未新增跨平台账号或外部房间分享协议。
- SDK fixture 和开发者工具验证不代替实体手机、真实广告和正式 API 验收。用户已手动登录开发者工具，正式 AppID 导入、横屏首页及首关操作已验证；当前联网包的本地后端准入另行记录。

上架八类基础资料仍见 [STATUS](../publishing/STATUS.md)，旧 H5 媒体保留原采集身份，不冒充微信实机素材。微信账号中实际的提审规格尚待核对。

官方依据：[微信小游戏发布](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html)、[Asset Bundle](https://docs.cocos.com/creator/3.8/manual/zh/asset/bundle.html)、[命令行构建](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-in-command-line.html)。

## 本轮验证

2026-11-15 当前包为 **1.1.10**，完整主包 **4,074,567 字节**，远程资源 **56,313,998 字节**。公开 AppID 为 `wx8f283351143d2dd3`，API 指向本地 Docker，广告关闭。`reports/wechatgame-size.json`、`reports/wechat-verification.json`、`reports/wechat-local-backend.json` 和 `reports/build-wechatgame.log` 记录构建及验收。原始源码摘要 `84c7467ca05e904c5b6d2e4e8873d9bb71ad8c9556545c6df8ebf35abade8cd9`；隔离工程编译摘要 `496aaa12a37e76ea3ab99e040181dee82abf3960ebd1085077bd80f7f9db470a`。两者差异来自微信独立资源配置。

| 检查 | 结果 |
| --- | --- |
| 实际 Creator 微信构建、当前源码／主包／远程清单校验 | 通过 |
| 本地 HTTP 下载全部105个远程文件并核对 SHA-256 | 通过 |
| 实际交付 `night-wechat.js` 在无浏览器全局的 VM 中初始化、存储读写 | 通过；仅 bootstrap，不代表 Cocos 场景运行 |
| 微信开发者工具 2.02.2608070／基础库 3.18.0，离线 1.1.9 | 横屏首页、首关开火（弹药120→119）、暂停退出、重新编译后音效设置保留均通过；音效已恢复开启 |
| 本地 Docker 联网 1.1.10 | 实际交付 bootstrap 请求本地 API、游客会话保存、开发者工具显示联网首页通过；后续已登记准确构建，回环和 Sakura HTTPS 的新局创建／恢复／取消均200，未重开开发者工具验证开局 |
| 原生配置、隔离工程、交付和微信 fixture | 30项最终通过；一次新增测试漏导入 mkdir 已修正，交付10项补跑通过；最终微信4项再通过 |
| 共享 native shell、Creator广告、ad-runtime | 分别28、18、16项通过；十分钟为虚拟时钟测试 |
| 夜航、native shell、ad-runtime 类型检查 | 通过 |
| 既有服务／启动／训练回归 | 96/97通过；旧关卡数量断言期望4/6/8而当前为28/42/56，本次未改该规则 |
| 依赖边界检查 | 本次新增边界已登记；既有 `apps/admin-web/tests/players.browser.mjs` → `scripts/admin-caddy-fixture.mjs` 仍失败 |
| 八类上架资料 | 43个文件大小和 SHA-256 一致，未改媒体采集身份 |

最初的原生配置测试因 I 盘缓存空间不足失败，切换系统临时目录后通过。开发者工具登录前的 CLI “AppID不存在”不计为成功；用户登录并填入正式 AppID 后，CLI 导入成功。首次打开曾显示启动页面配置错误，选择「普通编译」并执行完整编译后横屏正常，控制台0错误；现有2项警告为 HarmonyOS 平台提示和资源缓存目录已存在。

微信公众平台后台访问被本次浏览器安全策略阻止，因此没有开通流量主、创建广告位或修改后台配置；需用户手动确认资格并提供真实激励视频 `adunit-…`。后台待核对项为应用类型小游戏、AppID、request 合法域名、downloadFile 合法域名和激励广告位。当前无 AppSecret、无 `wx.login`，无需为本地游客联调新增服务端密钥；合法域名需使用实际可访问的 HTTPS 主机，不能直接照抄上述回环地址。

未执行完整九游戏批量构建、手机、真实广告、正式 API 验收，也未上传、提交或推送。

## 2026-11-15 FRP 跟进

用户确认本地测试应复用根目录 `game-build.local.mjs` 中的夜航测试地址。已将本机忽略提交的 `release-config.local.json` 的 API 改为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`，资源配置为同域 `/night-wechat/1.1.13/`，广告位留空。用户在微信后台看到流量主需累计独立访客 UV > 100；这是本账号反馈，当前不具备开通资格。

当前**最后实际验证的交付包仍为上文 1.1.10 回环联调包**，新 HTTPS 配置尚未生成可验收制品。1.1.11 停在 Creator 设备初始化；1.1.12 因用户反馈电脑过卡而停止，编号不复用。静态资源容器与网关部署脚本已准备在 `.scratch/night-overwatch-selftest/deploy-wechat-resources.mjs`，尚未执行，不宣称资源 URL 已可访问。后续重建时资源 URL 的版本目录应与本次实际分配的版本一致；编译成功后再部署并核对全部资源摘要。

本地后管已更新为 `night-20261115-admin-oauth60`：原容器真实 GitHub 回调在兑换阶段10秒超时，本次仅替换已有60秒修复的编译模块。5项定向测试、隔离镜像及实际容器超时断言通过；Runtime、Postgres、Gateway 容器与私密环境保留，无数据库迁移。用户已登录会话在更新后刷新有效，游戏配置和运行规则读取成功；未重新执行真实GitHub换码。脱敏部署记录见[本地部署回执](../../../../docs/operations/releases/2026-11-15-night-local-oauth60/README.md)。

已通过正常后管草稿／发布流程登记1.1.10的准确 `service.release`，开关分组1.1.0；保留TapTap推荐与旧包映射，微信未设为推荐。本地回环及Sakura HTTPS接口均识别当前版本1.1.10，单人、双人准入为true，房间列表及创建／恢复／取消单人局均200。使用新建QA游客，测试局已取消、会话已退出；不等同于手机或完整双人对战验收。见 `reports/wechat-admission.json` 与 `reports/wechat-frp-followup.json`。现有交付包仍为回环配置，HTTPS新包和静态资源部署仍待后续恢复构建。
