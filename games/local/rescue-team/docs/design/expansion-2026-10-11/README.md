# 小城救援队局部体验扩展

## 设计先行

沿用城市地图和事件卡；横屏双栏，窄屏维持现有地图与卡片顺序。

接报卡片显示距恶化倒计时 → 候选车显示完成余量 → 地图旁显示最近恶化目标 → 结算邀请同一事件表。

按模拟时间倒计时，暂停冻结；不预告未发生事件。同关邀请固定事件与车位，不冒充真人对战。

`concept.svg` 是本轮局部控件与反馈示意，沿用已有主场景和页面；实现后保存浏览器触屏模拟截图并补充验证记录。按钮有效热区保持至少 44px；短反馈不遮挡核心对象。

验收：开始、核心操作、取消手势、暂停恢复、结算返回及分享失败降级；规则与构建检查。浏览器模拟不等于手机真机验收。

## 验证结果

规则检查覆盖三关确定性零延误（27/34/38 秒）、路线协作与进出场锁定；生产构建通过。Chromium 151 浏览器触屏模拟：390×844 与 844×390，取消手势无派车；候选车完成余量可见，暂停后计时及恶化倒计时一起冻结；通过真实派车在约 27 秒完成首关四事件零延误。分享链接固定事件表并剔除 dev，返回待命重置对局，第 3 关邀请正确载入。

命令：`pnpm --filter @coffeeeeffoc/rescue-team test`、`pnpm --filter @coffeeeeffoc/rescue-team build`、`node games/local/rescue-team/tests/publishing.browser.mjs`。实际截图 `dispatch-390.png`、`pause-390.png`、`result-844.png`，完整结果见 `browser-report.json`；尚未进行手机实机/原生平台验证。

专项脚本默认将重测证据写到忽略目录 `test-results/publishing/`；显式设置 `CAPTURE_GAME_EVIDENCE=1` 才更新此目录的提交截图。浏览器可通过 `CHROMIUM_PATH` / `PLAYWRIGHT_EXECUTABLE_PATH` 指定，未指定时优先系统 Chromium，再回退到 Playwright 的浏览器。
