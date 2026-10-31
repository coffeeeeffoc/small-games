# 夜航守望 / Night Overwatch

原创横屏空中火力支援、车队护送与双人对战。玩家操作「夜航 07」机载火控席，在起伏山谷中保护四组分散友军，并清除沿线威胁（前六关分别为 4/6/8/12/16/24 个，此后每关加 1，最终 138 个）。真实透视镜头随飞机盘旋，支持旋转观察、改变盘旋方向、高度和半径；常规火炮与选装的电磁弹从固定机身炮口发射，飞行时间取决于三维距离，弹道会被山坡截住。

## 运行

在本目录执行（Node 24；当前仓库 pnpm workspace）：

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

默认预览 `http://localhost:4318`。`pnpm build:desktop` 导出 `build/web-desktop`，`pnpm dev:desktop` 在 4319 预览；`pnpm build` 导出 `build/web-mobile` 并同步 `dist`。Web 构建使用本机已验证的 **Cocos Creator 3.8.8**，可通过 `COCOS_CREATOR` 指定其路径。没有自动安装、联网下载引擎或用网页替代 Creator 的回退。

构建调用器复用仓库 `../carding-car/scripts/toolchain.mjs`，类型检查使用该工程已安装的 TypeScript；请从完整工作区执行。工程入口、UI、渲染与音频均为 Cocos；浏览器 API 仅用于焦点、指针类型、无障碍画布说明和生命周期。

## 原生小游戏构建

复制 `release-config.example.json` 为 Git 忽略的 `release-config.local.json`，填写对应公开 AppID；也可使用 `WECHAT_APP_ID`、`BILIBILI_APP_ID`、`DOUYIN_APP_ID`。不在客户端填写 AppSecret。微信游客模式和 B站 `preview-only` 仅供配置预览；抖音实际构建需要该渠道的 `tt` AppID。

```powershell
pnpm --filter @coffeeeeffoc/night-overwatch build:wechat
# 安装卡丁车已固定并校验的官方 B站插件后，本工程复制到自身忽略目录
node games/local/carding-car/scripts/setup.mjs --bilibili
pnpm --filter @coffeeeeffoc/night-overwatch build:bilibili
pnpm --filter @coffeeeeffoc/night-overwatch build:douyin
# 可先在没有 Creator 的机器检查配置，不生成原生制品
node games/local/night-overwatch/scripts/build.mjs douyin --config-only
```

| 渠道 | Creator 构建方式 | 开发者工具目录 |
| --- | --- | --- |
| 微信 | `wechatgame` 官方扩展 | `build/wechatgame` |
| B站 | `wechatgame` + 官方 `biligame-builder` 1.0.3；保留 `bl` 引擎适配 | `build/biligame` |
| 抖音 | `bytedance-mini-game` 官方扩展，由 Creator 生成 `tt` 适配 | `build/bytedance-mini-game` |
| 快手 | 尚缺与 Creator 3.8.8 兼容且已验证的构建扩展 | 尚无已验证制品 |

