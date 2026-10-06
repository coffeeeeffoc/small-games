# 原生入口验证记录

2026-10-06，Linux 云环境，Node 24.21.0。运行：

```sh
node --test games/local/vibeJam-myself-history-guess/tests/*.test.mjs
```

10/10通过。既有测试覆盖28幕配置、评分与公元前年代、主题路线、排名答案隐私、Canvas地图与年代键盘。新增原生SDK契约模拟验证：主页→选关→场景→地图落点→年代→提交→学习解说→后台暂停→恢复→结算；场景进度存储与重启恢复；分数重算和损坏存档拒绝；触摸取消、多指、滑出不激活；监听完整清理；存储拒绝仍可单机。

`native-scenes.js`载入全部28幕；`native.js`复用`src/game.js`与`src/routes.js`。独立原生存档key `here-and-then:native:v1`保留已有Web存档。入口export `startNativeHistoryGame(sdk, config, startNativeCompetition)`；竖屏；资源需完整`public/assets`（约11MiB，平台首包限制由整合打包层核对）。不使用DOM、WebView、Leaflet或Three。

原生SDK必须提供Canvas、系统尺寸、安全区、图片、触摸start/move/end/cancel、hide/show及对应解绑能力。存储、窗口变化可选，存储失败提示后继续。原生主页不提供浏览器全屏按钮；本模式未新增音效。好友赛回调只在配置API并提供启动函数、平台支持时展示。

手机效果图先行：`native-mobile.svg`。浏览器实画测试fixture `scripts/native-preview.html`只用于Canvas观察与触屏回归，不进入平台包，不作为真实平台适配。已使用Chromium `/usr/bin/chromium` 与隔离Playwright完成实际Canvas渲染及触屏回归，无需Vite。命令：

```sh
PLAYWRIGHT_MODULE=/tmp/cops-native-browser/node_modules/playwright/index.mjs node games/local/vibeJam-myself-history-guess/scripts/native-browser.mjs
```

320×568、390×844、430×844三个视口通过：主页→设置→帮助→选关→全景→暂停→地图→年代键盘→提交→学习解说→总结，以及重启恢复；CDP实际多指、滑出、取消均不触发主页按钮；后台恢复保持暂停，90秒倒计时仅在可见游玩时下降。`native-2026-10-06/`保存36张真实Canvas截图（每个尺寸12种状态）。视觉检查核对主要按钮与安全区，暂停图标为两根分离实心竖条；小屏学习解说分页完整保留史料与来源。触控由真实Chromium touchscreen/CDP输入，SDK存储与生命周期由明确标注的浏览器测试宿主提供。官方开发者工具、真实设备、平台审核和发布均未验证。本测试不是45平台验收。
