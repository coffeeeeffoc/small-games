# 原生入口验证

复用子模块 bcaddf603c28b416a856d51d01c8b7d386c71a3e 的规则、电脑搜索、存档回放与8道战术练习；未修改子模块源码或指针。入口 `startNativeXiangqiGame(sdk, config, startNativeCompetition)`，竖屏，矢量渲染；打包只需共享确认音效。

`node --test platforms/competition/xiangqi-five/tests/native.test.mjs` 的4项契约通过：320×568、390×844、430×932、844×390布局与安全区；真实落子/抽子/五连胜负；电脑合法回复；旧单机存档回放；战术星级与普通存档隔离；取消、多指、拖动、旋转、后台暂停和清理。小游戏缺少浏览器 structuredClone/performance 时，入口为可序列化游戏数据提供克隆及宿主/Date时钟，规则未复制。

`PLAYWRIGHT_MODULE=/tmp/cops-native-browser/node_modules/playwright/index.mjs CHROMIUM_PATH=/workspace/.cache/ms-playwright/chromium-1193/chrome-linux/chrome node platforms/competition/xiangqi-five/tests/browser.mjs` 在实际 Chromium Canvas 中通过同4种尺寸触屏主页、对局、暂停、帮助、返回、后台恢复与15×15棋盘拖动。实现截图以 `actual-` 开头，效果图为 `concept-`。格子44逻辑像素，只有完整露出的格子可点选，长页面与棋盘分别拖动。旋转保留棋盘。

电脑搜索统一约200ms预算以控制主线程阻塞，挑战难度是在该预算内搜索；Web既有更长电脑搜索并未改变。原生声音开关可保存；没有音频能力时静音可玩。未配置好友服务时入口明确提示不可用，不生成游客登录、奖励或匹配。

这些属于本地规则、Canvas浏览器和SDK契约验证；五平台实际CJS验收由本批次宿主脚本执行，不能替代官方工具/真机。官方开发者工具、真实设备、分享回流、服务端登录和平台审核均未运行。
