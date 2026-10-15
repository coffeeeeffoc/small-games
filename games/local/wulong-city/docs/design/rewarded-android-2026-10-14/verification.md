# 2026-10-14 验证记录

## 实现与证据

提示页保留三级免费提示，新增自愿激励广告获得 30 秒机关高亮。已移除结算自动插屏，广告异常和取消不阻断游玩。效果图为 `hint-concept.png`；`actual/`、`publishing/` 是生产 Web 构建真实截图，`android-actual/` 是安装后的 Android 模拟器整屏截图（WebView CDP 截图会遗漏硬件 Canvas 图层，故使用设备 compositor 截图）。

Android 采用随 APK 打包的离线 HTML/Canvas + 原生 Java/TapADN 5.3.0.4；它是安装式 APK，渲染层仍为 WebView。未使用 H5 ZIP 代替 APK。

## 已执行

- Node 24.21.0 / pnpm 12.6.0，Windows：110 项规则、关卡、奖励与 bridge/配置测试通过。覆盖仅验证完成发奖、重复点击、取消/超时/重试后迟到回调、部分配置和不合法 ID/签名输入。
- Chrome 手机触屏模拟：提示三级免费、320px 热区、取消手势、奖励仅在游玩扣时、无自动广告、暂停与原生事件、触屏通关/结算/返回、挑战和开发试玩隔离通过。SDK 结果在此项中是模拟回调。
- 原有 100 关 lifecycle 测试及 320×568、390×844、844×390 mobile 测试通过；保存的记录见 `actual/lifecycle.json`、`actual/mobile.json`。
- 统一开发模式静态检查 68 款游戏、0 问题，公共规则测试 5 项通过。生产入口检查纳入准确提交候选的门禁日志。
- JDK 17.0.11 / SDK 34 / Gradle 8.6 / AGP 8.4.0：真实执行 `assembleDebug lintDebug testDebugUnitTest`，Java 奖励结算测试 5 项通过；lint 0 errors、7 warnings（固定竖屏、移除旧权限声明、API 属性、同步撤回写入与备份配置建议）。apksigner 与包名、版本、离线资源清单检查通过。
- 直接执行 Gradle `:app:preReleaseBuild`，无正式配置时按预期失败；聚合 Gradle/Studio 入口不能绕过正式配置检查。
- Android API 34 / Pixel 3a 只读模拟器，安装真实 debug APK：触屏完成第 1 关并解锁第 2 关、免费提示、原生返回键、前后台暂停恢复、退出进程后存档恢复、隐藏浏览器全屏入口通过。APK 摘要与逐项结果见 `android-actual/verification.json`。
- 只读代码复核后修复原生关闭/验证乱序、销毁后迟到回调与广告对象释放边界；没有真实媒体配置，因此没有把这些 SDK 回调路径称为设备广告验收。

本地最终包与构建报告在已忽略的 `android/dist/`；报告记录 `sourceHead`、源码 SHA256、APK SHA256、签名验证结果。仓库准确候选校验通过后才使用正常 hooks 推送 dev，CI/Pages 状态另行报告。

## 尚未验证

没有真实 TapADN 媒体 ID/key、广告位、游戏隐私地址及正式签名，因此当前是广告入口关闭的 debug APK。真实填充/收入、拒绝与撤回的设备网络行为、物理手机、正式签名包、TapTap 后台提交/审核均未验收。接入参数和发布命令见 `../../../android/README.md`。
