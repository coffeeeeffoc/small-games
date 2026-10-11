# 归途站局部体验扩展

## 设计先行

竖屏优先；沿用立体站台、车顶箭头和底部调度栏。

点车顶箭头 → 阻挡车标红并显示“先移” → 顶部显示当前可出库车辆数（同时满足通路、车位与乘客容量） → 1/2/3 倍速缩短等待 → 结算邀请同关。

出车数由关卡固定，不设少步榜。分享只邀请同一关；挑战绕过正常解锁，但结果与正常进度隔离。

`concept.svg` 是本轮局部控件与反馈示意，沿用已有主场景和页面；实现后保存浏览器触屏模拟截图并补充验证记录。按钮有效热区保持至少 44px；短反馈不遮挡核心对象。

验收：开始、核心操作、取消手势、暂停恢复、结算返回及分享失败降级；规则与构建检查。浏览器模拟不等于手机真机验收。

## 验证结果

17 项模拟/关卡规则测试、TypeScript 检查与生产构建通过。Chromium 151 触屏模拟在 390×844 下完成真实第一关（12 辆全部离场，33/33 人接走）；验证阻挡车文字、3×速度、触摸取消、暂停时间冻结、结算分享、挑战存档隔离及返回正常游玩，844×390 截图验证横屏布局。浏览器无页面错误，报告见 `browser-report.json`。

命令：`pnpm --filter @coffeeeeffoc/homebound-station test`、`pnpm --filter @coffeeeeffoc/homebound-station build`、`CAPTURE_GAME_EVIDENCE=1 node games/local/homebound-station/tests/publishing.browser.mjs`。运行采用普通省电画质和 SwiftShader 软件 WebGL；测试通过实际触屏派车，没有注入模拟状态或强制通关。初次并发运行曾受软件渲染/触屏协议等待影响，释放并发资源并显式配置 SwiftShader 后完成。

实际截图：`home-390.png`、`blocker-390.png`、`pause-390.png`、`result-390.png`、`play-844.png`。Three.js 场景分块仍有构建体积提示，尚未进行手机实机、低端帧率或原生平台验收。

专项脚本默认将重测证据写到忽略目录 `test-results/publishing/`；显式设置 `CAPTURE_GAME_EVIDENCE=1` 才更新此目录的提交截图。浏览器可通过 `CHROMIUM_PATH` / `PLAYWRIGHT_EXECUTABLE_PATH` 指定，未指定时优先系统 Chromium，再回退到 Playwright 的浏览器。
