# 夜航守望 / Night Overwatch

原创横屏单人空中火力支援与车队护送。当前打磨一关完整护送：山谷盘山路、河谷桥、村落与东岭营地，三档火力、弹道与爆炸、热成像/日光、友伤与保护区、两个待命点、完整帮助和快速重试。玩家操作「夜航 07」机载火控席，飞机自动盘旋。

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

手机横屏：左手在战场相对拖动瞄准，右手按住右下开火；重炮逐次点按。滑出扳机、取消或失焦立即停火，滑回不会自动续射。手机默认跟随车队，巡视后可通过「战术 → 定位」返回。低频的缩放、传感器、任务、帮助和全屏收在战术菜单；暂停面板提供静音与简化特效，并保存偏好。

救援车抵达东侧撤离区即成功，被毁或 185 秒超时失败。连续行车约 128 秒。青绿方框识别友方，琥珀菱形识别敌方，红色只表示危险；形状与文字同时表达敌我。普通友军可以受到误伤；范围圈和红色警报提醒风险，爆炸范围触及保护区则禁止开火。等待车队不暂停战场与倒计时。结算可点击再次出动或按 Enter 快速重试。

## 修改与验证

- `assets/scripts/core/`：数据、纯规则、ActionRegistry。
- `World.ts`、`Effects.ts`、`HUD.ts`、`Overwatch.ts`、`Platform.ts`：Cocos 场景、弹道/爆炸、UI、输入与生命周期。
- `scripts/generate-assets.mjs`：可重复生成原创 glTF 与八个 PCM WAV，包括飞行引擎循环和落地爆炸声。
- `tests/core.test.ts`：规则与默认任务通关检查。
- `tests/browser.mjs`：实际构建的鼠标/键盘与 CDP 多点触控；通过输入游玩，不调用改血/跳关调试方法。
- `tests/presentation.mjs`：四个视口的真实全屏出入、操作文案、友伤警报、落点快照与日光/热成像截图。
- `tests/polish.mjs`：同场景前后截图、实际双指输入与滑出/滑回、录像和初次加载采样。
- `tests/h5.mjs`：实际 Shell iframe、低高度面板、旋屏、全屏失败回退、模拟安全区和偏好持久化。
- `docs/POLISH.md`：本次逐轮问题、修改、证据与固定质量门槛。
- `docs/STATUS.md`：实际验收结果、截图与未验证边界。

`pnpm test:browser` 需要运行中的预览服务和 Chrome，或设置 `PLAYWRIGHT_EXECUTABLE_PATH`。截图保存在 `reports/`。真实手机、微信与抖音结果必须分别验证，浏览器触控模拟不代表这些平台通过。

核心规则依据 `__kit/GAME_REQUIREMENTS.md`。本次已进入产品打磨阶段，旧 M0/M1 和占位素材条款不作为完成依据；技术可用与发布质量分别记录。美术继续使用项目原创低模与程序音频，来源见 `docs/ASSETS.md`。
