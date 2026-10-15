# 围捕小队：恢复原版美术

本轮修复用户在 TapTap 手机客户端看到的简化界面。用户确认主要问题是视觉与 H5 原版差距，而非触摸完全失效；不改游戏规则、存档、解锁、提示算法及广告行为，也不修改三款共用输入桥。

## 设计依据

沿用已经生成并实现的 [四屏效果图](../../../local/cops-robbers/docs/design/viewport-refresh-2026-10-10/viewport-concept.png)、[390px 首页实图](../../../local/cops-robbers/docs/design/viewport-refresh-2026-10-10/actual-390x844-home.png)与[游玩实图](../../../local/cops-robbers/docs/design/publishing-2026-10-14/screenshots/01-surround-challenge.png)，恢复原版风格，不另造一套皮肤。

- 竖屏。首页复用追逃插画、天空蓝/薄荷绿背景、奶油面板和金黄色主按钮；开始、选关、玩法和帮助保留已有语义入口。
- 游玩复用花园背景和同一份角色图集，路网与触点仍由已有关卡数据生成。高屏使用原版的纵向布局映射，减少正方形棋盘下的大块空白；选中、可达路口、出口与提示持续清晰可见。
- 选关、准备、暂停和结算使用相同圆角纸面控件。按下有可见反馈。主要触控区域保持至少44逻辑像素，遵循安全区与胶囊；暂停图标使用两根实心竖条。
- Tap 不能直接运行网页 DOM/CSS。复用原版源图片和图集中的嵌入 WebP，构建时原字节复制/提取；Canvas 仅负责对应布局与绘制，不复制核心规则。资源缺失仍保留可玩的底图，验证必须检查实际图片加载和角色绘制，不能以非空画面替代美术验收。

## 验证

先新增素材打包回归：原实现失败于 `Missing original home-chase.webp`。恢复后核对图片原字节、构建来源指纹和官方 ZIP；在真实 Creator 浏览器产物中以手机尺寸检查首页、选关、游玩、暂停、结算及返回，并保留触屏移动、取消、解锁与存档回归。

手机用户截图已确认旧包视觉问题。桌面引擎截图只能证明恢复后的构建画面；新包仍需 TapTap 手机客户端复验。

## 本地验证结果

- Windows、Node 24.21.0、pnpm 12.6.0、Creator 3.8.8、Chrome 155.0.8059.40；桌面鼠标与触屏模拟。
- `node --test games/minigames/tests/*.test.mjs`：30 项通过，包括原素材原字节复制/提取、图集边界、异步图片回调清理、五模式、角色/先手、胜负、取消、存档和增量范围。
- 真实 Creator Web Mobile 重建通过，浏览器检查共4组（320×568、390×844，各鼠标/触屏）。验证三张原图实际加载及非空图片纹理；走通首页→选关→真实移动→暂停→对抗准备→短场试炼真实胜利→下一关解锁→刷新继续。没有页面错误。
- [旧首页](cops-original-art-2026-10-16/before-home.png)、[新首页](cops-original-art-2026-10-16/creator-home-390.png)、[新棋盘](cops-original-art-2026-10-16/creator-play-390.png)、[320px选关](cops-original-art-2026-10-16/creator-levels-320.png)、[暂停](cops-original-art-2026-10-16/creator-pause-320.png)、[胜利结算](cops-original-art-2026-10-16/creator-result-320.png)均为真实 Creator 浏览器产物截图；[浏览器报告](cops-original-art-2026-10-16/creator-browser.json)记录源码指纹和环境。

本轮未更改原 H5 游戏、共享输入桥和另外两款的界面；未执行公网发布、平台提审、真实广告或新包手机验收。

只读复核补充修正：己方人物热区优先于同一路口，点击人物脚下只选人、不消耗回合；新增单元与真实 Creator 点击断言。三张复用原图也登记到原生增量消费者和 Cocos workflow 路径过滤，保留原 H5 验证。两项回归在修正前均明确失败。

最终 TapTap 包经 Creator 原生重建与官方 v1.2.2 插件转换，13个 JavaScript 文件全部转换成功。ZIP 与实际转换目录逐文件一致，另独立核对 ZIP SHA-256 和三张原图的存在，见[包体记录](cops-original-art-2026-10-16/taptap-package.json)。产物仍是 `preview-build`，未上传、未提审、未标记真机验收。源码改动尚未提交或推送。
