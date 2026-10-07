# 原生安全视口

乌龙原画面保留；宿主从真实safeArea与胶囊底界生成安全内容区域。物理Canvas保持窗口尺寸，游戏Canvas视图宽高为内容尺寸。绘制变换、裁剪与触点使用同一矩阵，resize更新布局并取消输入，不重新mount。

可选 `viewport: { aspectRatio: 390 / 844, rotateToFit: true, refreshOnResize: 'resume' }` 保持竖屏内容比例。物理横屏时旋转内容视口90度，再安全区内居中；避免把四个44px控件压入过窄竖条。配置属于宿主入口，不以游戏ID分支。未配置方向时仅做安全inset，无安全信息时尺寸与坐标保持旧行为。

局部设计参照 safe-viewport-concept.svg。验证覆盖胶囊、非对称安全区、旋转、resize、多指、滑出取消、暂停返回及监听清理；截图使用实际乌龙产物。SDK fixture、浏览器Canvas不代表官方工具或真机验收。

## 实际验证

本轮通过 native-game-shell TypeScript typecheck/build、包内 lint 和 src 三个测试文件共9项，以及 shell-minigame native.test.ts 17项消费者回归。构建本身会生成 dist 测试副本；验收只计 src 测试，不将副本当额外覆盖。

运行实际微信 game.js 的 Chromium 触屏适配器验证：390×844、320×740、844×390，非对称安全区和胶囊底界72；安全区外像素保持宿主底色，横屏主页/选关和游玩暂停按钮通过逆映射触点实际操作。覆盖主页、选关、游玩、提示、后台暂停/恢复、首关完成、记录/存档和全部监听与计时器释放。截图与 verification.json 位于 safe-viewport-actual/；保留乌龙原美术、关卡和绘制实现。

可重复命令：`NATIVE_ARTIFACT=apps/shell-minigame/dist/nine-games/wechat/wulong-city node packages/native-game-shell/safe-viewport-browser.mjs`。测试需要可用 Playwright；独立安装可用 `PLAYWRIGHT_MODULE` 指定模块，`CHROMIUM_PATH` 指定浏览器。

父任务另运行五平台实际构建契约；SDK fixture的返回与控件触点必须经过同一安全视口变换，不能复用游戏原始43/74等坐标。官方开发者工具、真实手机及平台审核仍未运行。

`refreshOnResize: 'resume'` 只适用于 resume 幂等且重绘当前页的模块；可见 resize 取消输入并重绘，后台 resize 不恢复游戏。乌龙主页无逐帧绘制，因此入口必须启用此项，否则 Canvas resize 会清空静态主页。实际截图逐张检查并以像素颜色数断言非空内容。
