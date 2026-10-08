# 双无尽与积木花园验证记录

以下为第一版历史记录。用户反馈后的当前实现与验证见 [第二版视觉对齐](refinement.md)。

日期：2026-10-07。先生成 [四联效果图](concept.png)，再实现共享素材、Web 与原生 Canvas，最后运行以下检查。

## 效果图与实现对照

| 页面 | 实际截图 | 对照结果 |
| --- | --- | --- |
| 首页 | [390×844](actual/home-390x844.png)、[320×568](actual/home-320x568.png) | 落地薄荷花园、奶油积木托盘、珊瑚主按钮及立体积木插画；标题、进度和按钮无重叠。 |
| 无尽入口 | [390×844](actual/endless-modes-390x844.png)、[320×568](actual/endless-modes-320x568.png) | 两张玩法卡片、各自最高分和开始按钮；小屏内可以直接操作两个入口。 |
| 游玩 | [经典](actual/game-390x844.png)、[立即补位](actual/refill-playing-390x844.png)、[小屏](actual/refill-playing-320x568.png) | 保留棋盘和触控映射，背景降低对比，外围控件统一花园主题；棋盘、三槽和暂停均可见。 |
| 选关与反馈 | [选关](actual/levels-390x844.png)、[暂停](actual/pause-390x844.png)、[结算](actual/refill-result-390x844.png) | 统一章节卡片、按钮和托盘，保持正常解锁及续玩路径。 |
| 设置 | [闪光关闭](actual/flash-off-390x844.png) | 正向“消除闪光”文案，开关显示开／关；旧 reducedFlash 设置反向映射。 |
| Shell 嵌入 | [补位游玩](actual/shell-refill-390x844.png) | 生产 Shell iframe 中触屏落子及补位正常。 |

效果图中的装饰与最终实现有细节差异；棋盘比例、触控热区和正常进度以实际游戏为准。

## 执行结果

- 游戏测试：`pnpm --filter @coffeeeeffoc/three-choose-two test`，40 项通过，覆盖立即补位、保留其他候选、清除计分、补位后判负、旧规则确定性、旧存档和独立纪录。
- 手机浏览器：设置 `PLAYWRIGHT_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe` 后运行 `pnpm --filter @coffeeeeffoc/three-choose-two test:browser`。生产 dist、Chrome 154.0.8037.98、桌面手机模拟和 CDP 触屏；27 项检查、30 张截图，0 页面异常。包括 390×844、360×640、320×568、横竖尺寸切换、真实浏览器全屏、手势取消、选关、胜负、暂停与恢复。详见 [原始报告](actual/verification.json)。
- Shell 生产 iframe 补充检查：390×844 CDP 拖拽，立即补位后另两槽不变；暂停、首页、刷新、恢复、结束与重开通过。详见 [报告](actual/shell-verification.json)。
- 开发模式：`pnpm check:dev-mode` 检查 66 款游戏，0 问题；`pnpm test:dev-mode` 5 项通过。以 `DEV_MODE_GAME_IDS=three-choose-two` 运行 `pnpm test:dev-mode:browser`，10 项通过，包括本游戏独立／Shell 的默认、URL、存储、显式关闭和现有共享 iframe 触屏夹具。详见 [报告](actual/dev-mode-verification.json)。
- 微信和 B 站：分别执行 `node apps/shell-minigame/scripts/build.mjs --platform <wechat|bilibili> --game three-choose-two --preview`，随后执行 `node scripts/native-game-smoke.mjs --standalone --game three-choose-two --platform <wechat|bilibili>`，均通过。确认 art/audio 随包复制、正向开关、两种入口、补位触控、保留槽位、续玩与重开；包为预览产物，约 3.64 MB。
- 旧在线规则服务：`pnpm --filter @coffeeeeffoc/runtime-api exec vitest run tests/three-choose-two.test.ts`，9 项通过。立即补位仅本地可玩，不复用经典排行。
- `git diff --check` 通过。

## 验证边界

这些结果来自桌面浏览器和原生 Canvas VM 模拟，不等于手机真机、微信／B 站开发者工具或上线验收。原生平台仅构建预览包，未配置发布 AppID。

浏览器分享测试捕获 navigator.share 的实际应用负载，未打开系统分享面板；激励广告使用标明的确认回执夹具，不代表真实广告接入。数据库集成测试因缺少 THREE_CHOOSE_TWO_TEST_DATABASE_URL 跳过，未宣称通过真实数据库集成。

本次未提交或推送；其他进行中的仓库改动保留。
