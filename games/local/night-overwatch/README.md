# 夜航守望 / Night Overwatch

原创横屏单人空中火力支援与车队护送。玩家操作「夜航 07」机载火控席，在起伏山谷中保护四组分散友军，并清除 24 个威胁。真实透视镜头随飞机盘旋，支持旋转观察、改变盘旋方向、高度和半径；三种武器从固定机身炮口发射，飞行时间取决于三维距离，弹道会被山坡截住。

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

## 操作

鼠标移动瞄准，左键/Space 开火；1/2/3 或 Q/E/滚轮切枪；Z/X 缩放，右键临时放大；V 切换传感器；T 在下一待命点等待/继续；R 定位；M 任务；H/? 帮助；P/Esc 暂停。所有绑定与帮助来自 `assets/scripts/core/Actions.ts`。

←/→ 旋转观察；[/] 切换逆/顺时针盘旋；PageUp/PageDown 调整高度；逗号/句号调整盘旋半径。小地图保持北向固定，点击可巡视对应区域并同步准星；高度、斜距和预计弹着时间实时显示。

手机横屏：左手在战场相对拖动瞄准，右手按住右下开火；重炮逐次点按。滑出扳机、取消或失焦立即停火，滑回不会自动续射。手机默认跟随车队，巡视后可通过「飞行 → 定位」返回。飞行面板提供缩放、传感器、任务和帮助；右上角全屏始终可点。暂停面板提供继续、声音、简化特效、帮助与全屏，并保存声音及特效偏好。

爆破炮携带 80 发、重型炮 30 发；重炮装填间隔 3 秒，每次点按发射一发。落空也产生弹着火光与烟尘；爆破/重炮爆炸半径为 3.4/6.5 世界单位，伤害随离目标车身的距离递减，范围外不受伤。三种炮弹使用不同口径与短曳光，约 600/420/320 米每秒的初速与三维距离共同决定飞行时间。

地图默认只保留敌我形状与血条。桌面鼠标悬浮车身或标记时显示该目标类型，移开立即隐藏；触控不显示地图类型标签。右上角暂停图标直接绘制两条竖线，不依赖字体字形。

救援车抵达东侧撤离区且全部威胁清除才成功；救援车被毁、任一据点整组覆灭或 360 秒超时均失败。连续行车约 240 秒。车队与三个据点各有 3 辆友军，共 12 辆；救援车生命 520、护卫 360，装甲抵御 80% 敌方地面火力。护卫每 6 秒微弱反击，玩家仍承担主要消灭任务；结算分别统计空中与地面击毁。

青绿方框识别友方，琥珀菱形识别敌方，红色只表示危险；形状与文字同时表达敌我。地面装甲不抵消玩家炮弹的友伤，范围圈和红色警报提醒风险，爆炸范围触及保护区则禁止开火。等待车队不暂停战场与倒计时。结算可点击再次出动或按 Enter 快速重试。

## 修改与验证

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
- `tests/presentation.mjs`：四个视口的真实全屏出入、操作文案、友伤警报、落点快照与日光/热成像截图。
- `tests/polish.mjs`：同场景前后截图、实际双指输入与滑出/滑回、录像和初次加载采样。
- `tests/h5.mjs`：实际 Shell iframe、低高度面板、旋屏、全屏失败回退、模拟安全区和偏好持久化。
- `docs/POLISH.md`：本次逐轮问题、修改、证据与固定质量门槛。
- `docs/STATUS.md`：实际验收结果、截图与未验证边界。

浏览器测试需要运行中的预览服务和 Chrome，或设置 `PLAYWRIGHT_EXECUTABLE_PATH`。QA 入口要求显式指定已确认的构建哈希，入口会同时核对服务端构建和当前源码；不匹配则停止：

```powershell
$env:NIGHT_URL='http://localhost:4318'
$env:NIGHT_EXPECTED_SOURCE_HASH='<已确认的完整构建哈希>'
node tests/feedback-browser.mjs
node tests/flight-browser.mjs
```

截图保存在 `reports/`，本轮 QA 使用带时间戳的独立目录。真实手机、微信与抖音结果必须分别验证，浏览器触控模拟不代表这些平台通过。

核心规则依据 `__kit/GAME_REQUIREMENTS.md`。本次已进入产品打磨阶段，旧 M0/M1 和占位素材条款不作为完成依据；技术可用与发布质量分别记录。美术继续使用项目原创低模与程序音频，来源见 `docs/ASSETS.md`。
