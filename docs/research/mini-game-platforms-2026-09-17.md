# 多款游戏分别接入小游戏平台：渠道研究

调研日期：2026-09-17。用户已明确企业主体、先广告变现；目标是每款游戏分别发行，不是将整个游戏大厅提交为一款游戏。本文记录公开官方文档；平台存在、技术可开发、主体可入驻、产品可获准上架、商业化获准开通，是五个不同结论。未登录各平台管理后台，因此不保证当前账号具备权限，也不保证审核或流量结果。

## 结论

多渠道发行在技术上可行，但应分别处理 JS/Canvas 小游戏运行时、厂商快游戏、浏览器 H5 渠道。Canvas/WebGL 能复用不代表浏览器 DOM/CSS、iframe、音频、网络、存档能直接照搬；平台 SDK 和必接审核能力还需按渠道实现。微信已有官方 Canvas/API 示例，B站明确支持 Canvas/WebGL 及小游戏工程迁移；厂商联盟与 H5 渠道则有各自发布链路。[微信官方示例](https://github.com/wechat-miniprogram/minigame-demo)、[B站介绍](https://miniapp.bilibili.com/small-game-doc/guide/intro/)、[快游戏联盟](https://www.quickapp.cn/doc/game/)、[4399官方文档](https://open.4399.cn/docs/)

若希望尽量覆盖国内渠道，企业主体是实际优先项：B站、快手、淘宝官方均明确限制企业开发者。企业入驻资格不会自动替代每款游戏所需版权、资质、备案或商业化审核。[B站后台](https://miniapp.bilibili.com/small-game-doc/source/manager/)、[快手资质规范](https://open.kuaishou.com/miniGameDocs/operation/specification/qualifications.html)、[淘宝注册与入驻](https://developer.alibaba.com/docs/doc.htm?articleId=121648&docType=1&treeId=824)

## 已证实国内渠道

| 渠道                          | 接入形态与发行单位                                                    | 主体/资质证据                                                          | 本轮建议与待确认项                                       |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| 微信小游戏                    | 每款 AppID，`game.js`/`game.json`，平台绘制及 API；官方示例使用适配层 | 本轮官网正文抓取失败；当前个人/企业各自上线及变现材料须后台核实        | 第一批目标；不要把普通小程序或 H5 页面发布等同为小游戏   |
| 哔哩哔哩小游戏                | 每款注册 APPID、游戏包托管、B站 App 内运行，Canvas/WebGL              | 官方明确仅企业开发者注册；完整资质清单本轮未公开确认                   | 第一批目标；启动上报、侧边栏与桌面奖励均需完成           |
| 抖音小游戏及支持宿主          | 单款小游戏，开放平台技术/备案/商业化链路                              | 官方团队 FAQ 明确个人和企业均可创建；作品备案要求已证实                | 下一批目标；主体数量和宿主状态应后台再查                 |
| 快手小游戏                    | 每款 appid，`ks` API、平台开发工具、真机扫码、上传提审                | 仅企业；上线软著、自审、作品备案材料；开付费前版号                     | 下一批目标；免费发布和内购发布材料分开确认               |
| vivo/OPPO/小米/荣耀快游戏联盟 | 联盟统一包体/API，统一 `.minigame` 包名和发布链路                     | 联盟页面说明联网游戏统一备案、单机签合同；个人可否入驻及详细材料未确认 | 作为一组生态评估，先核实统一发行权限和 SDK 适用范围      |
| 华为小游戏/快游戏             | 独立厂商生态、AGC 上架、平台迁移工具；与上述四家联盟分开              | 官方快游戏上架页列版权与版号；另有备案链路，见下文                     | 中后批目标，先确认所选发行形态及适用资质                 |
| 支付宝小游戏                  | 官网明确独立小游戏开发入口                                            | 已证实渠道存在；本轮文档 SPA 无可读正文，小游戏主体/版号/包体未确认    | 纳入候选；不能拿支付宝普通小程序的个人支持推断小游戏支持 |
| QQ小游戏                      | 腾讯官方 QQ 小游戏示例、开发工具及游戏工程                            | 当前完整准入/资质正文未确认                                            | 纳入候选；应重新核实当前平台开放状态与变现申请           |
| 百度小游戏                    | 官方小游戏运营规范及平台入口存在                                      | 可读规范较旧，要求游戏资质并限制批量换皮                               | 后续候选；不能凭 2018 年文档保证当前可自助上架           |
| 4399 H5小游戏                 | 浏览器 H5 渠道，官方单列基础/存档/排行榜/激励/插屏 API                | 当前主体、合作筛选、版权及资质清单本轮未确认                           | 有利于保留 H5 版本；与 H5页游联运、4399小程序、手游分开  |
| 芒果TV小游戏                  | 全屏及半屏，平台工具、AppID、SDK；FAQ出现 `index.html`/CDN跨域        | 注册页明确个人、企业主体认证页面；版号/商业结算准入未确认              | 候选；H5形态证据较强，不能直接假设与微信运行时一致       |
| 淘宝小游戏                    | 淘宝互动开放平台独立小游戏入口                                        | 仅企业；官方要求首次接入先联系平台负责人                               | 商务候选，先联系确认是否适合普通休闲游戏                 |

表格来源：[微信官方示例](https://github.com/wechat-miniprogram/minigame-demo)、[B站后台](https://miniapp.bilibili.com/small-game-doc/source/manager/)、[抖音官方团队FAQ](https://developer.open-douyin.com/forum/share/post/671f04dd67ccd35b42b7066f)、[快手资质](https://open.kuaishou.com/miniGameDocs/operation/specification/qualifications.html)、[快手流程](https://open.kuaishou.com/miniGameDocs/gameDev/start/start.html)、[联盟概述](https://www.quickapp.cn/doc/game/)、[华为业务页](https://developer.huawei.com/consumer/cn/mini-games/)、[华为上架](https://developer.huawei.com/consumer/cn/doc/quickapp-guides/quickgame-app-release-0000001113458344)、[支付宝官网](https://open.alipay.com/)、[QQ官方示例](https://github.com/qq-web/qq-minigame-demo)、[百度规范](https://smartprogram.baidu.com/opensourcedocs/operations/game/)、[4399官方文档](https://open.4399.cn/docs/)、[芒果注册](https://open.mgtv.com/docs/minigame/introduction/register/)、[芒果FAQ](https://open.mgtv.com/docs/minigame/questions/question/)、[淘宝入驻](https://developer.alibaba.com/docs/doc.htm?articleId=121648&docType=1&treeId=824)

## 微信：可开发证据与核实边界

官方示例工程包含 `game.js`、`game.json`、开发者 AppID、绘制/媒体/网络/存储/广告示例，需微信开发者工具及合法域名配置。示例适配器实际用 `wx.createCanvas()` 创建画布，通过模拟的 `document` 处理少量标签与选择器。因此可以确认存在平台 Canvas/API 适配路线；不能把模拟 DOM 当作完整浏览器布局、CSS、HTML 或 iframe 支持。[官方示例README](https://github.com/wechat-miniprogram/minigame-demo)、[官方适配器源码](https://github.com/wechat-miniprogram/minigame-demo/blob/master/miniprogram/js/libs/weapp-adapter.js)

本轮 `developers.weixin.qq.com` 指南及引擎/Adapter 页面多次不可读取，直接请求其中引擎旧路径返回 404。未用第三方教程替代当前主体、软著、IAA/IAP、版号、包体额度、iOS支付或流量主门槛结论。后续在实际小游戏账号内分别确认：主体类型、单款注册配额、资质与授权、作品备案、小程序ICP备案、隐私与实名防沉迷、广告开通和结算、虚拟支付资格、当前分包额度。官方示例证明开发方式，不证明账号准入。

## B站：已有迁移路线，但审核项不能漏

官方完整流程是注册开发者、域名白名单、生成小游戏兼容工程、按目录与配置适配、开发工具调试、上传开发版、真机预览、提交审核。支持 Canvas/WebGL；Cocos/Laya/Egret 的官方适配说明普遍从微信小游戏导出物迁移，并要求 `bl.launchSuccess()`，部分引擎版本、Wasm、首屏渲染还有限定。这佐证可复用小游戏渲染核心，但不是所有 Web 依赖直接兼容。[介绍](https://miniapp.bilibili.com/small-game-doc/guide/intro/)、[引擎适配](https://miniapp.bilibili.com/small-game-doc/engine/common)

`game.json` 需版本和 appId，可配置方向及网络超时；分包官方限制是所有分包合计不超过30M、每个主包/分包不超过4M。大型资源需预算、压缩、分包或远程加载；不能把所有游戏的共享资源整体带入每个发行包。[配置](https://miniapp.bilibili.com/small-game-doc/framework/config)、[分包](https://miniapp.bilibili.com/small-game-doc/ability/subpackage)

侧边栏复访明确是必接审核项：启动时同步监听 `bl.onShow`，使用最新场景信息，检查宿主支持情况，展示引导并在从侧边栏返回后给每日奖励；未接入存在新游或更新拒审风险。自动跳转 `bl.navigateToScene` 是强烈建议，区别于页面明确的必接审核要求。[侧边栏官方指引](https://miniapp.bilibili.com/small-game-doc/open/sidebar)

桌面快捷方式也是标注必接的能力：`bl.addShortcut` 引导添加，`bl.onShow` 的桌面场景值 `10002` 识别入口，发每日礼包并保证幂等。官方特意说明该流程无需调用 `bl.checkShortcut`，不能把缺少该检查函数本身当作审核缺陷。[桌面官方指引](https://miniapp.bilibili.com/small-game-doc/open/shortcut)

官方有激励视频 API（需按基础库版本兼容）以及服务端创单/退款/签名支付文档，说明平台具备商业化技术能力；广告权限、分成、结算、支付主体与版号要求仍需实际后台确认。服务端 `access_token` 不应放到小游戏客户端。[激励视频](https://miniapp.bilibili.com/small-game-doc/api/ad/createRewardedVideoAd/)、[支付](https://miniapp.bilibili.com/small-game-doc/sgame-recharge.html)、[服务端安全](https://miniapp.bilibili.com/small-game-doc/server-ability/backend-api)

## 抖音、厂商生态与H5渠道的关键差异

抖音团队2024年FAQ列个人最多50款、企业100款（含下架），支持多宿主；也说明当时部分 iOS 宿主有访问/广告能力问题。这是仍公开的官方记录，不宜拿旧宿主状态或配额保证2026年实际开放权限。当前备案说明要求资质及作品备案，平台审核过版本后协助申报，监管时效不保证。[官方FAQ](https://developer.open-douyin.com/forum/share/post/671f04dd67ccd35b42b7066f)、[小游戏作品备案](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/game-filing-application-works)

快游戏联盟当前明确四家统一技术与发行；数据/运营章节仍有待支持项，不能把宣传的一次开发理解成免除具体SDK、权限和真机验证。小米单独文档还区分有版号、无版号前置备案和断网可玩的单机承诺函，说明各渠道/旧发行链路不能直接套用同一合规清单。[联盟文档](https://www.quickapp.cn/doc/game/)、[小米接入进阶](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2098)

华为2026年上架文档列版权和版号，并要求授权明确覆盖快游戏；业务页另列快游戏备案。必须确认本产品选择的小游戏/快游戏发行路径、单机/联网及商业化条件后读取对应完整规范；不能据其他厂商的无版号路线推断华为必然允许，也不能仅据某个上架页认定所有华为小游戏形态统一条件。[华为上架](https://developer.huawei.com/consumer/cn/doc/quickapp-guides/quickgame-app-release-0000001113458344)、[华为业务入口](https://developer.huawei.com/consumer/cn/mini-games/)

4399官网把 H5小游戏、H5页游联运、4399小程序、微端、手机游戏分开。现有H5游戏可首先询问 H5小游戏业务，避免误接面向重度页游的登录/充值联运流程。[4399官方目录](https://open.4399.cn/docs/)

芒果FAQ要求 `game.json`/`project.config.json`，同时出现 `index.html`、`window.VConsole` 和 CDN CORS 指引；本轮应视为有网页技术证据的独立渠道。FAQ说暂不支持分包，建议代码资源包30–40M、其余资源CDN，并要求广告真机测试；这是该页建议而非本轮已验证的硬性上传上限。[芒果FAQ](https://open.mgtv.com/docs/minigame/questions/question/)

## 资质与备案：每款游戏建立清单

区分软件著作权、平台自审/版权授权、游戏作品核准/备案、工信部小程序/快应用ICP备案、网络游戏出版审批（版号）和广告/支付审核。ICP备案通知涵盖小程序、快应用分发，境内从事APP互联网信息服务应先备案再开展业务；完成网站备案不等于已完成所有应用信息备案。[工信部通知](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html)

NPPA国产网络游戏审批办事页列出版单位、著作权和运营机构资质条件；“同一平台10个以上小游戏可同一文件申报、原则上不超过20个”说的是申报文件组织，并非一个版号可随意覆盖24款独立作品。是否符合打包申报及各款所需材料，应由出版单位及主管部门确认。[国家新闻出版署办事指南](https://www.nppa.gov.cn/bsfw/xksx/cbfxl/wlcbfwspsx/202210/t20221013_600725.html)

上述平台对免费/广告/内购、单机/联网存在不同公开材料路径，不能写“所有小游戏都不用版号”或“所有小游戏必须先同一种版号才能开发”。例如快手明确开付费前版号，小米有无版号前置备案；开发测试、平台发布和依法运营仍需分别判断。[快手资质](https://open.kuaishou.com/miniGameDocs/operation/specification/qualifications.html)、[小米进阶](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2098)

独立发行意味着各款名称、AppID、版权及授权、真实玩法材料、隐私政策、审核版本、广告位和支付配置分别管理。百度明确禁止仅换美术/UI/素材而批量提交玩法内容基本一致的游戏；抖音官方也有套用资质违规提醒，因此不能用整个仓库的一份模糊资质替代各产品核验。[百度规范](https://smartprogram.baidu.com/opensourcedocs/operations/game/)、[抖音官方资质Q&A](https://developer.open-douyin.com/forum/share/post/65a9f0684c47935e437ff94c)

## 海外H5候选

| 渠道       | 已确认事实                                                                                                                                                    | 对本项目的意义                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| CrazyGames | Basic Launch无变现、SDK可选；Full要求SDK且广告使用渠道方案。技术要求总包≤250MB/1500文件，首载≤50MB、mobile首页≤20MB；个人爱好者可提交但需筛选，缺英语可能被拒 | 保留H5发行线、补英语、测首载及渠道SDK                                              |
| Poki       | 官方合作指引要求Web独占，同款不能投其他Web门户/聚合渠道                                                                                                       | 与尽量多平台发行有冲突；逐款核对独占范围，微信/B站是否涵盖需书面确认，不能默认豁免 |
| GamePix    | HTML5开发者账号、轻量SDK与托管分发                                                                                                                            | 候选H5托管分发业务                                                                 |
| itch.io    | 支持带index.html的HTML5 ZIP、浏览器iframe运行                                                                                                                 | 适合直接发布收反馈；不等同国内IAA小游戏发行                                        |

来源：[CrazyGames发行要求](https://docs.crazygames.com/requirements/intro/)、[技术要求](https://docs.crazygames.com/requirements/technical/)、[FAQ](https://docs.crazygames.com/faq/)、[Poki合作](https://developers.poki.com/guide/working-with-poki)、[GamePix开发者](https://partners.gamepix.com/developers)、[itch.io HTML5](https://itch.io/docs/creators/html5)

## 仍需进一步核实

UC/夸克存在官方小游戏服务协议，但服务协议不证明开发者当前可自助接入、运行时或商业化准入；美团、京东、小红书等本轮未取得足够官方接入证据，不将第三方聚合SDK支持名单当作平台当前开放承诺。[夸克官方服务协议](https://terms.alicdn.com/legal-agreement/terms/suit_bu1_uc/suit_bu1_uc202105261553_54923.html)

本轮未确认任何平台的收益预测、保证流量、获客成本、分成比例或审核保证周期。正式动工前最有价值的核实是：拿一款实际可玩的游戏，按选定主体申请平台账号，获得对应AppID和材料清单，完成真机预览，再决定批量接入。

## 当前仓库的工程可行性

以下为本次读取当前源码并运行检查后的工程判断，不是平台审核结论。仓库有24款已注册游戏：`games/local` 20款、`games/submodules` 4款；其中4款采用 Game Host，另外20款通过 Web Shell 的独立H5清单承载。pnpm workspace 已覆盖两类目录，单独发行不需要先拆成24个仓库。

已经具备的基础：

- `packages/game-contract/src/ports.ts` 定义内容、存档、奖励广告、遥测与导航契约；`GameDefinition` 支持带类型的挂载目标，默认Web目标，也能传入原生Canvas目标。
- `packages/canvas-game-adapter/src/index.ts` 已定义触摸、取消、图片、音频等绘制目标能力。
- `apps/shell-bilibili/src/host.ts`、`shell.ts`、`media.ts`、`ads.ts` 已实现 `bl` 对接、存档命名空间、前后台暂停、媒体和激励视频完成判定；只在SDK明确完整观看时授奖。
- 三分钟修仙、打工人摸鱼记、秋声斗蟋、电子斗蛐蛐均已有原生Canvas入口，并非所有游戏都只有网页版本。

本轮实际验证：

```sh
pnpm --filter @coffeeeeffoc/shell-bilibili build
pnpm --filter @coffeeeeffoc/shell-bilibili smoke
```

两项通过。构建输出42个文件，未压缩总计约2.51MiB；smoke执行实际CommonJS制品，验证四款在无DOM环境下启动，以及已有操作、媒体和生命周期断言。该体积不是平台工具最终上传统计，也不是所有H5游戏的体积。尚未执行官方开发工具导入、平台真机、真实广告库存或上线审核。

明确需要补的部分：

1. **单款发行入口。** `apps/shell-bilibili/src/native.ts` 当前先展示四款目录；`vite.native.config.ts` 固定输出四款分包及其素材。应增加按选定游戏构建的独立启动入口，仅包含该款代码及使用到的资源，每款分别配置AppID、名称、广告位和版本。单款独立制品不能简单复制当前四款大厅四次。
2. **B站上线配置与必接能力。** 当前生成的 `game.json` 只有方向及分包，未生成官方配置表列为必填的 `version`、`appId`；需在发行配置中补齐。源码未声明或调用 `bl.launchSuccess`，也未实现侧边栏复访、桌面快捷方式每日奖励和对应启动参数处理。普通日志及暂停/恢复不能代替这些审核流程。[配置要求](https://miniapp.bilibili.com/small-game-doc/framework/config)、[启动上报](https://miniapp.bilibili.com/small-game-doc/api/base/launchSuccess)、[侧边栏](https://miniapp.bilibili.com/small-game-doc/open/sidebar)、[桌面快捷方式](https://miniapp.bilibili.com/small-game-doc/open/shortcut)
3. **微信宿主。** 当前apps目录没有微信Shell；需接入微信画布、输入、音频、存档、广告和生命周期，并构建微信工程。复用已有游戏核心与Canvas入口，不把B站SDK整体替换名字后视为完成。
4. **其余H5逐款适配。** 独立H5目前保留自己的DOM、浏览器存档与音频，没有自动获得 Game Host 能力。`localStorage`、网页下载、HTML按钮、CSS动画、DOM事件、浏览器音频与资源加载均需检查；纯逻辑与关卡数据优先复用。新增宿主也不会自动让React DOM界面可在小游戏中运行。
5. **平台发布边界。** 保留Web自己的发行方式；小游戏制品采用平台允许的审核代码及分包，网络只接入获准的数据/资源。不能把当前Web iframe远程JavaScript装载链直接带到原生小游戏。[仓库ADR](../adr/0002-dual-game-delivery.md)

代表性迁移成本（相对分级，不是逐款工期承诺）：

| 当前游戏/技术                                            | 微信/B站迁移成本判断 | 原因与优先顺序                                                                                                          |
| -------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 三分钟修仙、秋声斗蟋、电子斗蛐蛐、打工人摸鱼记           | 较低                 | 已有原生Canvas入口；先完成单款打包和平台宿主，仍需验证玩法、设备与审核                                                  |
| 合成守夜人、别跑！街区围捕                               | 中等                 | 有Canvas绘制，但菜单/HUD、离屏Canvas创建、触摸与音频仍使用网页能力；需迁移这些接口                                      |
| 词了个词、词屿、神机合阵、万象旅团、来电之间、雨停之前等 | 中到高               | HTML按钮、布局、弹窗或DOM动画占较大比例；通常复用规则数据、重做原生显示与交互                                           |
| 橘风速递、零域、工位偷闲                                 | 中到高               | 原生Three.js渲染有复用机会，必须验证WebGL版本、资源加载、浏览器HUD/输入/音频和性能                                      |
| 江风入境、外滩空中漫游、外滩一江入梦                     | 高                   | 使用React DOM和Three.js/Pixi等组合；React Three Fiber/drei/物理/Wasm等依赖需逐项验证，不能把React库本身有JS代码视作兼容 |
| 此时·此地                                                | 高                   | Three.js全景之外还有Leaflet及CSS/DOM地图交互；地图界面需重做或采用渠道允许的方案                                        |

这些分级针对迁移到小游戏运行时；保留浏览器的H5渠道通常能复用更多现有界面，仍需按渠道SDK、资源路径、包体和审核规则检查。其他游戏也应按同样方式评估，不能用代表样本保证全部兼容。`docs/architecture/bilibili-shell.md` 仍主要描述修仙一款，当前实际构建已是四款；以本次源码和制品检查为准。

## 建议执行顺序：企业主体、广告优先

1. 选择三分钟修仙或秋声斗蟋一款，取得微信/B站应用身份与该款资质清单，完成单款构建、真机操作、存档、广告完整观看/提前关闭/失败和前后台恢复。先取得可发行样本，再估算后续游戏的实际成本。
2. 用相同单款流程覆盖已有四款Canvas游戏。复用现有Game Host和Canvas目标；每个平台的宿主负责SDK与必接能力，游戏负责自己的渲染与玩法。不先建设覆盖所有未知渠道的通用发布系统。
3. 扩展抖音、快手；支付宝、QQ先核实后台当前准入和广告权限；快游戏联盟按统一链路单独验证，华为另行确认发行形态与资质。
4. 保留H5线，联系4399，按需要评估芒果TV及海外CrazyGames/GamePix。Poki有独占冲突，不作为默认全渠道同步发行对象。
5. 每款每渠道记录应用ID、版权/资质、审核版本、广告位、隐私及备案状态、设备检查和上线状态。公共代码可复用，发行维护仍随游戏数和渠道数增长；同一公司、同一后端不会让各平台玩家身份或广告位自动通用。

首批不做内购，也不为尚未需要的云存档、跨平台账号绑定或统一商务后台增加实现；平台必接登录、隐私、实名及其他审核能力仍须按实际要求完成。批量发行以后优先根据广告填充、有效展示、留存和维护成本决定继续覆盖哪些渠道，接入数量本身不能证明收益。
