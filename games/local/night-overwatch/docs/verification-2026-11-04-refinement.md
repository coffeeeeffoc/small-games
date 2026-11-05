# 夜航守望 · 操作细化验证

## HUD可读性跨库清理与战斗素材

2026-11-05。相对`9e5413fb176668ddd25268cfbd38b35fa924f09f`，HUD由2098行/132,294字节降至1032行/35,821字节（统一LF），主类字节减少72.9%。八个视图/绘图模块按职责拆分，变量语义、分行及坐标/裁剪/缓存注释改善，保留按钮ID、回调、节点、绘制顺序和玩法。独立只读AST核对176项通过；该核对在本轮有意修改关卡文案前完成。关卡流程及中英文结算电台统一用“关卡”，每日任务保持原意，旧服务端“单人任务”只转换显示，不修改持久化数据或事件ID。

清理同键时先提交IndexedDB墓碑，再删除旧localStorage副本并读回核对，最后CAS物理删除墓碑和内存副本。失败时保留遮蔽旧值的墓碑并重试，避免已删数据从旧格式复活或误删另一页面的新写入。已确认行动日志在回执提交后回收；防重复回执保留7天，仅清理当前服务域、非当前局/工作中且日志删除已flush的确认回执。未确认记录、非法/未来时间、身份、偏好、进度和未领资格保留。[完整边界](architecture/storage-and-view-modules.md)。

最终Creator 3.8.8 web-mobile源码摘要 `04beb35ead692b201aade34623110d989c08c994a12547874f5fe1a747c56ab6`，59,276,767字节。HUD/输入/原生边界/开发工具110项、存储与共享日志89项、真实Chrome IndexedDB12项、身份16项及Night类型检查通过。覆盖旧格式副本、空字符串、事务失败、旧页日志恢复及并发CAS；新游客录屏中的旧库日志0仅证明本轮无残留，不替代旧数据迁移测试。

[移动端浏览器证据](design/refinement-2026-11-04/hud-refactor/mobile-evidence.json)：568×320、844×390、1280×720通过首页、安全区、指南滚动、大小持久化、开火拖动/取消/双指瞄准；627帧、1421个有效敌方投影、40次经过操作区无缺失。页面异常0。已打开核对[小屏首页](design/refinement-2026-11-04/hud-refactor/home-568.png)、[指南末尾](design/refinement-2026-11-04/hud-refactor/guide-scrolled-568.png)、[开火拖动](design/refinement-2026-11-04/hud-refactor/fire-direct-drag-844.png)。原生fresh staging和共享client/gateway契约10项通过。

[装备布局7场](design/refinement-2026-11-04/hud-refactor/controls-evidence.json)覆盖三尺寸、无人机/激光/仅EMP、独立拖动、安全区四边、取消、设置返回、resize和新局重置，页面异常0、广告调用0；[小屏完整控件](design/refinement-2026-11-04/hud-refactor/controls-568.png)。首次执行暴露旧测试只模拟Tap SDK、未模拟渠道奖励桥；普通Creator预览不注入该桥。对照基线确认homing隐藏条件不变后，仅补测试fixture的奖励可用接口，保留可见性及禁止广告调用断言，7场复测通过。

本轮按审核截图重做连续首关和30秒宣传片，第一帧直接展示战斗，画布采集不包含浏览器与录屏软件UI。两支素材分别交付，保留原始采集身份、脚本、剪辑时间线及字节摘要，见[素材来源与复现](../publishing/promo/videos/review-2026-11-05-source/README.md)。录制使用隔离真实PostgreSQL/HTTP普通游客和实际输入，非开发资产或模拟结算；专属资源退出时清理。

[真实采集证据](design/refinement-2026-11-04/hud-refactor/capture-evidence.json)：六段均为上述构建、1920×1080 Canvas/WebGL及一条游戏音轨，首关55.854秒、首次开火0.737秒、6发/4击杀，服务端finished。[结算画面](design/refinement-2026-11-04/hud-refactor/settlement-1920.png)显示“下一关卡”、100积分/180金币/120经验、每日任务1/2；flush后旧库日志0、IndexedDB日志0、近期回执1。无页面异常，专属资源清理列表为空。

最终连续录屏55.8915秒/49,810,941字节，宣传片30秒/18,384,822字节；H.264 / AAC / 1920×1080 / 30fps，全片解码及覆盖每秒的六张联系表检查通过。安装版Chrome初次GPU播放正常结束但显示丢帧132/67；相同文件在`--disable-gpu`下正常速度复验1675/900帧、丢帧均0、错误均null，两次结果均保留在成片证据中。未把本机显示掉帧归为文件损坏，也未将自动静音播放当成人工听感验收。上架清单25个文件的大小与SHA均核验，历史图片/视频保留原身份。

前次CI失败的两个临时仓库fixture补齐实际依赖的storage manifest；历史meta相似度重命名证明增加精确目标路径/blob，保留基线与状态限制，不放宽未知改动门禁。共享game-services的真实消费者仍由原增量范围选择。

本轮未部署Runtime、上传TapTap或执行全仓候选检查；桌面浏览器测试不替代实体手机、TapTap真宿主、真实广告与目标设备人工听感验收。dev推送不自动替换TapTap线上包，CI/Pages以最终提交的独立流水线为准。

## 统一存储与视图模块整理

2026-11-05。基于已推送dev的迁移检查点 `d36cf1f370468e333fa4c4c8a638fbb095c8d5dc`，完成[模块设计](architecture/storage-and-view-modules.md)。最终真实Creator 3.8.8 web-mobile源码摘要 `6ba6bfd5db3ebb40387c8957240d7e39edf87a6efe7de25a0e8aa4acc61a8721`，59,258,397字节。下列四组真实浏览器回执均来自这个制品。