原生目标使用同一任务规则、渲染、输入和音频，`resources` 在微信/抖音导出为本地素材分包；构建后校验横屏、项目 AppID、主包 4 MiB / 总包 20 MiB，并记录源码哈希。Web 保留原有本地资源加载与启动反馈。构建目标依据为官方 Creator 3.8 [抖音文档](https://github.com/cocos/cocos-docs/blob/master/versions/3.8/zh/editor/publish/publish-bytedance-mini-game.md)和[命令行文档](https://github.com/cocos/cocos-docs/blob/master/versions/3.8/zh/editor/publish/publish-in-command-line.md)。

2026-10-24 本机已执行 Creator 3.8.8 Web 构建、类型检查与浏览器验收，证据见 publishing/STATUS.md。原生渠道本轮只验证配置和源码边界，未宣称开发者工具或手机真机验收；配置生成通过不等于原生游戏运行通过。快手须取得合适的 Creator 适配并实际验证，不能直接重命名微信制品。

## 操作

鼠标移动瞄准，左键/Space 开火；1/2/3 或 Q/E/滚轮切枪；Z/X 缩放，右键临时放大；V 切换传感器；T 在下一待命点等待/继续；R 定位；M 任务；H/? 帮助；P/Esc 暂停。所有绑定与帮助来自 `assets/scripts/core/Actions.ts`。

←/→ 旋转观察；[/] 切换逆/顺时针盘旋；PageUp/PageDown 调整高度；逗号/句号调整盘旋半径。小地图保持北向固定，点击可巡视对应区域并同步准星。

手机横屏：单点战场直接移动准星，相对拖动调整瞄准；拖动松手保持最后有效位置，不跳到抬手点。右手按住右下开火，重炮逐次点按；滑出扳机、取消或失焦立即停火。点击优先目标红框或说明，同步移动视野与准星。默认跟随车队，巡视后可通过「设置 → 飞行 / 视野 → 定位」返回。

战场顶部保留无底板数值和一个齿轮。设置分为飞行/视野、画面/倍率和常用操作，各设置面板按安全区居中，主面板扩大，飞行/倍率页保留真实战场预览；任意弹层打开时隐藏齿轮。暂停设置中调整高度、半径和盘旋方向立即应用当前姿态；视角旋转、缩放、光学/热像和特效即时刷新。敌人、炮弹、车队和战斗计时仍冻结，后台等系统暂停仍优先；正常飞行快捷键维持平滑升降与转向。喇叭图标随静音切换，关闭后停止并禁播音效、电台和引擎声，偏好持久保存。返回基地先提示“将会中断本次游戏并退出”，确认才结束当前局。所有游戏全屏按钮均已移除。

触屏电脑、手机桌面网页模式和原生工具中的真实触摸也会启用双手触控。触控与鼠标之间切换会释放旧扳机和临时放大，避免上一种输入方式继续开火；浏览器生成的鼠标模拟触摸不会重复发射。

自动追踪支援生效后，底部追踪按钮沿用弹药选中的青色高亮，在按钮内显示剩余秒数，最后5秒用琥珀色提示；暂停冻结计时，到期恢复弹药数量或补给入口。镜头默认可放大至10×（旧5×存档自动提升，更高已解锁倍率保留），按键／设置中的每次放大为1.5倍；右键临时放大3倍且受已解锁上限约束，松开恢复，双指与滚轮仍可细调。

榴弹炮携带 120 发、间隔 0.65 秒；重型榴弹炮 45 发、间隔 2.4 秒，每次点按发射一发；燃烧弹 12 发、间隔 5 秒。落空也产生弹着火光与烟尘；爆破/重炮爆炸半径为 3.4/6.5 世界单位，伤害随离目标车身的距离递减，范围外不受伤。炮弹使用尖头、收束尾部和短曳光，追踪弹有尾翼；四种弹药的初速与三维距离共同决定飞行时间。燃烧弹落地生成半径8、持续25秒的火区，车辆绕行或等待，已在火区内的车辆可向外逃生；火区持续低伤害并可能误伤友军。

地图默认只保留敌我形状与血条。桌面鼠标悬浮车身或标记时显示该目标类型，移开立即隐藏；触控不显示地图类型标签。设置齿轮和声音图标直接绘制，不依赖字体字形。地表以裸土、草地和坡面砂石混色，草簇与碎石贴合坡面并各用一个静态网格批次，不改变权威碰撞高度。

救援车抵达东侧撤离区且全部威胁清除才成功；救援车被毁或任一据点整组覆灭则失败；任务显示已用时间，不设超时判负。连续行车约 240 秒。车队与三个据点各有 3 辆友军，共 12 辆；救援车生命 520、护卫 360，装甲抵御 80% 敌方地面火力。护卫每 6 秒微弱反击，玩家仍承担主要消灭任务；结算分别统计空中与地面击毁。

加载完成直接进入作战基地，配置额外武器后点击单人模式进入选关：

- **晨光护送 / 高地警戒 / 谷地支援**：白天、4/6/8 个固定炮位，默认榴弹炮。
- **第4、5关**：黄昏，12/16 个目标，逐步引入机动与分波威胁。
- **第6关起**：夜间与白天交替，热成像独立于昼夜环境。原120个任务ID和解锁进度保留。

真实攻击倒计时驱动优先目标：红框、小地图圈、点击定位与中英文电台提示。语音素材由本机系统语音合成，暂停/后台/静音会停止。

选关页另有 **火控热身**，无需等四分钟车队：固定静止炮台、巡逻轻车与重甲三个目标，使用相同机身炮口、弹道、装填、热量和弹药，清完即可结算。没有地面敌袭或友军代打；玩家友伤仍实际扣血、影响评价，击毁任一友军立即中断热身。小屏开局会把三个目标保持在救援车附近，HUD 显示清靶与友伤，并提示切炮/提前量。

热身结果显示用时、命中发数/发射数、友方损伤，以及根据本轮表现提出的下一步目标。只有零友伤成功成绩保存在独立 `night-overwatch-training-v1`，优先比较用时、同用时再比较耗弹；不写护送任务的偏好或旧教学记录。可立即再练一轮，也可返回原先选择的护送任务等待开跑。实际规则回放可用有限弹药清完三个目标，仍需 Creator 与实体设备验证画面和操作感受。

Web/H5 公开入口支持 `?mission=corridor-01` / `ambush-02` / `patrol-03` / `training-60`，仅选择任务并等待玩家明确开始，不覆盖原任务偏好；未知、重复参数回落本机原选择。通过这些入口切换任务会更新干净的公开地址，便于分享当前玩法。原生渠道可在游戏选关页选择热身；本轮未验证原生渠道带任务参数的启动入口。

任务使用山谷/高地两种地图与相同友军生命和保护区规则；常规弹药按本关目标数逐步补足。再次出动保留所选任务并重置波次、弹药和扳机；正在进行的任务不能被切换。任务选择使用新的独立偏好键，旧声音、特效和教学存档继续生效。两种新增组合已通过真实规则的完整通关回放，有限弹药和零友伤检查通过；这些规则回放不代表 Creator 渲染或真机体验验收。

青绿方框识别友方，红色菱形识别敌方，额外红框与倒计时表示优先威胁；形状与文字同时表达敌我。地面装甲不抵消玩家炮弹的友伤，范围圈和红色警报提醒风险，爆炸范围触及保护区则禁止开火。等待车队不暂停战场与倒计时。结算可点击再次出动或按 Enter 快速重试。

## 修改与验证

### 金币、商店与出击配置

单人金币随关卡递增：第 n 关首通 300+10×(n−1)，复通 80+4×(n−1)；选关展示首通金额。右侧签到日历每日领取60金币。商店六列分别提供榴弹威力/速度、重炮威力/速度、燃烧弹面积和电磁打击三个档位。永久强化自动生效；原四种武器外另有三个新武器槽。在基地配装后直接选单人或双人，两种模式都使用实际档位。商店内看广告抽取一次性商品，每日不限次，先入库存，手选后开战消耗。战绩入口合并排行和对战记录。积分仍仅用于对战排行。详见[商品及关卡数值](docs/design/armory.md)及[本机 Docker / Sakura Frp 自测方法](../../../docs/operations/night-overwatch-local-selftest.md)。

- `assets/scripts/core/`：数据、纯规则、ActionRegistry。
- `World.ts`、`Effects.ts`、`HUD.ts`、`Overwatch.ts`、`Platform.ts`：Cocos 场景、弹道/爆炸、UI、输入与生命周期。
- `scripts/generate-assets.mjs`：可重复生成原创 glTF 与八个 PCM WAV，包括飞行引擎循环和落地爆炸声。
- `scripts/model-aircraft.py` / `art/aircraft-assets.blend`：原创 Blender 机舱及可编辑源，实际机舱模型与弹道共用炮口位置。
- `scripts/model-trees.mjs`：核对实际树林几何的索引、法线和合批预算；树林使用不规则树冠、树干与分叉。
- `tests/core.test.ts`：规则与默认任务通关检查。
- `tests/blast.test.ts`：直接命中、近炸衰减、范围外无伤害及落空弹着事件。
- `tests/balance.test.ts`：三分钟无空援生存、地面微弱反击、延迟介入且有瞄准偏差/故意落空的完整任务。
- `tests/feedback-browser.mjs`：真实输入检查悬浮标签、暂停图标截图、三种炮弹的飞行与落空爆炸、范围伤害。
- `tests/flight.test.ts` / `tests/camera.test.ts`：三维飞行、弹道、坡面拦截、投影与地形拾取。
- `tests/flight-browser.mjs`：只读 snapshot + 真实输入验收；`--mission` 完整回放，`--omission` 遗漏威胁，`--prediction-check` 预测自检。
- `tests/browser.mjs`：实际构建的鼠标/键盘与 CDP 多点触控；通过输入游玩，不调用改血/跳关调试方法。
- `tests/presentation.mjs`：四个视口的无全屏控件、操作文案、友伤警报、落点快照与日光/热成像截图。
- `tests/polish.mjs`：同场景前后截图、实际双指输入与滑出/滑回、录像和初次加载采样。
- `tests/h5.mjs`：实际 Shell iframe、低高度面板、旋屏、全屏不可用时继续游玩、模拟安全区和偏好持久化。
- [历史记录：docs/POLISH.md](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/night-overwatch/docs/POLISH.md)：本次逐轮问题、修改、证据与固定质量门槛。
- `docs/STATUS.md`：实际验收结果、截图与未验证边界。

浏览器测试需要运行中的预览服务和 Chrome，或设置 `PLAYWRIGHT_EXECUTABLE_PATH`。QA 入口要求显式指定已确认的构建哈希，入口会同时核对服务端构建和当前源码；不匹配则停止：

```powershell
$env:NIGHT_URL='http://localhost:4318'
$env:NIGHT_EXPECTED_SOURCE_HASH='<已确认的完整构建哈希>'
node tests/feedback-browser.mjs
node tests/flight-browser.mjs
```

截图保存在 `reports/`，本轮 QA 使用带时间戳的独立目录。真实手机、微信、B站、抖音与快手结果必须分别验证，浏览器触控模拟不代表这些平台通过。

当前维护依据为本 README、[设计索引](docs/design/README.md) 与对应源码／测试契约。`__kit/CODEX_TASK.md` 是已更新的当前执行提示，早期参数仅供追溯，不恢复旧原型或占位标准。美术按最新认可效果图实现，使用原创场景材质、插画、金属标题与独立界面皮肤；技术可用与视觉质量分别验收，素材来源见 [ASSETS](docs/ASSETS.md)。

## 本轮界面与上架资料

[当前视觉与交互规范](docs/design/interface.md) · [设计及概念图索引](docs/design/README.md) · [八类资料与验证状态](publishing/STATUS.md)。

历史记录（2026-10-25）：[首页、手册与即时设置设计](docs/design/2026-10-25-settings-home-guide.md)：首页使用独立夜航封面；点击选择任务后再展示关卡与场景预览；手册分层展示操作、绑定和完整说明，固定导航与返回。设置验收：设置上述构建环境变量后执行 `node tests/settings-browser.mjs`，在弹窗打开期间检查真实投影变化及战斗冻结。当时暂停配置使用v6，随后四武器、巡逻与计时使用v7。当前版本加载后直接进入基地，采用 `night-input-replay-v10`，旧版本输入不能混用。

界面回归入口：设置 `NIGHT_URL` 与 `NIGHT_EXPECTED_SOURCE_HASH`，运行 `node tests/ui-style-browser.mjs`（布局、皮肤、按下与拖出取消）和 `node tests/ui-input-browser.mjs`（输入框、键盘缩屏、战况与实际操作）。设置 `NIGHT_REPORT_URL` 为新的 `file:///.../` 目录以保留旧证据；结算修改追加 `NIGHT_STYLE_REVIEW=1 node tests/finish-browser.mjs`。实际打开各尺寸截图对照设计，测试通过不等于视觉达标。 本次大改另以 `node tests/visual-rebuild-browser.mjs` 验证真实单人/人机胜利、三尺寸结算及四尺寸光照；`node tests/lobby-visual-browser.mjs` 需设置隔离本地 `NIGHT_LOBBY_URL`，检查有房间大厅与加入/离开。当前结果见[视觉重做验证](docs/verification-2026-10-28-visual-rebuild.md)。

任务地图使用独立场景插画，叠加真实关卡名称、光照、敌数与解锁状态；插画仅作场景预览，战场位置以实机小地图为准。[地图与支援流程验证](docs/verification-2026-10-24-flow.md)。清除全部威胁（含后续波次）后，立即停火，车队约3秒抵达，在途普通弹按4倍速度走完原剩余弹道、保留地形碰撞与友伤。只有车队抵达、弹药全部处理完、清敌语音播放结束三项都完成，才进入正式结算；先完成的等待其他项。暂停/后台冻结撤离并保留未播完语音，恢复后续播；静音、音频缺失或播放进度连续2秒停滞时跳过语音等待。[同步撤离验证](docs/verification-2026-10-24-extraction-sync.md)。


## 战况、计时与对战

轻车以确定性随机分配90%大圈（半径16–24）与10%小圈（6–8），移动速度受限，不会瞬移追上巡逻进度。两种模式都可随时打开战况表，按轻车／炮台／重甲分别展示总数、存活、消灭和未出场数量。面板打开时战斗继续；设置暂停只对关卡生效，对战以服务端时间推进。

每关保存个人最快成功用时，结算显示本次、最佳和差值；第一次完成即为个人最佳，更短时间显示新纪录。完成计时由护送、清场和弹道完成决定，电台播放不影响成绩。120关各有独立全站榜，服务器重放输入验证，练习与广告辅助不入榜；上传状态在结算页显示。网络不可用时个人纪录继续保存在本机。

对战每方4轻车、2炮台、2重甲，双方弹药相同；随机选择山谷／高地及镜像阵型。先全灭敌方地面单位获胜，同归于尽为平局，不再因已用时间达到180秒结束。大厅、六位房号、匹配等待与断线重连遵循[当前大厅方案](docs/design/2026-10-28-lobby.md)；匹配无真人时保留等候房，不自动转人机。没有联机服务时可选择本地机器人练习。对战中不播放广告；战前选装试用品按实际档位生效，暂未实现直接攻击对方飞机。

玩家具有持久ID和随机昵称；房间与榜单显示名字、短ID，本人以高亮和“你”标识。联网身份由现有服务分配；未联网时显示本机身份。游客跨设备／清除存储后的身份恢复遵循公共身份服务能力。昵称按服务端用户ID唯一更新，排行、房间和战绩重查均显示当前昵称；输入支持2–16字。通关榜显示最高通过关卡序号，按最高通关、累计积分、成绩记录时间、完整ID排序，夜航各榜使用连续名次；详见[本轮修复及TapTap身份配置状态](docs/verification-2026-10-29-online-sync.md)。

## 联机配置与验收

Web构建复用公共 `SmallGamesServices`。默认关闭外部服务；本地服务可按以下参数构建（地址替换为实际本地Runtime）：

```powershell
$env:COMPETITION_SERVICE_ENABLED='1'
$env:COMPETITION_LOCAL_BACKEND='1'
$env:COMPETITION_PUBLIC_API_URL='http://127.0.0.1:43012/api/competition/v1'
pnpm build
```

正式环境只允许HTTPS公共地址。Runtime部署需包含本游戏纯核TS、Node24以及 `003-night-overwatch-control.sql` 兼容迁移；管理控制台发布时将夜航守望设为enabled，并配置实际H5来源。迁移默认disabled，保留已有游戏及历史摘要。客户端配置、服务部署和控制台发布均需完成才可全站联机；本轮更新本机 Docker 后端并通过既有 Sakura FRP 提供手机自测接口，未部署正式服务；交付状态见 [publishing/STATUS.md](publishing/STATUS.md)。本地浏览器界面测试隔离外部服务，与数据库及隧道验证分别记录。

验证与当前素材见 [publishing/STATUS.md](publishing/STATUS.md)。本地联机浏览器测试：设置 `NIGHT_URL` 与构建的 `NIGHT_EXPECTED_SOURCE_HASH` 后运行 `node tests/live-online-browser.mjs`；多尺寸离线/机器人检查使用 `node tests/combat-online-browser.mjs`。

本次界面材质、控件层级、手势取消和三尺寸实机对照见 [界面验证](docs/verification-interface.md)。
