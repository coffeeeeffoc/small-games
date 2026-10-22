# 方向牌线条箭头

原实心箭头在20px方向牌中，箭杆和箭头容易连成十字块。沿用现有牌面与方向投影，将图形改为2px圆端线条：独立箭杆加开放V形箭头，四方向共用同一绘制。首页演示、正式关卡、小屏拖动及横屏使用一致样式；座位票签、点击区域与派车规则未改。

本次为已有图标的局部调整，沿用[页面方案与效果图](../screen-flow-2026-10-23/plan.md)。下列图片均来自本次真实运行。

- 运行源码：`298cc06f64af826512b9f60a0e96a48e8bd37925`。
- bolanggu 的 Creator 3.8.8 Web Mobile 构建；输入指纹：`7319832c0632d06fe9418f77da23d9a273f70cd8c02294d17da98dea3e21b715`。
- 53个制品文件逐个核对SHA-256与长度后导入云环境，源码指纹校验及真实引擎声明类型检查通过。
- Chromium触屏模拟的12组既有浏览器回归全部通过、页面零错误，覆盖首页、选关、派车并行、暂停恢复、奖励回调、通关和开发模式。见[浏览器证据](browser-verification.json)。
- 人工复核[首页四方向](../../../publishing/gameplay/screenshots/home-390.png)、[320×568密集车阵](../../../publishing/gameplay/screenshots/level100-scrolled-320.png)及[844×390横屏](../../../publishing/gameplay/screenshots/level100-844.png)：尖端与箭杆清楚，无填充成块、重描或方向翻转。独立只读复核结论一致。

上架截图和两类视频已按此构建刷新；[录屏输入与结算](recording-input.json)来自1×实际触屏流程，媒体规格与摘要见[媒体清单](../../../publishing/media-verification.json)。以上为真实Cocos的浏览器触屏模拟，不是物理手机或原生广告验收。