存储拆为经典启动桥、宿主装配、同步镜像/队列工厂及IndexedDB后端；业务显式共享同一实例，原生仍使用渠道/Cocos实例。新增另一个后端的契约测试，保留事务完成、墓碑、跨页权威刷新与身份CAS；无持久化降级不冒充保存成功。数据库名称、store和旧键未变。H5复制、源码hash和fresh native staging共用manifest；Turbo覆盖桥与模块目录。直接调用服务工厂时，h5、web-preview及未指定平台均不能绕回旧localStorage。

HUD的在线大厅/输入/聊天与设置/指南抽为有类型的视图；Overwatch的只读snapshot独立，旧meta UUID不变。统一LF后的主类字节分别减少26.1%和10.0%；新模块使用正常缩进。独立只读复核对六个HUD方法与snapshot作AST语义比较，主体一致；大厅增量刷新仍保留输入框、草稿和滚动位置。Cache Storage本轮不启用，现有MD5资源URL/HTTP缓存不等于离线包，依据与后续触发条件见架构说明。

| 范围 | 最终结果 |
| --- | --- |
| 存储、共享服务、身份、入口、打包、Night在线/军需/原生及快照消费者 | 串行定向180/180通过，含真实Chromium IndexedDB9项、替代backend/无持久化/初始化失败3项、fresh native staging7项。staged自己的artifact模块独立算hash，并逐项修改manifest文件验证摘要变化；未以canonical模块的hash掩盖漏拷贝。 |
| HUD与输入 | 原105/105通过；新增统一H5/原生入口1项通过。最终类型检查通过。 |
| 消费者、边界与CI回归 | 历史Night runtime scope6/6、storage/Turbo/执行选择2/2、包边界25/25通过，实际仓库依赖及环检查通过。修复历史service-only fixture依赖当前Turbo的漂移，固定原2+5输入；storage追加另有有限正反例，未知输入仍拒绝。新增4条manifest构建/测试边，补齐检查点遗漏的2条浏览器fixture边，未增加生产服务依赖。 |
| Creator启动 | [7场回执](design/refinement-2026-11-04/refactor/startup-evidence.json)：普通/开发模式、无IDB训练、桥/runtime/store/driver404。全程原生localStorage写0、页面异常0；缺组件及无IDB时远程请求0，依赖404显示[重新连接](design/refinement-2026-11-04/refactor/missing-store.png)。 |
| 普通首关及存储故障 | [真实PostgreSQL/HTTP回执](design/refinement-2026-11-04/refactor/settlement-evidence.json)：首次quota/abort均0开局请求；战中335次journal abort、158次receipt quota与finish响应丢失。6发完成，恢复后[正式到账100积分/180金币/120 EXP](design/refinement-2026-11-04/refactor/settlement-844.png)，单人任务只计一次，重载及重复恢复不重复奖励。旧库写0、页面异常0、专属服务与数据清理成功。 |
| 三尺寸交互 | [568/844/1280回执](design/refinement-2026-11-04/refactor/layout-evidence.json)：设置开合、导航、按钮大小及重载、暂停拖动/取消、多指操作、指南滚动与三页签均通过。[844设置](design/refinement-2026-11-04/refactor/settings-844.png)、[568指南末尾](design/refinement-2026-11-04/refactor/guide-scrolled-568.png)已实际打开核对。588帧标记检查无缺失。 |
| 真实聊天与观战 | [8项回执](design/refinement-2026-11-04/refactor/chat-evidence.json)：两个真实游客发消息，新消息到来时中文输入元素仍连接且[草稿保留](design/refinement-2026-11-04/refactor/chat-ime.png)；120字长消息[小屏滚动](design/refinement-2026-11-04/refactor/chat-scroll-568.png)、邀请/加入、屏蔽恢复、离开停止轮询及第三人观战通过；独占数据清理成功。 |

执行入口：`node --test --test-concurrency=1` 运行共享game-services/identity/game-bootstrap/night-storage两套、h5-game-services、native-project、Night artifact/startup/online/quartermaster/native-build/native-host-boundary/developer-tools；HUD与input-mode单独串行。大型范围工具测试仅按新增用例名称运行，未重复无关历史全文件递归。`node --test scripts/night-runtime-scope.test.mjs`、`node --test scripts/check-workspace-dependencies.test.mjs`及`node scripts/check-workspace-dependencies.mjs`通过。真实制品固定`NIGHT_EXPECTED_SOURCE_HASH`，依次运行`indexeddb-browser.mjs`、`settlement-live-browser.mjs`（两个存储故障开关均为1）、`mobile-layout-browser.mjs`和`chat-live-browser.mjs`。最终构建命令为`node games/local/night-overwatch/scripts/build.mjs web-mobile`，类型命令为`node games/local/night-overwatch/scripts/typecheck.mjs`。

主会话已打开844结算画面核对55.77秒、三项收益和到账状态；实现者核对设置、指南及聊天截图。仅归档6张代表QA图和4份回执，其余中间截图留ignored reports；八类23项上架资料沿用原核验身份，本轮无视觉规则更改，不重录宣传素材。代码交由主会话完成最终提交推送；未打新渠道ZIP、上传TapTap或部署生产。浏览器与原生配置验证不能代替K90实体机、真实TapTap宿主及广告验收。

## H5 IndexedDB存储迁移

2026-11-05迁移检查点历史记录（已随 `d36cf1f3` 推送dev）。用户提供的新详情为真实 `window.localStorage.setItem` 抛 `QuotaExceededError`，写入行动日志时超出旧存储配额。本轮按用户要求将夜航守望普通H5及TapTap H5迁到IndexedDB；原生小游戏继续使用渠道存储。真实Creator 3.8.8最终web-mobile源码摘要 `54733b744cee33fdd1733504aee89b1687c556331436d88f9df99d58660a0f4e`，59,251,115字节。以下两套真实制品验收均来自该历史摘要，未复用早期失败批次作为通过证据。

