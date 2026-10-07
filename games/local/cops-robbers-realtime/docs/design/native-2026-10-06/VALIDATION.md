# 街区追捕原生输入与安全区核验

本次沿用原生横屏页面及玩法，只修正宿主安全区/胶囊与手势处理；没有重新设计游戏美术。SDK画布保留物理尺寸，逻辑内容位于安全区，触点减去同一偏移。选关页小屏纪录位置限制在开始按钮上方，避免遮挡。触摸开始、滑动、取消、结束按同一触点/同一页面匹配；多指、滑出、后台及resize清理未完成手势，后台恢复保持暂停。

`node --test games/local/cops-robbers-realtime/tests/native-input.test.mjs` 的2项契约通过：孤立松手、重复松手、取消、滑出后滑回、多指、不同触点、Hide/Show、resize、资源解绑、安全区及胶囊物理命中。既有全游戏41项规则测试通过，覆盖全部模式可获胜见证、真实AI、记录回放、接力和胜负。

`PLAYWRIGHT_MODULE=/tmp/cops-native-browser/node_modules/playwright/index.mjs CHROMIUM_PATH=/workspace/.cache/ms-playwright/chromium-1193/chrome-linux/chrome node games/local/cops-robbers-realtime/scripts/native-input-browser.mjs` 实际 Chromium Canvas 在667×375、844×390、932×430通过主页、帮助、选关、真实计时游玩、暂停和后台恢复触屏流程。截图以 `actual-` 开头；人工检查667安全区下纪录与开始按钮不重叠、游戏控制未遮挡场景、暂停为实心双竖条。

原生五平台CJS包另由宿主本批次smoke检查。官方工具、真实设备、真实服务器提交与平台审核未执行，浏览器和SDK fixture不代表真机验证。
