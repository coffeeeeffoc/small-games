# 水位联动站局部体验扩展

## 设计先行

沿用水槽与管网视图，横屏保留场景宽度，竖屏保持现有可滚动触控布局。

点管线 → 明确两端槽和开关状态 → 操作预算同时显示已用/三星目标 → 结算分享同关少步邀请。

分享链接固定关卡，不携带 dev；挑战的关卡选择和成绩不写入正常存档。使用提示、预测、撤销和额外操作后明确为辅助通关。

`concept.svg` 是本轮局部控件与反馈示意，沿用已有主场景和页面；实现后保存浏览器触屏模拟截图并补充验证记录。按钮有效热区保持至少 44px；短反馈不遮挡核心对象。

验收：开始、核心操作、取消手势、暂停恢复、结算返回及分享失败降级；规则与构建检查。浏览器模拟不等于手机真机验收。

## 验证结果

80 项规则/布局/存档测试通过，生产构建通过。Chromium 151 浏览器触屏模拟：390×844 与 844×390，取消触摸不消耗操作；真实首关通关、分享移除 dev，未辅助成绩附目标步数，使用提示的邀请不附目标；好友挑战不写正常存档，重试与选关正常。回合制没有计时推进，因此不新增暂停页。结算覆盖层扩展到视口，所有结算按钮保持至少 44px；实际截图 `play-390.png`、`result-390.png`、`play-844.png`。

命令：`pnpm --filter @coffeeeeffoc/waterline-station test`、`pnpm --filter @coffeeeeffoc/waterline-station build`、`node games/local/waterline-station/tests/publishing.browser.mjs`。浏览器结果见 `browser-report.json`，当前尚未验收原生渠道或手机实机。

专项脚本默认将重测证据写到忽略目录 `test-results/publishing/`；显式设置 `CAPTURE_GAME_EVIDENCE=1` 才更新此目录的提交截图。浏览器可通过 `CHROMIUM_PATH` / `PLAYWRIGHT_EXECUTABLE_PATH` 指定，未指定时优先系统 Chromium，再回退到 Playwright 的浏览器。

## 挑战退出补充

好友挑战的重试保持隔离；游玩区与结算区提供明确“退出好友挑战”。点击退出恢复进入邀请前的常规存档，换关或下一关也先退出挑战、清除 URL 邀请参数，再进入所选常规关卡。好友目标仅属于原受邀关卡，不跨关显示。