- 页面在开发模式、身份服务和Creator引擎之前安装新存储适配器，初始化完成才启动消费者；Cocos自己的存储探测也写新库。真实localStorage仅保留读取引用，未调用其setItem/removeItem/clear。设置、训练记录、军需编号、游客/Tap身份、行动日志和确认回执由同一入口写入IndexedDB，未清空旧库或新建云存档。
- 新库优先，旧值按需兼容读取；删除写入墓碑，重载不复活旧数据。关键操作等待事务complete，put请求成功后事务abort仍判失败；首次开局、开局已尝试标记、军需编号没有提交前不发送正式请求。身份使用原子比较更新，跨页读取权威新值，不依赖BroadcastChannel通知；旧页迟到响应不能覆盖新账号。
- 运行中日志存储失效时保留已有可恢复记录及完整内存记录，允许既有身份联网获取权威结算；失败日志不会阻断无关的身份读/令牌刷新。确认回执提交失败时不提前删除恢复输入，重复请求仍由既有幂等协议保护。没有修改后端规则、数据库或结算协议。
- IndexedDB不可用时旧偏好可读、本地训练仍可玩，正式保存明确报告存储失败，不降级写旧库。若存储组件文件本身缺失，则入口显示重新连接并在启动引擎/身份服务前停止，避免重新落回真实localStorage。IndexedDB仍有宿主配额及清理机制，不承诺无限容量或永久保存。

验证结果：

| 范围 | 实际结果 |
| --- | --- |
| 共享服务、身份、打包及启动 | 115/115；其中9项使用真实Chromium IndexedDB，覆盖旧库填满且全部写方法拒绝、旧未结算日志恢复、墓碑/重载、事务abort、回执故障、无跨页通知下的旧页及账号竞争、身份提交失败、战中日志故障后的身份刷新。 |
| Night在线、输入、军需与原生契约 | 101/101；包括保存屏障期间双击/切账号不扣款、取消开局后迟到失败不覆盖新状态。类型检查通过。原生为源码/配置契约，未重新生成各原生渠道包。 |
| 共享client真实消费者 | Tap登录/服务、Carrom、Flick及经典H5/原生身份消费者30项；抖音Vitest登录2项；摆消乐session/artifact8项通过。Flick和摆消乐两个受管client副本逐字同步唯一源，游戏逻辑及存储策略不变。 |
| 准确消费者与执行接线 | 新IDB/Turbo输入正反例、共享服务/身份范围与执行定向7/7通过；显式Chromium路径分别通过存储和身份两个真实用例。曾启动两份范围工具测试的全文件运行，因无关历史Git路径递归探测耗时而按增量范围终止，未计入通过数量；相关子进程和临时目录已确认无残留。 |
| 最终Creator入口 | [4场景回执](design/refinement-2026-11-04/indexeddb/startup-evidence.json)：dev=0保存偏好并重载，新库覆盖旧值；dev=1正确启用；无IDB仍进入[训练](design/refinement-2026-11-04/indexeddb/unsupported.png)；组件404显示[重新连接](design/refinement-2026-11-04/indexeddb/missing-script.png)，0服务请求。四场均原生localStorage写入0、页面异常0。 |
| 真实PostgreSQL/HTTP普通首关 | [完整回执](design/refinement-2026-11-04/indexeddb/settlement-evidence.json)：初始quota与事务abort均0开局请求，可滚动/关闭/重试；战中journal事务abort343次、receipt quota162次，同时丢失finish响应。恢复后[正式结算](design/refinement-2026-11-04/indexeddb/settlement-844.png)100积分/180金币/120 EXP，单人任务0/2→1/2、完成任务0/3→1/3。重复online恢复及重载均不重复奖励或任务，原生localStorage写入0，页面异常0，专属服务与数据清理成功。 |

已实际打开无IDB训练、缺组件重试及[568保存失败详情](design/refinement-2026-11-04/indexeddb/storage-quota-568.png)核对；主会话实际检查844正式结算画面。截图为故障注入QA，未替换上架素材。八类23项已有素材沿用本轮只读存在性、尺寸/哈希核验结果与原采集身份；无视觉逻辑改动，无需重录。

执行入口：`node --test` 定向运行共享game-services/identity/game-bootstrap/night-storage浏览器、h5-game-services、Night startup/artifact；Night online/input-mode/quartermaster/native-build/native-host-boundary使用`--test-concurrency=1`。真实制品分别执行`tests/indexeddb-browser.mjs`、`tests/settlement-live-browser.mjs`，后者开启`NIGHT_START_STORAGE_DIAGNOSTICS=1`及`NIGHT_STORAGE_FAULTS=1`，并固定`NIGHT_EXPECTED_SOURCE_HASH`。构建使用`node games/local/night-overwatch/scripts/build.mjs web-mobile`，类型使用其` scripts/typecheck.mjs`；共享改动格式检查通过。

新增模块已纳入源码摘要和Turbo的Night构建输入；新模块/真实IDB测试路径仅映射Night消费者，并登记到已选择Night的浏览器校验流程，复用已准备的Chromium路径。普通新H5存储默认规则同步到通用规范，不代表全仓已迁移。迁移检查点已提交并推送dev，未制作/上传新TapTap ZIP或部署生产服务；实体K90、TapTap实际宿主及真实广告仍待后续验收。

2026-11-04 早期阶段记录。先核对旧线上截图和当前代码，再生成[效果图](design/refinement-2026-11-04/README.md)，随后实现和检查实际画面。当时 Creator 3.8.8 web-mobile 源码摘要：`c3f32a92a83b06f6421f1f95a4f747e8b8cec02f0270f116dc4aadc7e16fd74a`，包体 59,211,819 字节。当时尚未提交、推送、部署或上传渠道包；后续结果见下方“最终按钮布局与交付”和“TapTap H5提审回执”。

