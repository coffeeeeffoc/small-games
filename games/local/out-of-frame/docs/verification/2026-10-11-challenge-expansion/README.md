# 本轮挑战与横屏验收

环境：Linux Chromium `/usr/bin/chromium`，桌面 1280×800、触屏模拟 390×844 / 844×390、同源 Game Host iframe 360×640。手机图为浏览器设备模拟，非真机。

规则 / 全部关卡可达性：122 项通过。生产构建通过；折叠世界的 Phaser 大分包提示保留，非构建失败。未修改关卡规则。

`tests/publishing.browser.mjs` 从仓库根执行：桌面真实控制通关、暂停、公开分享；链接重开后手机真实触屏通关、取消手势与普通存档逐字节比较；物理横屏再次通关；第三次结算模拟广告及关闭；返回正常进度。公开链接不含开发参数。详见 [专项报告](report.json)。

`PUBLISHING_DESKTOP_ONLY=1 node games/local/out-of-frame/tests/publishing.browser.mjs` 用于最后的窄范围补测：独立全屏进入/退出、真实通关、模拟 BFCache 持久化 pagehide/pageshow 后仍可正常分享。详见 [生命周期补验](desktop-report.json)。这验证事件恢复路径，不宣称浏览器实际采用了 BFCache。

另用同源 `data-game-display-host` iframe 实测进入/退出宿主全屏、360×640 旋转锁定与触摸开始，确认全屏包含游戏控件、无页面溢出和脚本异常。[嵌入报告](embedding-report.json)。转场会重新建立旋转容器布局，修复 Chromium 祖先进入全屏后旧图层裁剪产生空白的问题。

本轮未重跑旧的全战役长程浏览器脚本；所有关卡的纯规则可达性仍完整通过。真实渠道广告、原生小游戏 SDK、物理手机和 Safari 未验。没有联网排名或对战。

| 页面 | 截图 |
|---|---|
| 手机首页 | [phone-home.png](phone-home.png) |
| 手机游玩与触控区域 | [phone-play.png](phone-play.png) |
| 手机挑战结算 | [phone-result.png](phone-result.png) |
| 桌面正常结算 | [desktop-result.png](desktop-result.png) |
| 小屏 iframe / 退出全屏后游玩 | [small-phone-iframe.png](small-phone-iframe.png) |
