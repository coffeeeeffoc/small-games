# 战斗补给验证记录 · 2026-10-10

## 版本与环境

- 基线：`0075fce02f29d2dcd33546ca99eb86f24276ac98`（远端 dev）。最终提交与推送 SHA 以发布时准确候选日志为准。
- Creator **3.8.8** 真实 Web Mobile 构建，源码哈希 **`d1fe27c4d4816adf0ca4d526158e3e92d79bc99c5ee2ac531d9f3c359a4dbdb3`**。所有浏览器套件在运行前后核对构建与当前源码。
- Windows、Node **24.21.0**、pnpm **12.6.0**、Chrome **154.0.8037.98**，桌面无头浏览器和 CDP 触控输入；独立预览 `http://127.0.0.1:4328`。
- [方案](combat-supply-20261010.md)、[效果图](combat-supply-concept-20261010.png)、[平衡实验](combat-supply-balance-20261010.md)。效果图只用于设计参考，以下截图均为运行画面。

## 实现与结果

| 检查 | 结果与证据 |
| --- | --- |
| 规则、控制器、存档、HUD | **93/93**；[unit.log](../../reports/combat-supply/unit.log)。包含普通追踪原伤害/速度/范围/友伤、引导目标友伤提示、到期失锁、射速间隔 `/1.3`、冻结、后台倒计时中断、单次领取、存储异常与组件销毁后完成广告。 |
| 威力校准 | **3,168 场景全部断言通过**；[balance.json](../../reports/combat-supply/balance.json)。消耗弹伤害 120，每次补 2 发，满血重甲需要两发；不改普通武器参数。 |
| 补给浏览器专项 | **9 组通过、errors=[]**；[verification.json](../../reports/combat-supply/verification.json)。844×390、568×320、390×844 真实触屏输入；六种宿主广告边界结果；全部战斗状态冻结、弹药在途与装填、取消/选奖/广告/倒计时、重复点击、稍后领取/主页/刷新、两种增益实射、倍率广告互斥。 |
| 增益到期 | 通过正常战斗等待 60 秒，最后五秒轻微提醒，实测到期观察耗时约 60.2 战斗秒（轮询采样）；没有快进或修改计时器。两种增益精确到期由规则测试覆盖。 |
| 追踪弹回归 | **1366×768、844×390、568×320 均通过，errors=[]**；[报告](../../reports/combat-supply/regression-homing/verification.json)。手动锁定、真实在途制导、暂停、运动目标命中、重甲两发、160 倍、结算/重试/持久化。制导目标可迎向弹药，使用实际在途和命中证据，不套固定弹道的初始到达估算。 |
| 移动交互回归 | **844×390、568×320、390×844 均通过，errors=[]**；[报告](../../reports/combat-supply/regression-mobile/verification.json)。主页/选关/游玩/暂停/设置/帮助、三种普通武器、追踪弹、双指缩放/平移、全屏出入、竖屏旋转兜底及触控映射。 |
| Shell 现有入口 | 内嵌和 844×390 触屏、返回导航通过；[shell-entry.log](../../reports/combat-supply/shell-entry.log)。 |
| Shell 补给专项 | **3 组通过、errors=[]**；[shell-verification.json](../../reports/combat-supply/shell-verification.json)。桌面 1280×720 和触屏 844×390 通过实际目录进入 iframe，验证取消、完成、三选一、+2 弹药、3/2/1 冻结与恢复、再次暂停和返回目录；第三组用公开广告边界失败夹具验证可恢复。成功流程使用未修改的 Shell 与游戏内 Web 广告示例。 |
| 开发模式 | `check:dev-mode` 66 款无问题；`test:dev-mode` 5/5；本游戏生产浏览器 **10 项通过**（独立、Shell、同源/跨域 iframe、URL/存储开关等）；[报告](../../reports/combat-supply/dev-mode-browser.json)。 |
| 原生源码适配边界 | **7/7**；[native-boundary.log](../../reports/combat-supply/native-boundary.log)。同步 HUD/Platform 审核摘要，保持原生无浏览器全屏边界。此检查不代表原生编译或真机通过。 |

## 实际画面对照