## 七项结果

| 要求 | 实现与证据 |
| --- | --- |
| 战况与装配 | 入口“战况”，概况/装配共用同一框体、固定关闭按钮；页签切换不重播弹窗开场。点击关闭、Esc 清理两个状态，单人及对战已操作检查。 |
| 作战配置 | 开始行动页左下入口统一命名，点击路径保留。 |
| 昵称 | 旧版截图不能证明新版已修；本轮为对战/观战统一单行身份区，按实际字体宽度省略，完整名称可在战况查看。长中文和连续 W/M 已检查，小屏不换行、不裁半字、不缩成极小字号。 |
| 横向选关 | 120 关保持 ID 和进度，一行左右滑动；触屏拖动、取消不误选，鼠标横向滚轮及纵向滚轮回退有效，其他列表方向不变。 |
| EXP | 任务、奖励和等级成长等主要玩家文案统一 EXP，成长进度显示 EXP 当前值/所需值；API 字段仍为 xp。 |
| 冷却 | 武器边框和开火圆环使用同一实际剩余时间/当次总冷却，数字向上取到 0.1 秒；快切同步。技能区分生效与冷却，空弹、过热有独立状态；移除旁边装填计时，保留热量/弹着。 |
| 持续激光 | 最长 3 秒，80 伤害/秒、总预算 240，重甲系数 0.85；8 秒冷却、6 发。固定目标，死亡/遮挡/越界/保护区时结束，不自动换敌人。三个尺寸均实际验证一发击毁训练重甲。 |

## 验证范围

- 实现阶段定向规则/回放/对战/表现/输入/HUD/安全区 **156/156**；最后冷却颜色和数字调整后 HUD、激光及原生宿主 **52/52**；原生源码适配 **7/7**，Runtime Night 规则消费者 **3/3**。这些结果有交集，不相加为独立用例数。
- 浏览器发现桌面横轴滚轮方向错误：Cocos Web 输入保留 deltaX 正号、反转 deltaY。只修正对应输入分支后，输入测试 **42/42** 和类型检查通过，真实 Creator 重建为上面的最终摘要。未因一行输入修正重复无关核心测试。
- 新专项在 **568×320、844×390、1280×720** 通过，42 张截图、页面异常 0：[QA 回执](design/refinement-2026-11-04/runtime/evidence.json)。包含横向滚动/取消、同一弹窗关闭几何、Esc、EXP、激光实际发射和击毁、冷却中切枪、技能生效、长昵称和完整名称；QA 使用有效资产 fixture，未混入正式媒体。
- 普通离线首关三尺寸通过，37 张截图、页面异常 0，重新检查偏好重载、三视图、暂停状态、触摸取消和战况页签，并录制连续战斗：[普通首关回执](design/refinement-2026-11-04/runtime/ordinary-evidence.json)。未用资产 fixture 或开发余额。
- 普通新游客菜单来自隔离真实 PostgreSQL/HTTP，页面异常 0；只读菜单导航，不改已有玩家，专属服务与资源已清理：[菜单采集回执](design/refinement-2026-11-04/runtime/publication-evidence.json)。
- 独立只读复核覆盖 HUD/输入/安全区及持续激光，修正持续阶段保护区不一致、宽拉丁字母误估后，无遗留 P1/P2。浏览器等待先确认弹窗退出，再等待绘制完成，稳定对战截图另等待模拟实际推进，未将进入战区过渡帧用作最终画面。

## 实际画面对照

| 状态 | 当前截图 |
| --- | --- |
| 持续激光与一致倒计时 | [844×390](design/refinement-2026-11-04/runtime/laser-cooldown-844.png) |
| 单发击毁重甲、技能生效 | [844×390](design/refinement-2026-11-04/runtime/laser-target-destroyed-844.png) |
| 小屏长昵称 | [568×320](design/refinement-2026-11-04/runtime/duel-names-568.png) |
| 共用弹窗 | [概况](design/refinement-2026-11-04/runtime/report-overview-568.png) · [装配](design/refinement-2026-11-04/runtime/report-loadout-568.png) |
| 横向选关 | [滑动后](design/refinement-2026-11-04/runtime/missions-drag-844.png) |
| EXP 与作战配置 | [等级成长](design/refinement-2026-11-04/runtime/growth-exp-568.png) · [开始行动](design/refinement-2026-11-04/runtime/modes-568.png) |

实现保留现有金属面板、插画和紧凑武器分组，没有把概念图示意数值写死；技能/特殊武器随装备资格出现。已打开上述实际截图，核对文字、冷却环、激光光束、战况页签与选关方向。

## 发布与限制

Replay 升至 `night-input-replay-v13`，Duel 升至 `night-duel-v6`。前端和 Runtime 需要配套发布；本轮本地验证不表示线上包或线上服务已更新。历史榜键继续保留 `night-campaign-v2`，未删除、重置历史成绩。

当前所有关卡按兵种使用固定 HP；重甲 180 HP，一轮激光最多造成 204。因此高关重甲在完整无遮挡照射下也能被击毁，本次没有新增关卡 HP/防御成长。实际完整照射重甲约 2.65 秒，炮台约 1.125 秒；移动、遮挡或射程会影响结果。

宿主安全区合并状态栏、safeArea 和胶囊底边，只移 HUD、不缩战场；普通浏览器不额外留白。非零宿主安全区和观战路径有定向用例，实体手机、TapTap 真宿主与实际观战浏览器未重新验收。没有全仓回归、渠道构建、真实广告、平台上传或生产部署。

用户原有 `game-build.local.mjs`（production）和 `reports/web-mobile-size.json` 改动保留，构建后按备份恢复尺寸报告；最终 SHA-256 分别仍为 `7e9977bc20453cf1e3e4beb3ab67ef553184ddb79a71d21bc20dc5d1e9513805`、`c20e87072f5ccb726d62bd455a710a8859feb5376afb3dae243a420606aac724`。


