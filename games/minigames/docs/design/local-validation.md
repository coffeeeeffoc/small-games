# 提交前验证记录：2026-10-14

环境：Linux、Node 24.21.0、pnpm 12.6.0；原 H5 使用 Chromium 140 / Playwright 1.55.1。此次记录不代表小游戏真机验收。

- 新目录 26 项测试全部通过：五模式、角色/先手、AI 取消、旧存档、解锁、触控取消、DPR、Canvas/Image receiver、后台视口同步、渠道身份、源码 bundle、发布范围、官方转换部分失败拦截、Creator 自动生成配置与版本化设置的源码身份隔离，以及 Set/Map 展开语法在引擎构建前的兼容转换。
- 相关发布范围测试 131 项：130 通过，1 项沿用原有跳过，无失败。发布工具测试 109 项：108 通过，1 项沿用原有跳过，无失败。
- 三款原 H5 重新生产构建，独立页面的桌面与触屏游戏流程全部通过。
- Shell 有限范围检查通过，覆盖三款及开发者模式共用的 wulong-city fixture，包含内嵌游玩、返回、手机宽度及运行环境隔离。
- `check:dev-mode` 覆盖 68 款，0 问题；开发者模式 5 项单元测试与本次三款 26 项浏览器检查通过。
- 三个 Cocos 项目以真实 Creator 3.8.8 声明完成 TypeScript 检查。声明来自仓库固定基线 `29265ddb485bb0eb5317c5e07dcc4771d15b4231` 的真实构建 artifact `11844603725`，未手写 `cc` 类型。
- 此 Linux 环境不能运行 Creator 编辑器；真实引擎编译、TapTap 官方转换、实际引擎画面与输入由新增 `Cocos mini-games` workflow 验证，其产物、日志和截图作为独立证据。
- Windows CI 已完成三款真实 Creator 3.8.8 编译及 TapTap v1.2.2 官方 ZIP 转换；首次最终校验发现 Creator 自动新增本机 settings，已修正为仅跟踪版本化设置。最终完整结果以对应提交的 workflow 记录为准。
- 真实浏览器产物暴露 Creator loose 编译把 Set/Map 展开误处理为数组的问题，影响触摸回调、SDK 枚举和部分规则。准备阶段现在对全部生成 JavaScript 的数组/调用展开先物化为 `Array.from`，保留对象展开和 rest 语义，原 H5 源码不变；最终由真实引擎鼠标/触屏流程复验。

首次本地 Shell/开发者模式运行遇到尚未生成的 Shell 与 workspace 导出产物，按已有依赖构建逻辑补齐后重新执行，以上记录为最终通过结果。没有放宽旧 H5 行为断言或更改旧游戏源码。

每次发布仍须执行准确 base/head 的候选验证、正常 pre-push hook，并检查对应 SHA 的 CI、Pages 与 Cocos workflow。官方工具、账号权限与真机功能未由桌面浏览器代替。

## 真实引擎验收记录

提交 `5daebe5484cc18e0c8e51cdb80592dda1b68e2f9` 的 [Cocos workflow](https://github.com/coffeeeeffoc/small-games/actions/runs/38507560258) 已完成三款 Creator 3.8.8 浏览器产物与 TapTap v1.2.2 官方 ZIP 构建及源码一致性检查。本机下载同一提交的真实产物后，再次通过三款的鼠标、触屏、暂停恢复及前后台流程；象棋覆盖落子与战术胜利结算，回合警匪覆盖合法移动与模式切换，实时警匪覆盖模拟推进与暂停冻结。已查看实际手机尺寸截图，无纹理翻转或主要控件遮挡。

同一提交的 [仓库 CI](https://github.com/coffeeeeffoc/small-games/actions/runs/38507560422) 与 [GitHub Pages 部署](https://github.com/coffeeeeffoc/small-games/actions/runs/38507560259) 已成功。三款 TapTap 官方 ZIP 实测大小分别为：回合警匪 517,820 字节、实时警匪 2,901,757 字节、象棋 491,004 字节。以上均为预览包，不代表账号、广告或小游戏真机认证。后续源码变更以对应提交的最新 workflow 结果为准。