- 三选一：[844 横屏](../../reports/combat-supply/844-mock-choice.png)、[568 小屏](../../reports/combat-supply/568-mock-choice.png)、[390 竖屏旋转](../../reports/combat-supply/390-mock-choice.png)。三张奖励卡和领取热区可见，无控件遮挡。
- [三秒恢复](../../reports/combat-supply/844-mock-countdown.png)：增益保持 60 秒；[追踪中](../../reports/combat-supply/844-mock-tracking-active.png)、[小屏射速增益](../../reports/combat-supply/568-mock-rate-active.png)、[最后五秒](../../reports/combat-supply/844-mock-last-five-seconds.png)、[到期后](../../reports/combat-supply/844-mock-expired.png)。
- [小屏暂停](../../reports/combat-supply/regression-mobile/568-pause.png)：暂停图标为两根分离、等高实心竖条；新增补给入口保留明确点击区域。
- [Shell 触屏三选一](../../reports/combat-supply/shell-touch-choice.png)：在实际 iframe 内布局完整，保留 Shell 原有目录导航和权限。

## 验证边界与已知环境问题

- Playwright 的焦点仿真使该无头环境切换实际标签仍保持 `document.hidden=false`。后台用例在 **浏览器可见性边界**临时替换 `document.hidden` 并触发 `visibilitychange`，在 `finally` 恢复属性描述；不调用 `__night` 或模拟器写入接口。报告明确 `lifecycleBoundarySimulated:true`、`realTabLifecycle:false`，不能当作实际切后台验证。
- 显式 CDP `touchCancel` 在三个尺寸各触发一次 Creator 引擎警告：不可取消事件被引擎调用 `preventDefault`。已独立定位到 `cc.915b6.js` 及 Creator `pal/input/web/touch-input.ts:85–86`；[诊断](../../reports/combat-supply/touchcancel-origin.json)。仅“精确警告文字 + 引擎 URL + 显式取消窗口”记入 warnings，其余 console error 与 pageerror 仍失败。输入释放和取消后停止发射均有断言。
- 额外执行原生宿主全套：Vitest **28/28**；Node 测试 **108/111**，三个失败均为 Windows 创建文件符号链接的 `EPERM`（支付宝两个、快手一个），发生在测试夹具准备阶段；完整[失败日志](../../reports/combat-supply/native-consumers.log)保留。未删除测试或修改平台安全规则。正常 Web 发布沿用仓库默认暂缓原生平台门禁的设置。
- 未验证真实广告 SDK、实体手机、微信/抖音/B站/快手/支付宝宿主或原生发布包。Web 使用现有可取消广告示例，provider 矩阵使用启动前宿主边界夹具。
- Shell 的 Vite 根路径预览没有 `/favicon.ico`，四条精确匹配的浏览器隐式图标 404 单独记入 warnings；游戏资源、其余 console error 和 pageerror 仍阻断测试。未修改 Shell 权限、广告适配或生产资源。
- 射速提升保留热量/冷却机制，不承诺持续总伤害提高 30%；高速武器长期射击可能更早过热。无限广告与弹药可囤积依用户要求保留。

## 复现与发布

```powershell
$env:NIGHT_URL='http://127.0.0.1:4328'
$env:NIGHT_EXPECTED_SOURCE_HASH='d1fe27c4d4816adf0ca4d526158e3e92d79bc99c5ee2ac531d9f3c359a4dbdb3'
pnpm --filter @coffeeeeffoc/night-overwatch test
node games/local/night-overwatch/tests/supply-balance.mjs
node games/local/night-overwatch/tests/combat-supply-browser.mjs
node games/local/night-overwatch/tests/rewarded-homing-browser.mjs
node games/local/night-overwatch/tests/mobile-20261009-browser.mjs
$env:NIGHT_SHELL_URL='http://127.0.0.1:4330/'
node games/local/night-overwatch/tests/shell-supply-browser.mjs
```

发布时使用 `.scratch/night-supply-prebuilt` 的匹配构建与真实引擎声明，按仓库流程对已提交的准确 base/head 执行 `validate-candidate`，再通过正常 pre-push hook 推送 dev。准确候选与推送日志放在工作区 `.scratch/night-supply-publication/`，避免把记录自身的提交号写入提交而制造自引用。远端 CI/Pages 状态须单独核对，以上本地结果不代表线上部署成功。