## 试玩反馈修订

以下为首次修订的过程记录；按钮默认位置、拖动范围与临时布局以文末“最终按钮布局与交付”覆盖。

2026-11-04。技能与特殊武器按“无人机集群 → 电磁干扰 → 激光”横向排列，拖动任一可见按钮移动整组并保存位置；点按照常使用，取消手势回到原位。弹着时间与热量靠近开火键。每次重新打开默认夜景，当前会话仍可切换增强/热像。无人机一次释放3架，分别攻击合法目标，12秒后停止攻击并自动坠毁；电磁干扰名称固定、生效12秒，结束后冷却45秒。

- 无人机每架保留6伤害/0.5秒，伤害预算144，整群理论上限432；实际受飞行时间、目标和地形阻挡影响。弹药3、武器冷却20秒保持。到期只下坠及落地爆闪，不追加范围伤害。最高高度无合法目标时也在下一次发射前清除。
- 无人机优先分配不同目标，目标不足时保持不同悬停位置。敌我、保护区、暂停和对战归属规则保留。电磁干扰仍限制地面移动，不禁止敌方攻击；12秒结束后免疫8秒，技能冷却45秒。
- 拖动使用8px阈值，冷却中仍可移动；取消/失焦/暂停/尺寸变化回滚未完成拖动，正常松手保存规范化位置。位置约束避开顶栏、小地图、底部操作和战斗提示。未装备按钮隐藏，不改变作战配置槽位规则。
- 启动不再恢复旧成像偏好；同一次打开内切换、换局仍保留选择，其他声音/标注偏好和游戏资产不变。

真实 Creator 3.8.8 web-mobile 源码摘要：`acd6cb99abb176602c8c4dd3d3d1f013b7cc06a06aeb594a387d79c4ee7e363c`，包体59,215,531字节。规则升级至v14/v7；Runtime入口直接导入同一规则源码。只读复核发现并修正了技能栏/提示遮挡，以及高空无人机到期下降太慢阻止再次发射的问题。

验证：

- 规则、回放、对战、表现与火区49项通过；高空坠毁修复后progression的26项复测通过，包含新增边界。两次结果有重叠，不相加。
- 最终HUD、输入与原生宿主边界91项通过；类型检查通过。原生源码stage 7项、Night/Kuaishou配置消费者2项通过；Runtime Night权威入口3项通过。原生配置测试不表示原生实包或设备通过。
- 布局6个场景、24张图通过：568×320、844×390、1280×720分别检查无人机/激光配装，鼠标/触摸拖动、取消、冷却拖动、重载、缩放和夜景。见[布局回执](design/refinement-2026-11-04/support/layout-evidence.json)。
- 无人机/电磁2个场景、8张图通过：844×390触摸、1280×720鼠标，第3关开发练习和QA装备，实际输入发射3架、持续攻击、12秒后下坠清除、干扰超过10秒仍有效。见[技能回执](design/refinement-2026-11-04/support/drones-evidence.json)。这些QA图不是正式上架素材。
- 普通离线首关三尺寸37张图、三视图、设置持久化、暂停状态、战况/装配导航及触摸取消通过；全部浏览器专项页面异常0。见[普通首关回执](design/refinement-2026-11-04/support/ordinary-evidence.json)。

实际画面已打开核对：

- [568小屏默认横栏](design/refinement-2026-11-04/support/drone-default-568.png)、[844激光/电磁](design/refinement-2026-11-04/support/laser-default-844.png)、[拖动后](design/refinement-2026-11-04/support/drone-moved-844.png)、[桌面冷却中拖动](design/refinement-2026-11-04/support/drone-active-moved-1280.png)。
- [三架持续攻击](design/refinement-2026-11-04/support/formation-attacking-844.png)、[超过10秒仍干扰](design/refinement-2026-11-04/support/emp-after-ten-seconds-844.png)、[到期坠毁](design/refinement-2026-11-04/support/drones-falling-844.png)、[落地清除](design/refinement-2026-11-04/support/drones-landed-844.png)。

本次为用户指定局部布局与现有装备行为修订，沿用前述美术，不新增整套效果图。上架截图中6张战斗图和连续实录重采自普通离线首关；4张未受影响菜单图保留原始采集身份。新增20秒静音UI预览，原有燃向/战术宣传片及其在途文件保留，内容身份不改写。实际视频规格/播放见[媒体回执](design/refinement-2026-11-04/support/video-evidence.json)。

未提交、推送、部署Runtime或上传渠道；未做实体手机、真宿主、真实广告和后期真人平衡验收。无人机整群最大预算由72提高到432属于明确平衡变化，需在后续真人试玩观察；当前代码的在线回放/对战需配套Runtime v14/v7，旧生产服务不自动更新。

## 渠道构建与提交整理

2026-11-04 用户补充要求 `pnpm build:games` 必须通过。原日志是 Creator Terser 子进程 `spawn UNKNOWN`；保持原命令、相同正式包配置连续重跑两次均退出0，未复现，也未凭推测修改共享启动器或放宽失败检查。根配置的 production 改动一并保留提交；正式包关闭开发入口，连接生产 API 并启用现有 TapTap 身份/广告。两批产物、ZIP摘要及未提交采集身份见[构建回执](design/refinement-2026-11-04/support/build-evidence.json)。Creator源码摘要与前述浏览器验证一致；渠道参数下尺寸报告为59,215,574字节。

构建配置14项通过。Runtime完整套件233项通过、68项按环境条件跳过；首次默认并发时元数据首例冷加载超过5秒，单文件8项及完整复跑均通过，未改断言或超时。本轮未运行完整本地候选校验，CI和生产部署另行留证。

按用户授权提交必要的功能、规则、测试、媒体、剪辑源码与捕获输入；三个reports宣传片工作目录和一次性.tmp脚本仅本地忽略。旧尺寸报告更新为实际最终构建值；不把缓存、原始中间音轨或临时脚本纳入Git。

## 最终按钮布局与交付

当前源码摘要：`91760bb8b77735e857ea1193dc2f943dbf66b37d5e289735bf5494fb855cce5e`，真实Creator 3.8.8 web-mobile 59,217,776字节。`pnpm build:games`正常生成production/广告开启/生产API/TapTap身份包；[构建证据](design/refinement-2026-11-04/controls/build-evidence.json)保留采集身份。最终交付ZIP与提交身份在提审回执中补记。

- 所有普通武器、追踪、无人机、激光、电磁干扰各自可拖动，默认底部同线且可见支援紧接常规按钮；热区至少44px高。没有整组拖动或中央区域限制。
- 拖动仅修改本局内存，完全不读写旧布局存储；新局、重开、联机新局恢复默认，同局暂停/设置/旋转保留。拖动不切枪、不触发技能；取消恢复当前按钮。固定交互入口附近做小范围避让，缩屏及触摸模式切换后仍可再次拖动。
- HUD/输入93项、类型检查、原生源码适配7项通过。最终正式ZIP解压后，以受控装备及SDK可用性fixture验证三尺寸7场景、35张图；包含追踪按钮、单电磁、无人机/激光、默认对齐、四边、独立拖动、设置返回、新局和重载默认。广告show调用0，页面异常0，见[回执](design/refinement-2026-11-04/controls/evidence.json)。实际已打开默认手机、568小屏、桌面边缘截图核对。
- 普通首关既有截图/录屏及宣传片保留原采集源码身份；本轮仅改按钮临时布局，媒体未冒称重新录制。简介/开发者说明更新，23项文件摘要复核。

服务器Runtime已实际部署`be1c600e80699ee5d6b4e47fc1501c14f4f4b2a7`，发布号`be1c600e8069-1793733684321-a1b7a1`。服务器直接读取确认为回放v14/对战v7、无人机3架与12秒、电磁12秒；公网health为200，新旧API前缀及资产未认证请求为401。已备份，数据库未替换、schema未改，Kart沿用原镜像重建网络依赖；本次没有隔离恢复验证。见[部署回执](design/refinement-2026-11-04/controls/runtime-deployment.json)及[规则/公网核对](design/refinement-2026-11-04/controls/runtime-verification.json)。后续按钮调整不改权威core或Runtime源码，不重复部署。

CI/Pages上一次因15分钟job总预算耗尽取消，未到游戏构建；基础job改30分钟且只绑定准确字节，范围/检出/阶段7项定向检查通过。最终流水线与平台提审另行记录，不以本地通过代替CI或真机。

## TapTap H5提审回执

源码提交`703a8fa8cc96edb09e34458569fab60608686183`的干净工作区通过`pnpm build:games`重新打包。复用已经真实Creator编译、源摘要校验及正式ZIP七场景验证的制品；最终ZIP与被验证ZIP逐字节相同，SHA-256为`447d7ec600e585f070e666cbfb63bcf617e281bdb813763f6cea2ab7e91212ea`，53,024,352字节，production、devMode=false、生产API及TapTap身份。

应用987511（tapmcjgwi2thafs87k）经用户确认；实时查询广告已生效，横屏2，广告位1054323。通过MCP只上传一次；原待审包428434更新为428665，版本名仍为`V-20261103-1`，状态1审核中。首个工具回执提示方向缓存未同步，强制刷新后待审表单明确为横屏2，未重复上传。[结构化回执](../publishing/taptap-h5-review-2026-11-04.json)保留准确提交、包体、应用和状态。原线上版本/包保持V-20261103/423016；未宣称审核通过或已上线。

实体手机、TapTap真实广告播放和完整真人关卡平衡未由本轮自动检查验收；CI/Pages须独立看最终提交的流水线。

## 手机布局与正式结算修复

2026-11-05。对应用户K90/TapTap H5截图、开火拖动与大小、设置导航、缩放红标，以及单人积分/奖励/任务进度反馈。Creator 3.8.8 web-mobile最终源码摘要为 `a431dc5f0ee09126e72d8fe9e25d39121a6be6792f6ff6f59882decf0d2e7c8d`，59,228,331字节；权威规则仍为v14/v7。

已确认的代码问题：胶囊底边扩大整个顶部安全区；首页主操作随顶部下移，底卡却固定全屏比例。完整胶囊现在仅局部避让，物理安全区仍保留，H5同尺寸resize/visualViewport恢复会刷新。红标此前复用按钮触控禁区而在部分缩放投影处消失，现在按有效投影及实际屏幕/小地图边界绘制，输入拦截不变。

正式开局未拿到权威配装时，旧代码会无提示失效为local后继续游戏，结算填入+0与无资产提示；排行榜查询成功不能证明该次登记成功。现在保留版本/身份/存储/网络/校验原因并留在可重试入口。结算响应丢失后，durable恢复回执以前未传回结果页；现在按当前局、当前身份接收服务器回执并刷新资产及任务，不在客户端加分或计数。积分栏始终保留，确认的0分照常显示，待确认与训练/离线有明确区别。生产只读核对时规则为v14/v7、策略enabled、正常结算存在；近期部分创建请求为409但日志不含具体业务码，不能据此认定用户那一局的准确原因。本轮不改Runtime、奖励规则或数据库，未重复部署、未补发未知历史资产。

验证与边界：

- safe-area、input-mode、HUD、Online及共享game-services的193项定向测试通过；bootstrap/native消费者9项通过。Night类型、Prettier及diff检查通过。最终小屏倍率页修复已纳入HUD高安全区回归，原生HUD/Platform摘要精确更新，无门禁放宽。
- [手机浏览器证据](design/refinement-2026-11-04/mobile/evidence.json)：568×320、844×390、1280×720；CSS顶部52/底部12及同尺寸刷新、Tap胶囊局部避让、设置导航、80–150%大小与重载持久化、开火暂停拖动/取消/左边缘/胶囊避让、恢复战斗与触摸取消通过。0.65×–10×连续缩放逐帧核对719帧、1597个有效敌人投影，其中32次经过武器热区，无缺失红标、页面异常0。脚本为 `tests/mobile-layout-browser.mjs`，仅归档代表截图，其他过程图在忽略的reports目录。
- [真实结算证据](design/refinement-2026-11-04/mobile/settlement-evidence.json)：隔离真实PostgreSQL17.6/HTTP、普通游客首关，实际鼠标瞄准与6发耗弹；先阻断开局请求，验证停留重试，再真实完成55.72秒首关。服务器处理finish后丢弃响应并阻断恢复读取，界面显示待确认；恢复网络后显示100积分、180金币、120 EXP，每日单人任务0/2→1/2。重复恢复、重新进入任务页未重复增加奖励或进度；三尺寸结算图已打开检查，页面异常0，专属容器/卷/网络已清理。脚本为 `tests/settlement-live-browser.mjs`，没有开发资产、假余额或写入模拟结果。
- Docker Desktop从实际安装位置 `H:/setup/Docker/Docker Desktop.exe` 隐藏启动并等待就绪；最初一次PG启动30秒等待失败，清理成功，预热后真实服务可用。测试开发时修正了网络拦截模式及等待finish实际提交的时序，未放宽产品断言。
- [首页](design/refinement-2026-11-04/mobile/home-568.png)、[设置](design/refinement-2026-11-04/mobile/settings-844.png)、[开火移动](design/refinement-2026-11-04/mobile/fire-left-844.png)、[正式结算](design/refinement-2026-11-04/mobile/settlement-1280.png)、[小屏结算](design/refinement-2026-11-04/mobile/settlement-568.png)、[任务更新](design/refinement-2026-11-04/mobile/tasks-updated.png)已实际打开，与用户反馈逐项对照。受影响首页、设置和结算上架图重采，其余八类现有23个素材逐项size/SHA复核后按原身份复用。

独立只读复核后，浏览器脚本补充开火键实际移动到左侧的断言，并复用 `cleanupOwnedSteps` 确保关闭浏览器或服务失败时仍清理专属数据库。两项脚本补跑通过：[布局复跑](design/refinement-2026-11-04/mobile/rerun-evidence.json)590帧、1318个投影、30次经过热区，无缺失；[结算复跑](design/refinement-2026-11-04/mobile/settlement-rerun-evidence.json)仍为100积分、180金币、120 EXP，单人任务0/2→1/2、完成任务0/3→1/3，重复恢复不重复计数，清理失败列表为空。正式截图保留前一次同源码构建的真实采集身份，未改写为复跑画面。

未做K90/Magic7 Pro实体手机、TapTap真宿主、真实广告验收；浏览器几何模拟不能确定用户设备的实际CSS/SDK参数。本轮不上传TapTap包；该线上入口需后续换包才会获得客户端修复。提交、dev推送及CI/Pages状态以交付回执为准，不把本地测试当成线上发布结果。

## K90存储与直接拖动后续修复

2026-11-05。用户确认Magic7 Pro已正常，K90重新打开的第一局仍提示“行动记录无法保存”。本轮Creator 3.8.8真实web-mobile源码摘要 `2e058f55dd557c293128542a2326ff51638411f6cd6c5c008acd67a665e87776`，59,232,203字节。用户原有尺寸报告59,228,374字节的未提交修改已逐字节恢复；本轮实际构建尺寸以此处及构建日志为准。

- 复现并修正三个客户端缺陷：缺失键返回空串被误认为删除失败；服务端确认后回执标记写入失败会丢弃显示结果；已确认输入一直留存使单局日志增长。新增故障用例在旧代码先失败，再通过。已ACK批次改为null占位，保留绝对序号；未ACK及丢响应批次不裁剪，旧日志兼容。
- 正式开局最初保存及startAttempted保存仍严格要求成功。完整当前内存记录或完整读取校验过的旧日志，运行中写入失败可以继续受身份/版本/序号约束的在线上传；读失败、损坏字段、错误身份/版本和未ACK空批次仍阻断。权威结算先交付，再尽力保存确认标记/清理，其他旧记录错误不覆盖当前已确认状态。未伪造积分、改奖励算法或补发历史资产；日志未保存时提示保持页面打开联网，不能保证关闭页面后找回未持久化输入。
- fire使用独立手势保留立即首发/按住射击与双指瞄准，移动超过8px停对应射击源并拖动，松手不追加射击；取消、暂停、pinch接管、resize回滚。设置编辑模式仍不射击。通用反馈对fire只绘制圆形。首页背景从0覆盖至safe.top+bar，内容继续避让物理安全区；这修正背景空带，不把K90实际CSS/SDK inset过量当作已经证实。

验证：201项共享日志、输入、HUD、Online定向测试通过；只读复核补强实际持续射击、drag后停火、release-only和resize之后，输入49项复测通过（与201有重叠，不相加）。9项bootstrap/native实际消费者、Night类型、managed Prettier与diff检查通过。原生HUD摘要精确同步，没有放宽门禁。

[三尺寸回执](design/refinement-2026-11-04/k90/mobile-evidence.json)覆盖568×320、844×390、1280×720：直接拖动、无补射、圆形无矩形反馈、双指瞄准、取消、暂停编辑及尺寸持久化通过；红标连续缩放720帧、1580个有效投影、32次经过武器热区无缺失，页面异常0。[小屏贴顶首页](design/refinement-2026-11-04/k90/home-568.png)、[手机首页](design/refinement-2026-11-04/k90/home-844.png)、[圆形按压](design/refinement-2026-11-04/k90/fire-pressed-844.png)、[战斗中拖动](design/refinement-2026-11-04/k90/fire-direct-drag-844.png)已打开核对。

[真实服务故障回执](design/refinement-2026-11-04/k90/settlement-evidence.json)：隔离PostgreSQL/HTTP、普通新游客及实际输入，叠加首次网络开局失败、finish丢响应、缺失键空串、正式开局后journal写失败、确认标记写失败；实际触发442次空串读取、197次journal写失败、8次标记写失败。首关55.63秒、6发，得到100积分、180金币、120 EXP，单人任务0/2→1/2、胜利任务0/1→1/1。重复恢复和重载后资产/任务不重复增长；重载后journal故障开关复位，标记写故障仍持续，因此不宣称重载后所有写入继续失败。页面异常0、专属资源清理成功。脚本为 `NIGHT_STORAGE_FAULTS=1 node games/local/night-overwatch/tests/settlement-live-browser.mjs`，必须先配置实际NIGHT_EXPECTED_SOURCE_HASH。[到账截图](design/refinement-2026-11-04/k90/settlement-844.png)、[任务截图](design/refinement-2026-11-04/k90/tasks-updated.png)已打开核对。

八类现有23项素材逐项大小/SHA复核，简介更新直接拖动操作，其余图像视频保留原始采集身份；本轮故障注入截图作为QA证据。未改Runtime或数据库，无需部署。未获取K90实际存储实现/配额及安全区参数，不能声称已经定位该设备唯一原因；未完成实体K90、TapTap真宿主或真实广告验证，未上传渠道包。

## K90开局存储诊断

2026-11-05。用户反馈K90点击“出发001”仍被“行动记录暂时无法保存”阻断，并允许本轮先显示完整错误用于自测。本轮保留首次持久化要求，仅修正H5存储来源并提供脱敏详情；没有引入内存开局、修改服务端协议或补发资产。最终Creator 3.8.8源码摘要 `bc9df2df1ad3085c61ef643e4880964e4e578f654067de60be3bb43d926dc48c`，真实web-mobile 59,238,364字节；用户原有59,232,246字节的尺寸报告逐字节保留，未纳入提交。

代码确认：Cocos初始化会对`window.localStorage`写入/删除`storage`探针，异常后将`sys.localStorage`保留为空实现；身份与排行榜使用浏览器存储，行动记录以前使用引擎存储，因此二者表现可能不同。现在仅H5的Night durable入口优先使用真实`window.localStorage`，原生继续使用传入存储。该路径已在真实Creator构建中复现，但尚不能认定就是K90现场的错误原因。

开局失败时弹出可滚动详情，正式`dev=0`模式也可见：失败步骤、来源、异常name/code/message、接口类型、length、写入字节数及读回匹配信息。浏览器storage getter失败时保留该异常和回退来源。凭据、URL、完整日志键和存档正文不输出，解析失败不引用存储原文。真实get/readback异常仍阻断，读回不匹配独立描述；关闭/Esc回选关，成功重试清旧详情。

验证：

- 输入、HUD、Online、共享日志205项，bootstrap/native消费者9项，Night类型及managed Prettier通过；新增两项共享故障测试先红后绿。最终仅将读回不匹配的默认排行榜文案改为明确的存储错误后，相关两项复测通过（与205重叠）。原生HUD摘要精确同步。
- [最终真实浏览器证据](design/refinement-2026-11-04/k90-start/evidence.json)：568×320注入首次写入`QuotaExceededError`，844×390注入无操作写入导致读回不匹配；两者生产模式均显示准确详情、凭据哨兵脱敏、停留选关，首次和关闭后重试的`POST /runs`数量都为0。568触摸滚动到最后一行；844短详情完整容纳，无需人为制造滚动。
- 同一真实服务fixture中，仅让引擎初始化探针失败一次，实际确认`sys.localStorage !== window.localStorage`；未人为替换引擎对象。随后普通新游客通过真实鼠标输入完成首关，含开局网络失败重试、服务端处理finish后丢失响应、联网恢复。最终100积分、180金币、120 EXP，单人任务0/2→1/2，重复恢复及重新进入任务页不重复增加。页面异常0，专属PostgreSQL/HTTP资源清理成功；未注入开发资产或模拟战斗结果。
- 实际打开[小屏错误详情](design/refinement-2026-11-04/k90-start/storage-quota-568.png)、[小屏最后一行](design/refinement-2026-11-04/k90-start/storage-quota-568-scrolled.png)、[读回不一致](design/refinement-2026-11-04/k90-start/storage-noop-844.png)、[正式到账](design/refinement-2026-11-04/k90-start/settlement-844.png)和[任务更新](design/refinement-2026-11-04/k90-start/tasks-updated.png)检查。初次browser测试误要求844短详情也必须溢出，改为仅568长内容要求滚动；保留实际UI和到账断言。

复验命令（先构建并固定真实源码摘要）：

```powershell
$env:NIGHT_START_STORAGE_DIAGNOSTICS='1'
$env:NIGHT_EXPECTED_SOURCE_HASH='bc9df2df1ad3085c61ef643e4880964e4e578f654067de60be3bb43d926dc48c'
node games/local/night-overwatch/tests/settlement-live-browser.mjs
```

八类23个上架资料大小/SHA逐项一致，按原采集身份复用；本轮错误画面仅归档QA。本轮未改Runtime/数据库，无需部署；未运行全仓候选验证、未上传TapTap、未完成K90实体机/真宿主测试。dev代码推送不会自动替换TapTap线上游戏包，现场仍报错时需用新包错误详情继续定位。
